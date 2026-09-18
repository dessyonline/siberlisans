// Harici platform (CyberLab) kullanıcı doğrulama uç noktası için sunucu-only yardımcılar.
import { clientIp, rateLimit } from "@/lib/license-feature.server";
import { mysqlQuery, mysqlOne } from "@/lib/mysql.server";
import { findUserByEmail, verifyPassword } from "@/lib/auth.server";

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

  // 4) identifier → e-posta çözümleme (e-posta veya görünen ad / kullanıcı adı).
  let email = isEmail(identifier) ? identifier.toLowerCase() : "";
  if (!email) {
    const byName = await mysqlQuery<{ email: string | null }>(
      "SELECT email FROM profiles WHERE display_name LIKE ? LIMIT 2",
      [identifier],
    );
    if (byName.length !== 1 || !byName[0]?.email) return json(FAIL, 401);
    email = byName[0].email.toLowerCase();
  }

  // 5) Şifre doğrulama (MySQL tabanlı auth_users tablosu üzerinden).
  const authUser = await findUserByEmail(email);
  const ok = authUser ? await verifyPassword(password, authUser.password_hash) : false;
  if (!ok || !authUser) return json(FAIL, 401);
  const userId = authUser.id;

  // 6) Aktif/geçerli lisans kontrolü: onaylı siparişlere teslim edilmiş, iptal edilmemiş,
  //    süresi dolmamış bir anahtar var mı?
  const activeKey = await mysqlOne<{ id: string }>(
    `SELECT lk.id
       FROM orders o
       JOIN order_keys ok ON ok.order_id = o.id
       JOIN license_keys lk ON lk.id = ok.license_key_id
      WHERE o.user_id = ? AND o.status = 'approved'
        AND (lk.revoked IS NULL OR lk.revoked = 0) AND lk.status <> 'revoked'
        AND (lk.expires_at IS NULL OR lk.expires_at > NOW())
      LIMIT 1`,
    [userId],
  );
  if (!activeKey) return json(FAIL, 401);

  // 7) Profil + rol bilgisi.
  const [profile, roles] = await Promise.all([
    mysqlOne<{ email: string | null; display_name: string | null }>(
      "SELECT email, display_name FROM profiles WHERE id=?",
      [userId],
    ),
    mysqlQuery<{ role: string }>("SELECT role FROM user_roles WHERE user_id=?", [userId]),
  ]);
  const isAdmin = roles.some((r) => r.role === "admin");
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
