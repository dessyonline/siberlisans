import { mysqlExec, mysqlQuery } from "./mysql.server";

/**
 * Şifre sıfırlama.
 * Öncelik: köprüdeki işleme özel (transaction'lı) uç nokta.
 * Köprü henüz güncellenmemişse tek ifadelik atomik UPDATE ile yürütülür.
 */
export async function resetPasswordAtomically(token: string, passwordHash: string): Promise<boolean> {
  const url = process.env['MYSQL_BRIDGE_URL'];
  const secret = process.env['MYSQL_BRIDGE_TOKEN'];
  if (!url || !secret) throw new Error('MySQL köprü ayarları eksik');

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
    throw new Error('Güvenli şifre işlemi kullanılamıyor');
  }

  // Köprü eski sürüm: işleme özel uç noktayı tanımıyor. Atomik tek ifade ile devam et.
  if (response.status !== 400) throw new Error('Güvenli şifre işlemi kullanılamıyor');

  if (!/^[a-f0-9]{64}$/.test(token)) return false;

  const affected = await mysqlExec(
    `UPDATE auth_users u
        JOIN auth_password_tokens t ON t.user_id = u.id
         SET u.password_hash = ?, t.used = 1
       WHERE t.token = ? AND t.used = 0 AND t.expires_at > NOW()`,
    [passwordHash, token],
  );
  if (affected === 0) return false;

  const owner = await mysqlQuery<{ user_id: string }>(
    'SELECT user_id FROM auth_password_tokens WHERE token=? LIMIT 1',
    [token],
  );
  const userId = owner[0]?.user_id;
  if (userId) {
    await mysqlExec('UPDATE auth_password_tokens SET used=1 WHERE user_id=? AND used=0', [userId]);
    await mysqlExec('DELETE FROM auth_sessions WHERE user_id=?', [userId]);
  }
  return true;
}
