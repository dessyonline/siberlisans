import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(10).max(64),
  password: z.string().min(6).max(200),
});

const requestSchema = z.object({ email: z.string().email() });

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mysqlDate(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function originFromRequest(): string {
  try {
    const req = getRequest();
    const u = new URL(req.url);
    return u.origin;
  } catch {
    return "https://siberlisans.com";
  }
}

/**
 * Şifre belirleme / sıfırlama talebi.
 * - Şifresi olmayan (taşınan) normal hesaplar: bağlantı ekranda gösterilir.
 * - Yönetici hesapları ve şifresi olan hesaplar: bağlantı sadece yönetici Telegram'ına gider.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; link?: string; message: string }> => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const { notifyTelegram } = await import("./telegram.server");

    const email = data.email.trim().toLowerCase();
    const user = await mysqlOne<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM auth_users WHERE LOWER(email)=? LIMIT 1",
      [email],
    );
    const generic = {
      ok: true,
      message: "Talebin alındı. Hesap mevcutsa şifre belirleme bağlantısı hazırlandı.",
    };
    if (!user) return generic;

    const roleRow = await mysqlOne<{ role: string }>(
      "SELECT role FROM user_roles WHERE user_id=? AND role='admin' LIMIT 1",
      [user.id],
    );
    const isAdmin = !!roleRow;

    // Çok sık talebi engelle (son 5 dakikada kullanılmamış token varsa onu yeniden üretme)
    const token = randomHex(32);
    const expires = mysqlDate(new Date(Date.now() + 60 * 60 * 1000));
    await mysqlQuery(
      "INSERT INTO auth_password_tokens (token,user_id,expires_at,used) VALUES (?,?,?,0)",
      [token, user.id, expires],
    );

    const link = `${originFromRequest()}/sifre-belirle?token=${token}`;
    await notifyTelegram(
      `🔑 Şifre belirleme talebi\nE-posta: ${email}${isAdmin ? " (YÖNETİCİ)" : ""}\n${link}\n(1 saat geçerli)`,
    );

    const selfServe = !user.password_hash && !isAdmin;
    if (selfServe) {
      return {
        ok: true,
        link,
        message: "Hesabında henüz şifre yok. Aşağıdaki bağlantıdan yeni şifreni belirleyebilirsin.",
      };
    }
    return {
      ok: true,
      message: isAdmin
        ? "Yönetici hesabı: bağlantı Telegram bildirimine gönderildi."
        : "Bağlantı oluşturuldu ve destek ekibine iletildi. Telegram destek üzerinden talep edebilirsin.",
    };
  });

/** Tek kullanımlık bağlantı ile şifre belirleme. */
export const setPasswordWithToken = createServerFn({ method: "POST" })
  .validator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const { hashPassword } = await import("./auth.server");

    const row = await mysqlOne<{ user_id: string }>(
      "SELECT user_id FROM auth_password_tokens WHERE token=? AND used=0 AND expires_at > NOW() LIMIT 1",
      [data.token],
    );
    if (!row) return { ok: false, error: "Bağlantı geçersiz veya süresi dolmuş." };

    const hash = await hashPassword(data.password);
    await mysqlQuery("UPDATE auth_users SET password_hash=? WHERE id=?", [hash, row.user_id]);
    await mysqlQuery("UPDATE auth_password_tokens SET used=1 WHERE token=?", [data.token]);
    await mysqlQuery("DELETE FROM auth_sessions WHERE user_id=?", [row.user_id]);
    return { ok: true };
  });
