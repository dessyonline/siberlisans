// Shared helpers for feature endpoints (/chat, /session, /source-code, etc.)
// - License gating (403 if missing/inactive/expired/revoked)
// - Simple in-memory per-license rate limiter
import { CORS, clientIp, json } from "@/lib/license-api.server";
import { mysqlOne } from "@/lib/mysql.server";
import { logEventMysql } from "@/lib/license-mysql.server";

export { CORS, json, clientIp };

export type FeatureBody = Record<string, unknown> & {
  licenseKey?: string;
  license_key?: string;
};

const INTERNAL_PROXY_FIELDS = new Set([
  "licenseKey",
  "license_key",
  "email",
  "token",
  "projectId",
]);

export async function readJsonBody(request: Request): Promise<FeatureBody> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON object expected");
  }
  return parsed as FeatureBody;
}

export function cleanProxyBody(body: FeatureBody, extraInternalFields: string[] = []): Record<string, unknown> {
  const blocked = new Set([...INTERNAL_PROXY_FIELDS, ...extraInternalFields]);
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined).filter(([key]) => !blocked.has(key)),
  );
}

export function extractLicenseKey(request: Request, body: FeatureBody): string {
  const header = request.headers.get("x-license-key") ?? "";
  const raw = header || (body?.licenseKey ?? body?.license_key ?? "");
  return raw.toString().trim().toUpperCase();
}

export async function verifyLicense(license_key: string): Promise<
  | { ok: true; row: { id: string; status: string; expires_at: string | null; revoked: boolean; activated_at: string | null } }
  | { ok: false; status: number; error: string }
> {
  if (!license_key) return { ok: false, status: 400, error: "licenseKey gerekli." };
  let data: { id: string; status: string; expires_at: string | null; revoked: number | null; activated_at: string | null } | null;
  try {
    data = await mysqlOne(
      "SELECT id,status,expires_at,revoked,activated_at FROM license_keys WHERE key_value=?",
      [license_key],
    );
  } catch {
    return { ok: false, status: 500, error: "Doğrulama hatası." };
  }
  if (!data) return { ok: false, status: 403, error: "Geçersiz veya süresi dolmuş lisans." };
  // Aktif kabul: revoke edilmemiş + süresi dolmamış + aktive edilmiş (activated_at set)
  if (data.revoked || data.status === "revoked") {
    return { ok: false, status: 403, error: "Lisans iptal edilmiş." };
  }
  if (!data.activated_at) {
    return { ok: false, status: 403, error: "Lisans henüz aktive edilmemiş." };
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 403, error: "Lisansın süresi dolmuş." };
  }
  return { ok: true, row: { ...data, revoked: !!data.revoked } };
}


// In-memory fallback (used only when the shared store is unreachable).
const buckets = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/**
 * Shared, restart-proof fixed-window rate limit stored in the database, so the
 * limit holds across worker restarts and multiple instances.
 */
export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  try {
    const { mysqlExec, mysqlOne, num } = await import("@/lib/mysql.server");
    await mysqlExec(
      `INSERT INTO api_rate_limits (bucket, window_start, hits) VALUES (?,?,1)
       ON DUPLICATE KEY UPDATE
         hits = IF(window_start < VALUES(window_start), 1, hits + 1),
         window_start = IF(window_start < VALUES(window_start), VALUES(window_start), window_start)`,
      [key.slice(0, 191), windowStart],
    );
    const row = await mysqlOne<{ hits: number | string }>(
      "SELECT hits FROM api_rate_limits WHERE bucket=? AND window_start=?",
      [key.slice(0, 191), windowStart],
    );
    const hits = num(row?.hits) ?? 1;
    return hits <= limit;
  } catch {
    // Store unreachable — degrade to the per-instance limiter instead of allowing everything.
    return rateLimit(key, limit, windowMs);
  }
}

export async function gate(
  request: Request,
  opts?: { rateLimit?: { limit: number; windowMs: number }; eventName?: string },
): Promise<
  | { ok: true; body: FeatureBody; license_key: string; ip: string; ua: string }
  | { response: Response }
> {
  let body: FeatureBody;
  try {
    body = await readJsonBody(request);
  } catch {
    return { response: json({ ok: false, error: "Geçersiz JSON." }, 400) };
  }
  const license_key = extractLicenseKey(request, body);
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const verified = await verifyLicense(license_key);
  if (!verified.ok) {
    if (license_key) {
      await logEventMysql({
        license_key,
        event: "fail",
        hwid: null,
        ip,
        user_agent: ua,
        detail: (opts?.eventName ?? "feature") + ":" + verified.error,
      });
    }
    return { response: json({ ok: false, error: verified.error }, verified.status) };
  }
  if (opts?.rateLimit) {
    const okRate = await rateLimitShared(
      (opts.eventName ?? "feat") + ":" + license_key,
      opts.rateLimit.limit,
      opts.rateLimit.windowMs,
    );
    if (!okRate) {
      return {
        response: json({ ok: false, error: "Çok fazla istek. Lütfen bekleyin." }, 429),
      };
    }
  }
  return { ok: true, body, license_key, ip, ua };
}
