import { mysqlOne } from "./mysql.server";

const TOKEN_RE = /^[a-f0-9]{32,64}$/;

/**
 * Şifre sıfırlama — tek SQL ifadesinde (tek transaction) token tüketimi,
 * şifre güncelleme, diğer token'ları kapatma ve oturumları sonlandırma.
 */
export async function resetPasswordAtomically(token: string, passwordHash: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const row = await mysqlOne<{ n: number }>(
    `WITH claimed AS (
       UPDATE auth_password_tokens SET used=1 WHERE token=? AND used=0 AND expires_at > NOW() RETURNING user_id
     ), u AS (
       UPDATE auth_users SET password_hash=? WHERE id IN (SELECT user_id FROM claimed) RETURNING id
     ), t AS (
       UPDATE auth_password_tokens SET used=1 WHERE user_id IN (SELECT id FROM u) AND used=0 RETURNING 1
     ), s AS (
       DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM u) RETURNING 1
     )
     SELECT COUNT(*) AS n FROM u`,
    [token, passwordHash],
  );
  return Number(row?.n ?? 0) > 0;
}

/** Bağlantı hâlâ geçerli mi? Sayfa açıldığında kullanıcıya net bilgi vermek için. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const row = await mysqlOne<{ token: string }>(
    'SELECT token FROM auth_password_tokens WHERE token=? AND used=0 AND expires_at > NOW() LIMIT 1',
    [token],
  );
  return Boolean(row);
}
