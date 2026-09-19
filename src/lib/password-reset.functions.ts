import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{32,64}$/),
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

/** Şifre belirleme / sıfırlama talebi. Bağlantı yalnızca kayıtlı e-postaya gider. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; link?: string; message: string }> => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const { sendPasswordResetEmail } = await import("./gmail.server");

    const email = data.email.trim().toLowerCase();
    const user = await mysqlOne<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM auth_users WHERE LOWER(email)=? LIMIT 1",
      [email],
    );
    const generic = {
      ok: true,
      message: "Hesabın mevcutsa şifre sıfırlama bağlantısı e-posta adresine gönderildi. Spam klasörünü de kontrol et.",
    };
    if (!user) return generic;

    const recent = await mysqlOne<{ token: string }>(
      "SELECT token FROM auth_password_tokens WHERE user_id=? AND used=0 AND expires_at > DATE_ADD(NOW(), INTERVAL 23 HOUR) LIMIT 1",
      [user.id],
    );
    const token = recent?.token ?? randomHex(32);
    if (!recent) {
      const expires = mysqlDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      await mysqlQuery(
        "INSERT INTO auth_password_tokens (token,user_id,expires_at,used) VALUES (?,?,?,0)",
        [token, user.id, expires],
      );
    }

    const link = `https://siberlisans.com/sifre-belirle?token=${token}`;
    const delivered = await sendPasswordResetEmail(email, link);
    if (!delivered) {
      if (!recent) await mysqlQuery("DELETE FROM auth_password_tokens WHERE token=?", [token]);
      return { ok: false, message: "Şifre sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin." };
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
