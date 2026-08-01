// Harici platform (CyberLab) kullanıcı doğrulama uç noktası için sunucu-only yardımcılar.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { clientIp, rateLimit } from "@/lib/license-feature.server";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const FAIL = {
  success: false,
  error: "Geçersiz kullanıcı bilgileri veya süresi dolmuş lisans.",
} as const;

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** POST /api/v1/auth/verify iş mantığı. */
export async function handleExternalVerify(request: Request): Promise<Response> {
  // 1) Opsiyonel API anahtarı doğrulaması (secret tanımlıysa zorunlu).
  const apiKey = process.env.CYBERLAB_API_KEY;
  if (apiKey) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${apiKey}`) {
      return json({ success: false, error: "Yetkisiz istek." }, 401);
    }
  }

  // 2) Kaba kuvvet koruması (IP başına 20 istek / dakika).
  const ip = clientIp(request) || "unknown";
  if (!rateLimit("extauth:" + ip, 20, 60_000)) {
    return json({ success: false, error: "Çok fazla istek. Lütfen bekleyin." }, 429);
  }

  // 3) Girdi doğrulama.
  let body: { identifier?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ success: false, error: "Geçersiz JSON." }, 400);
  }
  const identifier = (body?.identifier ?? "").toString().trim();
  const password = (body?.password ?? "").toString();
  if (!identifier || identifier.length > 200 || !password || password.length > 200) {
    return json(FAIL, 401);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 4) identifier → e-posta çözümleme (e-posta veya görünen ad / kullanıcı adı).
  let email = isEmail(identifier) ? identifier.toLowerCase() : "";
  if (!email) {
    const { data: byName } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("display_name", identifier)
      .limit(2);
    if (!byName || byName.length !== 1 || !byName[0]?.email) return json(FAIL, 401);
    email = byName[0].email.toLowerCase();
  }

  // 5) Şifre doğrulama (publishable key ile, oturum saklanmaz).
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return json({ success: false, error: "Sunucu yapılandırması eksik." }, 500);
  }
  const authClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  const userId = signIn?.user?.id;
  if (signInError || !userId) return json(FAIL, 401);
  await authClient.auth.signOut().catch(() => undefined);

  // 6) Aktif/geçerli lisans kontrolü: onaylı siparişlere teslim edilmiş, iptal edilmemiş,
  //    süresi dolmamış bir anahtar var mı?
  const { data: orderRows } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .limit(500);
  const orderIds = (orderRows ?? []).map((o) => o.id);
  if (orderIds.length === 0) return json(FAIL, 401);

  const { data: keyRows } = await supabaseAdmin
    .from("order_keys")
    .select("license_key_id")
    .in("order_id", orderIds)
    .not("license_key_id", "is", null)
    .limit(500);
  const keyIds = (keyRows ?? []).map((k) => k.license_key_id).filter(Boolean) as string[];
  if (keyIds.length === 0) return json(FAIL, 401);

  const nowIso = new Date().toISOString();
  const { data: activeKeys } = await supabaseAdmin
    .from("license_keys")
    .select("id")
    .in("id", keyIds)
    .eq("revoked", false)
    .neq("status", "revoked")
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1);
  if (!activeKeys || activeKeys.length === 0) return json(FAIL, 401);

  // 7) Profil + rol bilgisi.
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabaseAdmin.from("profiles").select("email,display_name").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const finalEmail = profile?.email ?? email;
  const displayName = profile?.display_name ?? finalEmail.split("@")[0];

  return json({
    success: true,
    user: {
      username: finalEmail.split("@")[0],
      email: finalEmail,
      display_name: displayName,
      role: isAdmin ? "admin" : "student",
    },
  });
}
