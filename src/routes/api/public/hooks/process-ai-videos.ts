import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery, mysqlOne, num } from "@/lib/mysql.server";

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

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid(): string {
  return crypto.randomUUID();
}

function aspectRatioForFal(aspect: string) {
  // fal expects "16:9" | "9:16" | "1:1" for most video models
  if (aspect === "9:16" || aspect === "1:1") return aspect;
  return "16:9";
}

function parseParams(v: unknown): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  try {
    return JSON.parse(String(v));
  } catch {
    return {};
  }
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

/** Ports `worker_claim_ai_jobs` RPC to MySQL. */
async function claimAiJobs(limit: number) {
  const jobs = await mysqlQuery<{ id: string; params: unknown; prompt: string }>(
    "SELECT id, params, prompt FROM ai_jobs WHERE status='queued' AND kind='video' ORDER BY created_at ASC LIMIT ?",
    [limit],
  );
  for (const j of jobs) {
    await mysqlQuery("UPDATE ai_jobs SET status='processing', updated_at=? WHERE id=? AND status='queued'", [ts(), j.id]);
  }
  return jobs;
}

/** Ports `worker_pending_ai_jobs` RPC to MySQL. */
async function pendingAiJobs(limit: number) {
  return mysqlQuery<{
    id: string;
    user_id: string;
    provider_request_id: string | null;
    provider_model: string | null;
    updated_at: string | null;
    created_at: string;
  }>(
    "SELECT id, user_id, provider_request_id, provider_model, updated_at, created_at FROM ai_jobs WHERE status='processing' AND provider_request_id IS NOT NULL ORDER BY updated_at ASC LIMIT ?",
    [limit],
  );
}

/** Ports `worker_set_provider_request` RPC to MySQL. */
async function setProviderRequest(jobId: string, reqId: string, model: string) {
  await mysqlQuery("UPDATE ai_jobs SET provider_request_id=?, provider_model=?, updated_at=? WHERE id=?", [reqId, model, ts(), jobId]);
}

/** Ports `worker_complete_ai_job` RPC to MySQL. */
async function completeAiJob(jobId: string, url: string) {
  await mysqlQuery("UPDATE ai_jobs SET status='done', result_url=?, updated_at=? WHERE id=? AND status IN ('queued','processing')", [url, ts(), jobId]);
  const job = await mysqlOne<{ user_id: string }>("SELECT user_id FROM ai_jobs WHERE id=?", [jobId]);
  if (job) {
    await mysqlQuery(
      "INSERT INTO notifications (id,user_id,type,title,body,meta,created_at) VALUES (?,?,?,?,?,?,?)",
      [uid(), job.user_id, "ai_video_ready", "Videon hazır", "AI videon tamamlandı — indirebilirsin.", JSON.stringify({ job: jobId, url }), ts()],
    );
  }
}

/** Ports `worker_fail_ai_job` RPC to MySQL. */
async function failAiJob(jobId: string, reason: string, refund = true) {
  const job = await mysqlOne<{ user_id: string; cost_try: string | number }>("SELECT user_id, cost_try FROM ai_jobs WHERE id=?", [jobId]);
  if (!job) return;
  if (refund) {
    const cost = num(job.cost_try) ?? 0;
    await mysqlQuery("UPDATE wallets SET balance_try = balance_try + ? WHERE user_id=?", [cost, job.user_id]);
    await mysqlQuery(
      "INSERT INTO wallet_transactions (id,user_id,direction,amount_try,reason,meta,created_at) VALUES (?,?,?,?,?,?,?)",
      [uid(), job.user_id, "credit", cost, "ai_video_refund", JSON.stringify({ job: jobId }), ts()],
    );
    await mysqlQuery("UPDATE ai_jobs SET status='refunded', error=?, updated_at=? WHERE id=?", [reason, ts(), jobId]);
  } else {
    await mysqlQuery("UPDATE ai_jobs SET status='failed', error=?, updated_at=? WHERE id=?", [reason, ts(), jobId]);
  }
}

async function persistToStorage(sourceUrl: string, userId: string, jobId: string): Promise<string> {
  // Storage moved off Supabase Storage; keep the provider (fal.ai) URL directly.
  // fal.ai result URLs are stable and publicly accessible, so no re-upload is required.
  void userId;
  void jobId;
  return sourceUrl;
}

async function processQueued(key: string): Promise<{ submitted: number; errors: string[] }> {
  const jobs = await claimAiJobs(5);
  const errors: string[] = [];
  let submitted = 0;
  for (const job of jobs) {
    const params = parseParams(job.params) as { quality?: Quality; aspect?: string; duration?: number };
    const q = params.quality ?? "fast";
    const model = MODEL_MAP[q] ?? MODEL_MAP.fast;
    const input: Record<string, unknown> = {
      prompt: job.prompt,
      aspect_ratio: aspectRatioForFal(params.aspect ?? "16:9"),
      duration: String(params.duration ?? 5),
    };
    try {
      const r = await falSubmit(model, input, key);
      await setProviderRequest(job.id, r.request_id, model);
      submitted++;
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${job.id}: ${msg}`);
      await failAiJob(job.id, `submit_failed: ${msg}`.slice(0, 500), true);
    }
  }
  return { submitted, errors };
}

async function processPending(key: string): Promise<{ done: number; failed: number; errors: string[] }> {
  const jobs = await pendingAiJobs(20);
  const errors: string[] = [];
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    if (!job.provider_request_id || !job.provider_model) continue;
    const ageMs = Date.now() - new Date(job.updated_at ?? job.created_at).getTime();
    if (ageMs > 30 * 60 * 1000) {
      await failAiJob(job.id, "timeout_30min", true);
      failed++;
      continue;
    }
    try {
      const st = await falStatus(job.provider_model, job.provider_request_id, key);
      if (st.status === "COMPLETED") {
        const res = await falResult(job.provider_model, job.provider_request_id, key);
        const videoUrl = extractVideoUrl(res);
        if (!videoUrl) {
          await failAiJob(job.id, "no_video_url_in_result", true);
          failed++;
          continue;
        }
        const persisted = await persistToStorage(videoUrl, job.user_id, job.id);
        await completeAiJob(job.id, persisted);
        done++;
      } else if (st.status === "FAILED" || st.status === "CANCELED") {
        await failAiJob(job.id, `provider_${st.status.toLowerCase()}`, true);
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
        try {
          const submitted = await processQueued(key);
          const pending = await processPending(key);
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
