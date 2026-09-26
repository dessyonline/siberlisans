/**
 * MySQL diyalektindeki SQL'i PostgreSQL'e çevirir ve parametreleri güvenli
 * literal olarak gömer. Uygulama kodu MySQL yazımıyla kalır; veritabanı Supabase.
 */

export type PgMeta = {
  /** Her tabloda boolean olan sütun adları. */
  boolCols: Set<string>;
  /** tablo -> benzersiz indeks sütunları (primary sonda). */
  uniques: Map<string, string[][]>;
};

type Param = string | number | boolean | null | undefined;

export function pgLiteral(v: Param): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "'true'" : "'false'";
  const s = String(v).replace(/\u0000/g, "");
  return `'${s.replace(/'/g, "''")}'`;
}

/** Tırnaklar dışında kalan kod parçalarına fn uygular. */
function mapCode(sql: string, fn: (code: string) => string, mysqlEscapes = false, singleOnly = false): string {
  let out = "";
  let buf = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || (ch === '"' && !singleOnly)) {
      out += fn(buf);
      buf = "";
      let j = i + 1;
      while (j < sql.length) {
        if (mysqlEscapes && sql[j] === "\\" && ch === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      let lit = sql.slice(i, j + 1);
      if (mysqlEscapes && ch === "'" && lit.includes("\\")) {
        // MySQL kaçışlarını standart SQL'e çevir
        lit = "'" + lit.slice(1, -1).replace(/\\'/g, "''").replace(/\\\\/g, "\\") + "'";
      }
      out += lit;
      i = j + 1;
      continue;
    }
    buf += ch;
    i++;
  }
  return out + fn(buf);
}

/** NAME( ... ) çağrılarını dengeli parantezle bulup yeniden yazar. */
function rewriteFn(sql: string, name: string, fn: (args: string[], raw: string) => string): string {
  const re = new RegExp(`\\b${name}\\s*\\(`, "i");
  let guard = 0;
  let from = 0;
  for (;;) {
    const rest = sql.slice(from);
    const m = re.exec(rest);
    if (!m || guard++ > 500) return sql;
    const start = from + m.index;
    let i = start + m[0].length;
    let depth = 1;
    const args: string[] = [];
    let cur = "";
    let q: string | null = null;
    for (; i < sql.length; i++) {
      const c = sql[i];
      if (q) {
        cur += c;
        if (c === q) q = null;
        continue;
      }
      if (c === "'" || c === '"') {
        q = c;
        cur += c;
        continue;
      }
      if (c === "(") depth++;
      if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
      if (c === "," && depth === 1) {
        args.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    args.push(cur);
    const inner = args.map((a) => rewriteFn(a, name, fn).trim());
    const replacement = fn(inner, sql.slice(start, i + 1));
    sql = sql.slice(0, start) + replacement + sql.slice(i + 1);
    from = start + replacement.length;
  }
}

const DATE_FMT: Record<string, string> = {
  "%Y": "YYYY", "%m": "MM", "%d": "DD", "%H": "HH24", "%i": "MI", "%s": "SS", "%y": "YY",
};

export function isDdl(sql: string): boolean {
  return false;
}

export function showColumnsTable(sql: string): string | null {
  const m = /^\s*show\s+columns\s+from\s+[`"]?([A-Za-z0-9_]+)[`"]?\s*$/i.exec(sql);
  return m ? m[1] : null;
}

export function translate(sqlIn: string, params: Param[], meta: PgMeta): string {
  let sql = sqlIn.trim().replace(/;\s*$/, "");

  // 1) Parametreleri gömme + backtick -> çift tırnak (tırnaklar dışında)
  let p = 0;
  sql = mapCode(sql, (code) =>
    code.replace(/`/g, '"').replace(/\?/g, () => {
      if (p >= params.length) throw new Error("SQL parametre sayısı eksik");
      return pgLiteral(params[p++]);
    }),
    true,
  );

  // 2) Fonksiyon çevirileri
  sql = rewriteFn(sql, "DATE_FORMAT", ([x, f]) => {
    const fmt = (f ?? "").replace(/%[a-zA-Z]/g, (t) => DATE_FMT[t] ?? t);
    return `to_char(${x}, ${fmt})`;
  });
  sql = rewriteFn(sql, "DATE_SUB", ([a, b]) => `((${a}) - (${b}))`);
  sql = rewriteFn(sql, "DATE_ADD", ([a, b]) => `((${a}) + (${b}))`);
  sql = rewriteFn(sql, "WEEKDAY", ([x]) => `(EXTRACT(ISODOW FROM ${x})::int - 1)`);
  sql = rewriteFn(sql, "GROUP_CONCAT", ([x]) => {
    const m = /^([\s\S]*?)\s+SEPARATOR\s+('(?:[^']|'')*')$/i.exec(x);
    return m ? `string_agg((${m[1]})::text, ${m[2]})` : `string_agg((${x})::text, ',')`;
  });
  sql = rewriteFn(sql, "JSON_CONTAINS", ([a, b]) => `((${a})::jsonb @> (${b})::jsonb)`);
  sql = rewriteFn(sql, "IF", ([c, a, b]) => `(CASE WHEN ${c} THEN ${a} ELSE ${b} END)`);
  sql = rewriteFn(sql, "IFNULL", ([a, b]) => `COALESCE(${a}, ${b})`);

  // 3) Basit kod dönüşümleri (literal dışı)
  sql = mapCode(sql, (code) =>
    code
      .replace(/\bUUID\s*\(\s*\)/gi, "gen_random_uuid()")
      .replace(/\bUTC_TIMESTAMP\s*\(\s*\)/gi, "NOW()")
      .replace(/\bCURDATE\s*\(\s*\)/gi, "CURRENT_DATE")
      .replace(/\bDATABASE\s*\(\s*\)/gi, "current_schema()")
      .replace(/\bRAND\s*\(\s*\)/gi, "random()")
      .replace(/\bNOT\s+LIKE\b/gi, "NOT ILIKE")
      .replace(/(?<!NOT\s)\bLIKE\b/gi, "ILIKE"),
  );
  // INTERVAL <ifade> <birim>  (literal parametre de olabilir)
  sql = sql.replace(
    /\bINTERVAL\s+('(?:[^']|'')*'|-?\d+(?:\.\d+)?|\([^()]*\)|[A-Za-z_][\w.]*(?:\([^()]*\))?)\s+(SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR)\b/gi,
    (_m, e: string, u: string) => `(CAST(${e} AS double precision) * INTERVAL '1 ${u.toLowerCase()}')`,
  );

  // Anahtar kelime olan çıplak takma adlar (… day, / … month FROM)
  sql = mapCode(sql, (code) =>
    code.replace(/(\)|\b\w+)\s+(day|month|year|hour|minute|second|week)(?=\s*,|\s+FROM\b|\s*$)/gi, (m, pre: string, a: string) =>
      /^\d|^(BY|SELECT|AND|OR|WHERE|ON|THEN|ELSE|AS|DISTINCT|WHEN|IN|NOT|CASE|INTERVAL)$/i.test(pre) ? m : `${pre} AS "${a.toLowerCase()}"`,
    ),
  );

  // 4) Boolean sütunlarda 0/1 karşılaştırma ve atamaları
  if (meta.boolCols.size) {
    sql = mapCode(sql, (code) =>
      code.replace(
        /((?:\b[A-Za-z_]\w*\.)?"?([A-Za-z_]\w*)"?\s*(?:=|!=|<>)\s*)([01])\b(?!\s*[.\d])/g,
        (m, head: string, col: string, v: string) =>
          meta.boolCols.has(col.toLowerCase()) ? `${head}${v === "1" ? "true" : "false"}` : m,
      ),
      false,
      true,
    );
    // VALUES listesinde boolean sütuna 0/1 literal
    sql = fixInsertBoolLiterals(sql, meta);
  }

  // 5) INSERT IGNORE / ON DUPLICATE KEY UPDATE
  if (/^\s*INSERT\s+IGNORE\b/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+IGNORE\b/i, "INSERT") + " ON CONFLICT DO NOTHING";
  }
  const dup = /\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i.exec(sql);
  if (dup) {
    const head = sql.slice(0, dup.index);
    let tail = sql.slice(dup.index + dup[0].length);
    tail = tail.replace(/\bVALUES\s*\(\s*"?([A-Za-z_]\w*)"?\s*\)/gi, 'EXCLUDED."$1"');
    const im = /^\s*INSERT\s+INTO\s+"?([A-Za-z_]\w*)"?\s*\(([^)]*)\)/i.exec(head);
    const table = im?.[1] ?? "";
    const cols = (im?.[2] ?? "").split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase());
    const cands = meta.uniques.get(table) ?? [];
    const target = cands.find((u) => u.every((c) => cols.includes(c))) ?? cands[cands.length - 1];
    if (!target) throw new Error(`ON DUPLICATE KEY için benzersiz anahtar bulunamadı: ${table}`);
    tail = splitTop(tail)
      .map((a) => {
        const eq = a.indexOf("=");
        if (eq < 0) return a;
        const lhs = a.slice(0, eq);
        const rhs = mapCode(a.slice(eq + 1), (code) =>
          code.replace(/(^|[^\w."$])([A-Za-z_]\w*)\b(?!\s*[.(])/g, (m, pre: string, id: string) =>
            SQL_WORDS.test(id) ? m : `${pre}"${table}"."${id}"`,
          ),
        );
        return `${lhs}=${rhs}`;
      })
      .join(",");
    sql = `${head} ON CONFLICT (${target.map((c) => `"${c}"`).join(",")}) DO UPDATE SET ${tail}`;
  }
  return sql;
}

const SQL_WORDS =
  /^(EXCLUDED|NULL|NOW|TRUE|FALSE|AND|OR|NOT|IS|IN|THEN|ELSE|END|CASE|WHEN|AS|INTERVAL|CAST|DOUBLE|PRECISION|SECOND|MINUTE|HOUR|DAY|WEEK|MONTH|YEAR|CURRENT_DATE|CURRENT_TIMESTAMP|TEXT|JSONB|INT|INTEGER|NUMERIC|BIGINT|BOOLEAN|TIMESTAMPTZ)$/i;

/** Parantez ve tırnak dışındaki virgüllerden böler. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = "";
  for (const c of s) {
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') q = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function fixInsertBoolLiterals(sql: string, meta: PgMeta): string {
  const m = /^(\s*INSERT(?:\s+IGNORE)?\s+INTO\s+"?[A-Za-z_]\w*"?\s*\(([^)]*)\)\s*VALUES\s*)/i.exec(sql);
  if (!m) return sql;
  const cols = m[2].split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase());
  const boolIdx = cols.map((c, i) => (meta.boolCols.has(c) ? i : -1)).filter((i) => i >= 0);
  if (!boolIdx.length) return sql;
  let rest = sql.slice(m[1].length);
  let out = m[1];
  // Her (...) grubunu işle
  for (;;) {
    const open = rest.search(/\S/);
    if (open < 0 || rest[open] !== "(") break;
    let depth = 0;
    let q: string | null = null;
    let end = -1;
    const parts: string[] = [];
    let cur = "";
    for (let i = open; i < rest.length; i++) {
      const c = rest[i];
      if (q) {
        cur += c;
        if (c === q) q = null;
        continue;
      }
      if (c === "'" || c === '"') {
        q = c;
        cur += c;
        continue;
      }
      if (c === "(") {
        depth++;
        if (depth === 1) continue;
      }
      if (c === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      if (c === "," && depth === 1) {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    if (end < 0) break;
    parts.push(cur);
    for (const i of boolIdx) {
      const v = parts[i]?.trim();
      if (v === "0" || v === "'0'") parts[i] = "false";
      else if (v === "1" || v === "'1'") parts[i] = "true";
    }
    out += rest.slice(0, open) + "(" + parts.join(",") + ")";
    rest = rest.slice(end + 1);
    const comma = /^\s*,/.exec(rest);
    if (!comma) break;
    out += comma[0];
    rest = rest.slice(comma[0].length);
  }
  return out + rest;
}

const ISO_TS = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)(?:\.\d+)?(?:\+00:00|Z)$/;

/** PG JSON satırını MySQL köprüsünün döndürdüğü biçime yaklaştırır. */
export function mysqlizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === true) o[k] = 1;
    else if (v === false) o[k] = 0;
    else if (typeof v === "string") {
      const m = ISO_TS.exec(v);
      o[k] = m ? `${m[1]} ${m[2]}` : v;
    } else if (v !== null && typeof v === "object") o[k] = JSON.stringify(v);
    else o[k] = v;
  }
  return o;
}
