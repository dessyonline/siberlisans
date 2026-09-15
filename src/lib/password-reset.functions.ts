import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(10).max(64),
  password: z.string().min(6).max(200),
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
