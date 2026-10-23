// Server-only helpers for the public license API endpoints.
// Central place for HMAC signing, replay/nonce guard and event logging.
import { createHmac, timingSafeEqual } from "crypto";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-license-key",
  "Access-Control-Max-Age": "86400",
} as const;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** Server-side bearer check for administrative license endpoints. */
export function isAuthorizedAdminRequest(request: Request): boolean {
  const expected = process.env.LICENSE_ADMIN_TOKEN;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!expected || !token) return false;

  const provided = Buffer.from(token);
  const configured = Buffer.from(expected);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

/** Deterministic canonical JSON for HMAC input. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k])).join(",") + "}";
}

export function signPayload(payload: unknown): string {
  const secret = process.env.LICENSE_HMAC_SECRET;
  if (!secret) throw new Error("LICENSE_HMAC_SECRET is not configured.");
  return createHmac("sha256", secret).update(canonical(payload)).digest("hex");
}

export function maskKey(k: string) {
  const s = (k ?? "").toString();
  return s.length <= 8 ? s : s.slice(0, 7) + "**";
}
export function maskHwid(h: string) {
  const s = (h ?? "").toString();
  return s.length <= 8 ? s : "**" + s.slice(-8);
}

export function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ||
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    ""
  );
}

/**
 * Reject stale timestamps (±5 min) and previously seen nonces.
 * Returns null on OK, or an error Response.
 */
export async function guardReplay(
  supabaseAdmin: { from: (t: string) => { insert: (r: unknown) => Promise<{ error: { code?: string; message: string } | null }> } },
  license_key: string,
  ts: unknown,
  nonce: unknown,
): Promise<Response | null> {
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > REPLAY_WINDOW_MS) {
    return json({ success: false, valid: false, error: "Geçersiz istek." }, 400);
  }
  const n = (nonce ?? "").toString().trim();
  if (!n || n.length < 6 || n.length > 128) {
    return json({ success: false, valid: false, error: "Geçersiz istek." }, 400);
  }
  const { error } = await supabaseAdmin.from("license_nonces").insert({
    nonce: n,
    license_key,
  });
  if (error) {
    // Unique violation → replay
    if (error.code === "23505") {
      return json({ success: false, valid: false, error: "Geçersiz istek." }, 409);
    }
    // Any storage failure must fail closed; otherwise replay protection is bypassed.
    console.error("[license-api] nonce insert failed", error.message);
    return json({ success: false, valid: false, error: "Doğrulama geçici olarak kullanılamıyor." }, 503);
  }
  return null;
}

/** Deterministic per-license/HWID unlock key (base64, 32 bytes). */
export function deriveUnlockKey(license_key: string, hwid: string): string {
  const secret = process.env.LICENSE_HMAC_SECRET;
  if (!secret) throw new Error("LICENSE_HMAC_SECRET is not configured.");
  const raw = createHmac("sha256", secret)
    .update("unlock:v1|" + license_key + "|" + hwid)
    .digest();
  return raw.toString("base64");
}

export async function logEvent(
  supabaseAdmin: { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } },
  entry: {
    license_key: string;
    event:
      | "activate"
      | "validate"
      | "revoke"
      | "fail"
      | "admin_create"
      | "admin_revoke"
      | "unlock"
      | "tampering";
    hwid?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    detail?: string | null;
  },
): Promise<void> {
  try {
    await supabaseAdmin.from("license_events").insert({
      license_key: entry.license_key,
      event: entry.event,
      hwid: entry.hwid ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.user_agent ?? null,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    console.error("[license-api] event log failed", (e as Error).message);
  }
}
