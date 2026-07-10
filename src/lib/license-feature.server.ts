// Shared helpers for feature endpoints (/chat, /session, /source-code, etc.)
// - License gating (403 if missing/inactive/expired/revoked)
// - Simple in-memory per-license rate limiter
import { CORS, clientIp, json, logEvent } from "@/lib/license-api.server";

export { CORS, json, clientIp };

export type FeatureBody = Record<string, unknown> & {
  licenseKey?: string;
  license_key?: string;
};

export function extractLicenseKey(request: Request, body: FeatureBody): string {
  const header = request.headers.get("x-license-key") ?? "";
  const raw = header || (body?.licenseKey ?? body?.license_key ?? "");
  return raw.toString().trim().toUpperCase();
}

export async function verifyLicense(license_key: string): Promise<
  | { ok: true; row: { id: string; status: string; expires_at: string | null; revoked: boolean } }
  | { ok: false; status: number; error: string }
> {
  if (!license_key) return { ok: false, status: 400, error: "licenseKey gerekli." };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("license_keys")
    .select("id,status,expires_at,revoked")
    .eq("key_value", license_key)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Doğrulama hatası." };
  if (!data) return { ok: false, status: 403, error: "Geçersiz veya süresi dolmuş lisans." };
  if (data.revoked || data.status !== "active") {
    return { ok: false, status: 403, error: "Geçersiz veya süresi dolmuş lisans." };
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 403, error: "Geçersiz veya süresi dolmuş lisans." };
  }
  return { ok: true, row: data as never };
}

// Simple per-key sliding window rate limit (in-memory, per worker instance).
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

export async function gate(
  request: Request,
  opts?: { rateLimit?: { limit: number; windowMs: number }; eventName?: string },
): Promise<
  | { ok: true; body: FeatureBody; license_key: string; ip: string; ua: string }
  | { response: Response }
> {
  let body: FeatureBody;
  try {
    body = (await request.json()) as FeatureBody;
  } catch {
    return { response: json({ ok: false, error: "Geçersiz JSON." }, 400) };
  }
  const license_key = extractLicenseKey(request, body);
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const verified = await verifyLicense(license_key);
  if (!verified.ok) {
    if (license_key) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await logEvent(supabaseAdmin as never, {
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
    const okRate = rateLimit(
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
