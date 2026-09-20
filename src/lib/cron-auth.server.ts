import { timingSafeEqual } from "crypto";

/**
 * Shared authentication for scheduled/internal hook endpoints under
 * /api/public/hooks/*.
 *
 * The public (publishable/anon) key MUST NOT be accepted here: it ships in the
 * browser bundle, so anyone could trigger notifications, renewals, campaigns or
 * paid AI jobs.
 *
 * Accepted credentials (in order):
 *   1. CRON_SECRET                 — dedicated scheduler secret (preferred)
 *   2. SUPABASE_SERVICE_ROLE_KEY   — server-only key, fallback
 *
 * Send it as `x-cron-secret: <value>` or `Authorization: Bearer <value>`.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function isCronAuthorized(request: Request): boolean {
  const secrets = [process.env["CRON_SECRET"], process.env["SUPABASE_SERVICE_ROLE_KEY"]].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (secrets.length === 0) return false;

  const header = request.headers.get("x-cron-secret") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const provided = header || bearer;
  if (!provided) return false;

  return secrets.some((s) => safeEqual(provided, s));
}

/** Returns a 401 Response when the caller is not an authorized scheduler, else null. */
export function requireCron(request: Request): Response | null {
  if (isCronAuthorized(request)) return null;
  return new Response("Unauthorized", { status: 401 });
}
