import { mysqlExec, mysqlOne } from "./mysql.server";

const TOKEN_RE = /^[a-f0-9]{32,64}$/;

/**
 * Şifre sıfırlama.
 * Öncelik: köprüdeki işleme özel (transaction'lı) uç nokta.
 * Köprü henüz güncellenmemişse tek ifadelik atomik token tüketimi ile yürütülür.
 */
export async function resetPasswordAtomically(token: string, passwordHash: string): Promise<boolean> {
  const url = process.env['MYSQL_BRIDGE_URL'];
  const secret = process.env['MYSQL_BRIDGE_TOKEN'];
  if (!url || !secret) throw new Error('MySQL köprü ayarları eksik');
  if (!TOKEN_RE.test(token)) return false;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': secret },
    body: JSON.stringify({ operation: 'reset_password', token, passwordHash }),
  });

  if (response.ok) {
    const result: unknown = await response.json();
    if (result && typeof result === 'object' && 'ok' in result && typeof result.ok === 'boolean') {
      return result.ok;
    }
  }

  // Köprü eski sürüm: işleme özel uç noktayı tanımıyor. Tek ifadelik token tüketimi ile devam et.
  // Token'i önce "used=1" yapmak yarış durumunda yalnızca tek isteğin kazanmasını garanti eder.
  const claimed = await mysqlExec(
    'UPDATE auth_password_tokens SET used=1 WHERE token=? AND used=0 AND expires_at > NOW()',
    [token],
  );
  if (claimed === 0) return false;

  const owner = await mysqlOne<{ user_id: string }>(
    'SELECT user_id FROM auth_password_tokens WHERE token=? LIMIT 1',
    [token],
  );
  const userId = owner?.user_id;
  if (!userId) return false;

  await mysqlExec('UPDATE auth_users SET password_hash=? WHERE id=?', [passwordHash, userId]);
  await mysqlExec('UPDATE auth_password_tokens SET used=1 WHERE user_id=? AND used=0', [userId]);
  await mysqlExec('DELETE FROM auth_sessions WHERE user_id=?', [userId]);
  return true;
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
