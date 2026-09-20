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
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("köprü hatası (429") ||
    m.includes("too many requests") ||
    m.includes("rate limit") ||
    m.includes("istek sınırı") ||
    m.includes("köprü hatası (5") ||
    m.includes("köprü geçersiz yanıt")
  );
}

/** Köprüdeki bağlantı limitini aşmamak için eşzamanlı istek sınırı. */
const MAX_CONCURRENT = 1;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
}

function release() {
  active--;
  const next = waiting.shift();
  if (next) next();
}

const MAX_ATTEMPTS = 7;

async function bridgeCall(sql: string, params: Params): Promise<any> {
  const url = process.env["MYSQL_BRIDGE_URL"];
  const token = process.env["MYSQL_BRIDGE_TOKEN"];
  if (!url || !token) throw new Error("MySQL köprü ayarları eksik");

  await acquire();
  try {
    let lastError: Error = new Error("MySQL köprüsüne ulaşılamadı");
    let retryAfterMs = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delay = Math.max(
          retryAfterMs,
          Math.min(4000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 180),
        );
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Bridge-Token": token },
          body: JSON.stringify({ sql, params }),
        });
        const text = await res.text();
        const retryAfter = Number(res.headers.get("retry-after"));
        retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(10_000, retryAfter * 1000)
          : res.status === 429
            ? 2000
            : 0;
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`Köprü geçersiz yanıt verdi (${res.status})`);
        }
        if (!res.ok || json?.error) {
          const detail = typeof json?.error === "string" ? `: ${json.error}` : "";
          throw new Error(`Köprü hatası (${res.status})${detail}`);
        }
        return json;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!isTransient(lastError.message)) throw lastError;
      }
    }
    throw lastError;
  } finally {
    release();
  }
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
