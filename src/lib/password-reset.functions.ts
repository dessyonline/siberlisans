import { createServerFn } from "@tanstack/react-start";
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

/**
 * Şifre belirleme / sıfırlama talebi.
 * Bağlantı yalnızca destek ekibine iletilir; hesap sahipliği doğrulanmadan
 * istekte bulunana asla döndürülmez.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; link?: string; message: string }> => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const { sendTelegram } = await import("./telegram.server");

    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
      return { ok: false, message: "Şifre belirleme bildirimi şu anda gönderilemiyor. Lütfen destek ekibiyle iletişime geçin." };
    }

    const email = data.email.trim().toLowerCase();
    const user = await mysqlOne<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM auth_users WHERE LOWER(email)=? LIMIT 1",
      [email],
    );
    const generic = {
      ok: true,
      message: "Talebin alındı. Hesabın mevcutsa destek ekibi, hesap sahipliğini doğruladıktan sonra şifre belirlemene yardımcı olacak.",
    };
    if (!user) return generic;

    const roleRow = await mysqlOne<{ role: string }>(
      "SELECT role FROM user_roles WHERE user_id=? AND role='admin' LIMIT 1",
      [user.id],
    );
    const isAdmin = !!roleRow;

    const recent = await mysqlOne<{ token: string }>(
      "SELECT token FROM auth_password_tokens WHERE user_id=? AND used=0 AND expires_at > DATE_ADD(NOW(), INTERVAL 55 MINUTE) LIMIT 1",
      [user.id],
    );
    if (recent) return generic;

    const token = randomHex(32);
    const expires = mysqlDate(new Date(Date.now() + 60 * 60 * 1000));
    await mysqlQuery(
      "INSERT INTO auth_password_tokens (token,user_id,expires_at,used) VALUES (?,?,?,0)",
      [token, user.id, expires],
    );

    const link = `https://siberlisans.com/sifre-belirle?token=${token}`;
    const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const delivered = await sendTelegram({
      chatId,
      text: `🔑 Şifre belirleme talebi\nE-posta: ${escapeHtml(email)}${isAdmin ? " (YÖNETİCİ)" : ""}\n${escapeHtml(link)}\n(1 saat geçerli)\nHesap sahipliğini doğrulamadan bağlantıyı paylaşmayın.`,
    });
    if (!delivered.ok) {
      await mysqlQuery("DELETE FROM auth_password_tokens WHERE token=?", [token]);
      return { ok: false, message: "Şifre belirleme bildirimi gönderilemedi. Lütfen destek ekibiyle iletişime geçin." };
    }
    return generic;
  });

/** Tek kullanımlık bağlantı ile şifre belirleme. */
export const setPasswordWithToken = createServerFn({ method: "POST" })
  .validator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { resetPasswordAtomically } = await import("./password-reset.server");
    const { hashPassword } = await import("./auth.server");
    const hash = await hashPassword(data.password);
    try {
      const ok = await resetPasswordAtomically(data.token, hash);
      return ok ? { ok: true } : { ok: false, error: "Bağlantı geçersiz veya süresi dolmuş." };
    } catch {
      return { ok: false, error: "Güvenli şifre belirleme şu anda kullanılamıyor. Lütfen destek ekibiyle iletişime geçin." };
    }
  });
