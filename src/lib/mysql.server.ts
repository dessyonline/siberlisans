/**
 * MySQL erişim katmanı (Hostinger PHP köprüsü üzerinden).
 * Sadece sunucu tarafında kullanılır.
 */

type Params = Array<string | number | boolean | null>;

/** Geçici (yeniden denenebilir) bağlantı hataları. */
function isTransient(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("database connection failed") ||
    m.includes("too many connections") ||
    m.includes("max_user_connections") ||
    m.includes("lost connection") ||
    m.includes("server has gone away") ||
    m.includes("deadlock") ||
    m.includes("lock wait timeout") ||
    m.includes("köprü hatası (5") ||
    m.includes("köprü geçersiz yanıt")
  );
}

async function bridgeCall(sql: string, params: Params): Promise<any> {
  const url = process.env["MYSQL_BRIDGE_URL"];
  const token = process.env["MYSQL_BRIDGE_TOKEN"];
  if (!url || !token) throw new Error("MySQL köprü ayarları eksik");

  let lastError: Error = new Error("MySQL köprüsüne ulaşılamadı");
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * attempt));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
        body: JSON.stringify({ sql, params }),
      });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Köprü geçersiz yanıt verdi (${res.status})`);
      }
      if (!res.ok || json?.error) {
        throw new Error(json?.error ?? `Köprü hatası (${res.status})`);
      }
      return json;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isTransient(lastError.message)) throw lastError;
    }
  }
  throw lastError;
}

export async function mysqlQuery<T = Record<string, unknown>>(
  sql: string,
  params: Params = [],
): Promise<T[]> {
  const json = await bridgeCall(sql, params);
  return (json.rows ?? []) as T[];
}

export async function mysqlOne<T = Record<string, unknown>>(
  sql: string,
  params: Params = [],
): Promise<T | null> {
  const rows = await mysqlQuery<T>(sql, params);
  return rows[0] ?? null;
}

/** MySQL DECIMAL/TEXT sayıları JS number'a çevirir. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** MySQL tinyint(1) -> boolean */
export function bool(v: unknown): boolean {
  return v === 1 || v === "1" || v === true;
}

/** INSERT/UPDATE/DELETE için etkilenen satır sayısını döndürür. */
export async function mysqlExec(sql: string, params: Params = []): Promise<number> {
  const json = await bridgeCall(sql, params);
  return Number(json.rowCount ?? 0);
}
