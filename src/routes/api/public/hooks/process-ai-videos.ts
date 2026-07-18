import { createFileRoute } from "@tanstack/react-router";

// Fal.ai queue-based video generation worker.
// Called by pg_cron every minute. For each queued job: submit to fal.ai.
// For each processing job with a request_id: poll fal.ai, on success persist to storage and mark done.

const FAL_BASE = "https://queue.fal.run";

type Quality = "fast" | "hd" | "cinematic";

// Model mapping — chosen for cost/quality balance on fal.ai
const MODEL_MAP: Record<Quality, string> = {
  fast: "fal-ai/ltx-video",
  hd: "fal-ai/kling-video/v1.6/standard/text-to-video",
  cinematic: "fal-ai/kling-video/v2/master/text-to-video",
};

function aspectRatioForFal(aspect: string) {
  // fal expects "16:9" | "9:16" | "1:1" for most video models
  if (aspect === "9:16" || aspect === "1:1") return aspect;
  return "16:9";
}

async function falSubmit(model: string, input: Record<string, unknown>, key: string) {
  const res = await fetch(`${FAL_BASE}/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal_submit_${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { request_id: string; status_url?: string; response_url?: string };
}

async function falStatus(model: string, requestId: string, key: string) {
  const res = await fetch(`${FAL_BASE}/${model}/requests/${requestId}/status`, {
    headers: { "Authorization": `Key ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal_status_${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { status: string; logs?: unknown };
}

async function falResult(model: string, requestId: string, key: string) {
  const res = await fetch(`${FAL_BASE}/${model}/requests/${requestId}`, {
    headers: { "Authorization": `Key ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal_result_${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { video?: { url: string }; output?: { url?: string }; [k: string]: unknown };
}

function extractVideoUrl(result: Awaited<ReturnType<typeof falResult>>): string | null {
  if (result.video?.url) return result.video.url;
  if (result.output?.url) return result.output.url;
  // some models return { video: "url" } directly or { videos: [{url}] }
  const anyR = result as Record<string, unknown>;
  if (typeof anyR.video === "string") return anyR.video as string;
  if (Array.isArray(anyR.videos) && anyR.videos.length > 0) {
    const v = anyR.videos[0] as { url?: string } | string;
    return typeof v === "string" ? v : v.url ?? null;
  }
  return null;
}

async function persistToStorage(
  supabaseAdmin: {
    storage: {
      from: (b: string) => {
        upload: (p: string, buf: Uint8Array, o: { contentType: string; upsert: boolean }) => Promise<{ error: unknown }>;
        createSignedUrl: (p: string, exp: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
      };
    };
  },
  sourceUrl: string,
  userId: string,
  jobId: string,
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`fetch_source_${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const path = `${userId}/${jobId}.mp4`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("ai-videos")
    .upload(path, buf, { contentType: "video/mp4", upsert: true });
  if (upErr) throw new Error(`upload: ${JSON.stringify(upErr)}`);
  // Signed URL valid for 30 days
  const { data, error: sErr } = await supabaseAdmin.storage
    .from("ai-videos")
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (sErr || !data) throw new Error(`sign: ${JSON.stringify(sErr)}`);
  return data.signedUrl;
}

async function processQueued(supabaseAdmin: any, key: string): Promise<{ submitted: number; errors: string[] }> {
  const { data: jobs, error } = await supabaseAdmin.rpc("worker_claim_ai_jobs", { _limit: 5 });
  if (error) throw new Error(`claim: ${error.message}`);
  const errors: string[] = [];
  let submitted = 0;
  for (const job of jobs ?? []) {
    const q = (job.params?.quality ?? "fast") as Quality;
    const model = MODEL_MAP[q] ?? MODEL_MAP.fast;
    const input: Record<string, unknown> = {
      prompt: job.prompt,
      aspect_ratio: aspectRatioForFal(job.params?.aspect ?? "16:9"),
      duration: String(job.params?.duration ?? 5),
    };
    try {
      const r = await falSubmit(model, input, key);
      await supabaseAdmin.rpc("worker_set_provider_request", {
        _job: job.id,
        _req_id: r.request_id,
        _model: model,
      });
      submitted++;
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${job.id}: ${msg}`);
      // Refund on submit failure
      await supabaseAdmin.rpc("worker_fail_ai_job", {
        _job: job.id,
        _reason: `submit_failed: ${msg}`.slice(0, 500),
        _refund: true,
      });
    }
  }
  return { submitted, errors };
}

async function processPending(supabaseAdmin: any, key: string): Promise<{ done: number; failed: number; errors: string[] }> {
  const { data: jobs, error } = await supabaseAdmin.rpc("worker_pending_ai_jobs", { _limit: 20 });
  if (error) throw new Error(`pending: ${error.message}`);
  const errors: string[] = [];
  let done = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    if (!job.provider_request_id || !job.provider_model) continue;
    // Auto-refund jobs stuck > 30 min
    const ageMs = Date.now() - new Date(job.updated_at ?? job.created_at).getTime();
    if (ageMs > 30 * 60 * 1000) {
      await supabaseAdmin.rpc("worker_fail_ai_job", {
        _job: job.id,
        _reason: "timeout_30min",
        _refund: true,
      });
      failed++;
      continue;
    }
    try {
      const st = await falStatus(job.provider_model, job.provider_request_id, key);
      if (st.status === "COMPLETED") {
        const res = await falResult(job.provider_model, job.provider_request_id, key);
        const videoUrl = extractVideoUrl(res);
        if (!videoUrl) {
          await supabaseAdmin.rpc("worker_fail_ai_job", {
            _job: job.id,
            _reason: "no_video_url_in_result",
            _refund: true,
          });
          failed++;
          continue;
        }
        const persisted = await persistToStorage(supabaseAdmin, videoUrl, job.user_id, job.id);
        await supabaseAdmin.rpc("worker_complete_ai_job", { _job: job.id, _url: persisted });
        done++;
      } else if (st.status === "FAILED" || st.status === "CANCELED") {
        await supabaseAdmin.rpc("worker_fail_ai_job", {
          _job: job.id,
          _reason: `provider_${st.status.toLowerCase()}`,
          _refund: true,
        });
        failed++;
      }
      // IN_QUEUE / IN_PROGRESS: leave as processing
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${job.id}: ${msg}`);
    }
  }
  return { done, failed, errors };
}

export const Route = createFileRoute("/api/public/hooks/process-ai-videos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Simple auth via apikey header (Supabase anon key expected)
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const key = process.env.FAL_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "FAL_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const submitted = await processQueued(supabaseAdmin as any, key);
          const pending = await processPending(supabaseAdmin as any, key);
          return new Response(
            JSON.stringify({ ok: true, submitted, pending }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
