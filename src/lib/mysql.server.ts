/**
 * MySQL erişim katmanı (Hostinger PHP köprüsü üzerinden).
 * Sadece sunucu tarafında kullanılır.
 *
 * - HTTP durumu gövde çözümlenmeden önce sınıflandırılır (HTML/boş 429 dahil).
 * - Retry-After talimatı kısaltılmadan uygulanır; worker genelinde geri çekilir.
 * - Kuyruk, gerçek (dinamik) eşzamanlılık sınırını aşmaz.
 * - Kuyruk + bekleme + fetch + body için toplam süre sınırı vardır; süresi dolan
 *   istek SQL göndermez.
 * - Belirsiz ağ/sunucu hatalarından sonra yazma SQL'i tekrar çalıştırılmaz.
 */

import { isDdl, mysqlizeRow, pgLiteral, showColumnsTable, translate, type PgMeta } from "@/lib/db/pg-translate";

type Params = Array<string | number | boolean | null>;

/** Veritabanı geçici olarak ulaşılamaz (oturum geçersizliği DEĞİL). */
export class MysqlUnavailableError extends Error {
  readonly code = "DB_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "MysqlUnavailableError";
  }
}

export function isMysqlUnavailable(err: unknown): err is MysqlUnavailableError {
  return err instanceof MysqlUnavailableError || (err as { code?: string })?.code === "DB_UNAVAILABLE";
}

const cfg = {
  hardMax: Math.min(4, Math.max(1, Number(process.env["MYSQL_BRIDGE_MAX_CONCURRENT"] ?? 4) || 1)),
  totalBudgetMs: 8_000,
  maxAttempts: 2,
  defaultThrottleMs: 2_000,
};

let limit = cfg.hardMax;
let okStreak = 0;
let active = 0;
let pausedUntil = 0;
type Waiter = {
  resolve: () => void;
  reject: (e: Error) => void;
  deadline: number;
  timer: ReturnType<typeof setTimeout>;
};
const waiting: Waiter[] = [];
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function pump() {
  const now = Date.now();
  if (now < pausedUntil) {
    if (!pumpTimer && waiting.length) {
      pumpTimer = setTimeout(() => {
        pumpTimer = null;
        pump();
      }, pausedUntil - now);
    }
    return;
  }
  while (active < limit && waiting.length) {
    const w = waiting.shift();
    if (!w) break;
    clearTimeout(w.timer);
    if (Date.now() >= w.deadline) {
      w.reject(new MysqlUnavailableError("Veritabanı kuyruğu zaman aşımına uğradı"));
      continue;
    }
    active++;
    w.resolve();
  }
}

function noteThrottled(retryAfterMs: number) {
  okStreak = 0;
  limit = Math.max(1, limit - 1);
  pausedUntil = Math.max(pausedUntil, Date.now() + retryAfterMs);
}

function noteSuccess() {
  okStreak++;
  if (okStreak >= 20 && limit < cfg.hardMax) {
    limit++;
    okStreak = 0;
    pump();
  }
}

function acquire(deadline: number): Promise<void> {
  if (active < limit && Date.now() >= pausedUntil && waiting.length === 0) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const w: Waiter = {
      resolve,
      reject,
      deadline,
      timer: setTimeout(() => {
        const i = waiting.indexOf(w);
        if (i >= 0) waiting.splice(i, 1);
        reject(new MysqlUnavailableError("Veritabanı kuyruğu zaman aşımına uğradı"));
      }, Math.max(0, deadline - Date.now())),
    };
    waiting.push(w);
    pump();
  });
}

function release() {
  active = Math.max(0, active - 1);
  pump();
}

/** Retry-After: saniye veya HTTP tarihi. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const s = Number(value.trim());
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const t = Date.parse(value);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

/** Yalnızca okuma yapan SQL (tekrar denemesi güvenli). */
export function isReadOnlySql(sql: string): boolean {
  const s = sql.replace(/^\s*(\/\*[\s\S]*?\*\/\s*)*/, "").trimStart().toLowerCase();
  if (/\bfor\s+update\b|\block\s+in\s+share\s+mode\b|\binto\s+outfile\b/.test(s)) return false;
  return /^(select|show|describe|desc|explain)\b/.test(s);
}

/** Bridge JSON hatası: sorgu çalışmadan önce reddedildiği kesin olanlar. */
function isPreExecutionDbError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("database connection failed") ||
    m.includes("too many connections") ||
    m.includes("max_user_connections")
  );
}

function isDeadlock(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("deadlock") || m.includes("lock wait timeout");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let metaPromise: Promise<PgMeta> | null = null;
function loadMeta(): Promise<PgMeta> {
  if (!metaPromise) {
    metaPromise = (async () => {
      const b = await rawCall(
        `SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public'
         GROUP BY column_name HAVING bool_and(data_type='boolean')`,
      );
      const u = await rawCall(
        `SELECT t.relname AS t, i.indisprimary AS p,
                array_agg(a.attname::text ORDER BY k.ord) AS cols
         FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
         CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
         WHERE n.nspname='public' AND i.indisunique AND i.indpred IS NULL
         GROUP BY t.relname, i.indexrelid, i.indisprimary ORDER BY i.indisprimary`,
      );
      const uniques = new Map<string, string[][]>();
      for (const r of u.rows as Array<{ t: string; cols: string[] | string }>) {
        const colsArr: string[] = typeof r.cols === "string" ? JSON.parse(r.cols) : r.cols;
        const list = uniques.get(r.t) ?? [];
        list.push(colsArr.map((c) => c.toLowerCase()));
        uniques.set(r.t, list);
      }
      return {
        boolCols: new Set((b.rows as Array<{ c: string }>).map((r) => r.c.toLowerCase())),
        uniques,
      };
    })().catch((e) => {
      metaPromise = null;
      throw e;
    });
  }
  return metaPromise;
}

async function bridgeCall(sql: string, params: Params): Promise<any> {
  if (isDdl(sql)) return { rows: [], rowCount: 0 }; // şema Supabase'te hazır
  const showTable = showColumnsTable(sql);
  if (showTable) {
    return rawCall(
      `SELECT column_name AS "Field", data_type AS "Type", is_nullable AS "Null",
              column_default AS "Default", '' AS "Extra"
       FROM information_schema.columns WHERE table_schema='public' AND table_name=${pgLiteral(showTable)}
       ORDER BY ordinal_position`,
      true,
    );
  }
  const meta = await loadMeta();
  return rawCall(translate(sql, params, meta), isReadOnlySql(sql));
}

function supabaseRpcConfig(): { url: string; key: string } {
  const base = (process.env["EXT_SUPABASE_URL"] ?? "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env["EXT_SUPABASE_SERVICE_ROLE_KEY"];
  if (!base || !key) throw new Error("Supabase veritabanı ayarları eksik");
  return { url: `${base}/rest/v1/rpc/exec_sql`, key };
}

async function rawCall(sql: string, readOnlyHint?: boolean): Promise<any> {
  const { url, key } = supabaseRpcConfig();

  const deadline = Date.now() + cfg.totalBudgetMs;
  const readOnly = readOnlyHint ?? isReadOnlySql(sql);
  let lastError: Error = new MysqlUnavailableError("MySQL köprüsüne ulaşılamadı");
  let retry = true;

  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    if (!retry) break; // belirsiz hata sonrası yazma tekrar edilmez
    if (attempt > 0) {
      const backoff = Math.min(2000, 250 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 150);
      if (Date.now() + backoff >= deadline) break;
      await sleep(backoff);
    }
    await acquire(deadline); // global Retry-After beklemesi burada uygulanır
    retry = false;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new MysqlUnavailableError("Veritabanı isteği zaman aşımına uğradı");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), remaining);
      let res: Response;
      let text: string;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ q: sql }),
          signal: ctrl.signal,
        });
        text = await res.text();
      } catch {
        // Belirsiz: istek sunucuya ulaşmış ve çalışmış olabilir.
        lastError = new MysqlUnavailableError(
          ctrl.signal.aborted ? "Veritabanı isteği zaman aşımına uğradı" : "Veritabanına ulaşılamadı",
        );
        retry = readOnly;
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 429) {
        // Sunucu isteği reddetti -> SQL çalışmadı; yazma dahil tekrar güvenli.
        const ra = parseRetryAfter(res.headers.get("retry-after"));
        const wait = ra ?? cfg.defaultThrottleMs;
        noteThrottled(wait);
        lastError = new MysqlUnavailableError("Veritabanı istek sınırına ulaşıldı (429)");
        if (Date.now() + wait >= deadline) break; // talimatı kısaltmak yerine hızlı başarısız ol
        retry = true;
        continue;
      }
      if (res.status >= 500) {
        lastError = new MysqlUnavailableError(`Veritabanı köprüsü geçici hata verdi (${res.status})`);
        retry = readOnly;
        continue;
      }

      let json: any;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (json === null || typeof json !== "object") {
        if (!res.ok) throw new Error(`Köprü hatası (${res.status})`);
        lastError = new MysqlUnavailableError(`Köprü geçersiz yanıt verdi (${res.status})`);
        retry = readOnly;
        continue;
      }
      if (!res.ok || json.error) {
        const detail =
          typeof json.message === "string" ? json.message : typeof json.error === "string" ? json.error : "";
        if (isPreExecutionDbError(detail)) {
          lastError = new MysqlUnavailableError("Veritabanı bağlantısı kurulamadı");
          retry = true;
          continue;
        }
        if (isDeadlock(detail)) {
          // MySQL deadlock'ta ifadeyi geri alır; tek ifade için tekrar güvenli.
          lastError = new MysqlUnavailableError("Veritabanı kilit çakışması");
          retry = true;
          continue;
        }
        if (process.env["DB_DEBUG_SQL"] === "1") console.error("[db] sql hatası:", detail, "|", sql.slice(0, 400));
        throw new Error(`Köprü hatası (${res.status})${detail ? `: ${detail}` : ""}`);
      }
      noteSuccess();
      return {
        rows: Array.isArray(json.rows) ? json.rows.map(mysqlizeRow) : [],
        rowCount: Number(json.rowCount ?? 0),
      };
    } finally {
      release();
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

/** Yalnızca testler için. */
export const __bridgeTest = {
  configure(o: Partial<typeof cfg>) {
    Object.assign(cfg, o);
    limit = cfg.hardMax;
  },
  /** Testlerde şema bilgisini ağdan çekmeden sağlar. */
  setMeta(meta: PgMeta) {
    metaPromise = Promise.resolve(meta);
  },
  reset() {
    metaPromise = Promise.resolve({ boolCols: new Set<string>(), uniques: new Map<string, string[][]>() });
    cfg.hardMax = 2;
    cfg.totalBudgetMs = 8_000;
    cfg.maxAttempts = 2;
    cfg.defaultThrottleMs = 2_000;
    limit = cfg.hardMax;
    okStreak = 0;
    active = 0;
    pausedUntil = 0;
    for (const w of waiting.splice(0)) clearTimeout(w.timer);
    if (pumpTimer) clearTimeout(pumpTimer);
    pumpTimer = null;
  },
  state: () => ({ limit, active, queued: waiting.length, pausedUntil }),
};
