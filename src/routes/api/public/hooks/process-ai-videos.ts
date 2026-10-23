import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery, mysqlOne, mysqlExec, num } from "@/lib/mysql.server";
import { requireCron } from "@/lib/cron-auth.server";

// Fal.ai queue-based video generation worker.
// Called by pg_cron every minute. For each queued job: submit to fal.ai.
// For each processing job with a request_id: poll fal.ai, on success persist to storage and mark done.

const FAL_BASE = "https://queue.fal.run";

type Quality = "fast" | "hd" | "cinematic" | "audio" | "audio_premium";

// Model eşlemesi — fiyatlar ai-tools.functions.ts ile aynı katmanda tutulur.
const MODEL_MAP: Record<Quality, string> = {
  fast: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
  hd: "bytedance/seedance-2.0/fast/text-to-video",
  cinematic: "bytedance/seedance-2.5/text-to-video",
  audio: "fal-ai/veo3.1/fast",
  audio_premium: "fal-ai/veo3.1",
};

function buildInput(q: Quality, prompt: string, aspect: string, duration: number): Record<string, unknown> {
  if (q === "audio" || q === "audio_premium") {
    return {
      prompt,
      aspect_ratio: aspect === "9:16" ? "9:16" : "16:9",
      duration: "8s",
      resolution: "720p",
      generate_audio: true,
    };
  }

  const clipDuration = duration === 10 ? 10 : 5;
  const base = {
    prompt,
    aspect_ratio: aspectRatioForFal(aspect),
    duration: String(clipDuration),
  };

  // Kling 2.5 Turbo Pro kendi varsayılan çözünürlüğünü kullanır.
  // Hızlı katmanda sesi kapalı tutarak maliyeti öngörülebilir tutar.
  if (q === "fast") return base;

  // Seedance katmanlarında senkron ses üretimi aynı akışta çalışır.
  return { ...base, resolution: "720p", generate_audio: true };
}

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
  const claimed: typeof jobs = [];
  for (const j of jobs) {
    // Yalnızca bu çalıştırma gerçekten sahiplendiyse işle (çift gönderim olmasın).
    const n = await mysqlExec("UPDATE ai_jobs SET status='processing', updated_at=? WHERE id=? AND status='queued'", [ts(), j.id]);
    if (n === 1) claimed.push(j);
  }
  return claimed;
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
  // Önce durumu koşullu değiştir: iade yalnızca bir kez yapılır.
  const n = await mysqlExec(
    "UPDATE ai_jobs SET status=?, error=?, updated_at=? WHERE id=? AND status IN ('queued','processing')",
    [refund ? "refunded" : "failed", reason, ts(), jobId],
  );
  if (n !== 1 || !refund) return;
  const job = await mysqlOne<{ user_id: string; params: unknown }>("SELECT user_id, params FROM ai_jobs WHERE id=?", [jobId]);
  if (!job) return;
  const p = parseParams(job.params) as { from_wallet?: number; from_credits?: number; from_sub?: number; sub_id?: string | null };
  const fromWallet = Number(p.from_wallet ?? 0); // eski (₺) işler
  const fromCredits = Number(p.from_credits ?? 0);
  if (fromCredits > 0) {
    await mysqlQuery(
      `INSERT INTO ai_credit_wallets (user_id,credits,updated_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE credits=credits+VALUES(credits), updated_at=VALUES(updated_at)`,
      [job.user_id, fromCredits, ts()],
    );
    const c = await mysqlOne<{ credits: unknown }>("SELECT credits FROM ai_credit_wallets WHERE user_id=?", [job.user_id]);
    await mysqlQuery(
      "INSERT INTO ai_credit_transactions (id,user_id,kind,amount,balance_after,job_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), job.user_id, "refund", fromCredits, num(c?.credits) ?? 0, jobId, "video başarısız — iade", ts()],
    );
  }
  const fromSub = Number(p.from_sub ?? 0);
  if (fromSub > 0 && p.sub_id) {
    await mysqlExec("UPDATE ai_subscriptions SET credits_remaining=credits_remaining+? WHERE id=?", [fromSub, p.sub_id]);
  }
  if (fromWallet > 0) {
    await mysqlExec("UPDATE wallets SET balance_try = balance_try + ?, updated_at=? WHERE user_id=?", [fromWallet, ts(), job.user_id]);
    const w = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [job.user_id]);
    await mysqlQuery(
      "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), job.user_id, "refund", fromWallet, num(w?.balance_try) ?? 0, null, `ai_video_refund:${jobId}`, ts()],
    );
  }
}

/** Gönderimi yarıda kalmış (sağlayıcı kimliği yazılamamış) işleri 15 dk sonra iade et. */
async function failStuckJobs() {
  const stuck = await mysqlQuery<{ id: string }>(
    "SELECT id FROM ai_jobs WHERE kind='video' AND status='processing' AND provider_request_id IS NULL AND updated_at < ? LIMIT 20",
    [ts(new Date(Date.now() - 15 * 60 * 1000))],
  );
  for (const j of stuck) await failAiJob(j.id, "stuck_without_provider_request", true);
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
    const input = buildInput(MODEL_MAP[q] ? q : "fast", job.prompt, params.aspect ?? "16:9", params.duration ?? 5);
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
        const unauth = requireCron(request);
        if (unauth) return unauth;
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
          await failStuckJobs();
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
