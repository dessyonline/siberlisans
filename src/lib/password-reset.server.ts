/** No SQL fallback: an outdated Hostinger bridge must fail closed. */
export async function resetPasswordAtomically(token: string, passwordHash: string): Promise<boolean> {
  const url = process.env['MYSQL_BRIDGE_URL'];
  const secret = process.env['MYSQL_BRIDGE_TOKEN'];
  if (!url || !secret) throw new Error('MySQL köprü ayarları eksik');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': secret },
    body: JSON.stringify({ operation: 'reset_password', token, passwordHash }),
  });
  if (!response.ok) throw new Error('Güvenli şifre işlemi kullanılamıyor');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('ok' in result) || typeof result.ok !== 'boolean') {
    throw new Error('Güvenli şifre işlemi kullanılamıyor');
  }
  return result.ok;
}