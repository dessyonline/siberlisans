/**
 * PostgREST benzeri sorgu spesifikasyonunu MySQL'e çeviren katman.
 * Sadece sunucu tarafında çalışır (PHP köprüsü üzerinden).
 */
import { mysqlQuery } from "@/lib/mysql.server";
import { assertIdent, getColumn, getColumns, singular } from "./schema-cache.server";

export type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "like" | "ilike" | "is" | "in" | "not" | "or" | "contains";

export type Filter = { op: FilterOp; col: string; val: unknown; notOp?: string };

export type QuerySpec = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  filters?: Filter[];
  order?: Array<{ col: string; ascending: boolean; nullsFirst?: boolean }>;
  limit?: number;
  range?: { from: number; to: number };
  single?: boolean;
  maybeSingle?: boolean;
  payload?: unknown;
  onConflict?: string;
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
  returning?: boolean;
};

export type QueryResult = { data: unknown; error: { message: string } | null; count?: number | null };

type Param = string | number | boolean | null;

function toParam(v: unknown): Param {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  return JSON.stringify(v);
}

function isoDate(v: unknown): Param {
  if (typeof v === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(v);
    if (m) return `${m[1]} ${m[2]}`;
  }
  return toParam(v);
}

/* ---------------- select parsing ---------------- */

export type SelectPart =
  | { kind: "col"; name: string; alias?: string }
  | { kind: "embed"; table: string; alias: string; inner: string; fkHint?: string };

export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseSelect(sel: string): SelectPart[] {
  return splitTopLevel(sel || "*").map((raw) => {
    const open = raw.indexOf("(");
    if (open > -1 && raw.endsWith(")")) {
      const headRaw = raw.slice(0, open);
      const inner = raw.slice(open + 1, -1);
      let alias: string | undefined;
      let tablePart = headRaw;
      const colon = headRaw.indexOf(":");
      if (colon > -1) {
        alias = headRaw.slice(0, colon).trim();
        tablePart = headRaw.slice(colon + 1).trim();
      }
      let fkHint: string | undefined;
      const bang = tablePart.indexOf("!");
      if (bang > -1) {
        fkHint = tablePart.slice(bang + 1).trim();
        tablePart = tablePart.slice(0, bang).trim();
      }
      return { kind: "embed", table: tablePart, alias: alias ?? tablePart, inner, fkHint } as SelectPart;
    }
    const colon = raw.indexOf(":");
    if (colon > -1) {
      return { kind: "col", alias: raw.slice(0, colon).trim(), name: raw.slice(colon + 1).trim() };
    }
    return { kind: "col", name: raw.trim() };
  });
}

/* ---------------- where building ---------------- */

async function buildWhere(table: string, filters: Filter[]): Promise<{ sql: string; params: Param[] }> {
  const parts: string[] = [];
  const params: Param[] = [];
  for (const f of filters) {
    if (f.op === "or") {
      const sub = String(f.val)
        .split(",")
        .map((piece) => {
          const [col, op, ...rest] = piece.split(".");
          const value = rest.join(".");
          assertIdent(col);
          if (op === "is") {
            if (value === "null") return `\`${col}\` IS NULL`;
            return `\`${col}\` = ${value === "true" ? 1 : 0}`;
          }
          if (op === "ilike" || op === "like") {
            params.push(value.replace(/\*/g, "%"));
            return `\`${col}\` LIKE ?`;
          }
          const sym = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op as string];
          if (!sym) return "1=1";
          params.push(toParam(value));
          return `\`${col}\` ${sym} ?`;
        });
      parts.push(`(${sub.join(" OR ")})`);
      continue;
    }
    assertIdent(f.col);
    const col = `\`${f.col}\``;
    switch (f.op) {
      case "eq": {
        if (f.val === null) parts.push(`${col} IS NULL`);
        else {
          parts.push(`${col} = ?`);
          params.push(toParam(f.val));
        }
        break;
      }
      case "neq": {
        parts.push(`(${col} <> ? OR ${col} IS NULL)`);
        params.push(toParam(f.val));
        break;
      }
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const sym = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[f.op];
        parts.push(`${col} ${sym} ?`);
        params.push(isoDate(f.val));
        break;
      }
      case "like":
      case "ilike": {
        parts.push(`${col} LIKE ?`);
        params.push(String(f.val).replace(/\*/g, "%"));
        break;
      }
      case "is": {
        if (f.val === null) parts.push(`${col} IS NULL`);
        else if (f.val === true) parts.push(`(${col} = 1)`);
        else if (f.val === false) parts.push(`(${col} = 0)`);
        else parts.push(`${col} IS NULL`);
        break;
      }
      case "in": {
        const arr = Array.isArray(f.val) ? f.val : [];
        if (arr.length === 0) {
          parts.push("1=0");
        } else {
          parts.push(`${col} IN (${arr.map(() => "?").join(",")})`);
          arr.forEach((v) => params.push(toParam(v)));
        }
        break;
      }
      case "contains": {
        parts.push(`JSON_CONTAINS(${col}, ?)`);
        params.push(JSON.stringify(f.val));
        break;
      }
      case "not": {
        const inner = f.notOp ?? "eq";
        if (inner === "is") {
          if (f.val === null) parts.push(`${col} IS NOT NULL`);
          else if (f.val === true) parts.push(`(${col} = 0 OR ${col} IS NULL)`);
          else parts.push(`(${col} = 1)`);
        } else if (inner === "in") {
          const arr = Array.isArray(f.val) ? f.val : [];
          if (arr.length) {
            parts.push(`(${col} NOT IN (${arr.map(() => "?").join(",")}) OR ${col} IS NULL)`);
            arr.forEach((v) => params.push(toParam(v)));
          }
        } else {
          const sym = { eq: "<>", gt: "<=", gte: "<", lt: ">=", lte: ">" }[inner] ?? "<>";
          parts.push(`(${col} ${sym} ? OR ${col} IS NULL)`);
          params.push(toParam(f.val));
        }
        break;
      }
      default:
        break;
    }
  }
  void table;
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

/* ---------------- embeds ---------------- */

async function resolveEmbed(parent: string, part: Extract<SelectPart, { kind: "embed" }>) {
  // many-to-one: parent has <x>_id referencing embed table
  const candidates: string[] = [];
  if (part.fkHint) {
    const m = new RegExp(`^${parent}_(.+)_fkey$`).exec(part.fkHint);
    if (m) candidates.push(m[1]);
    else candidates.push(part.fkHint);
  }
  candidates.push(`${singular(part.table)}_id`, `${part.alias}_id`);
  for (const c of candidates) {
    if (await getColumn(parent, c)) return { type: "one" as const, localKey: c, foreignKey: "id" };
  }
  // one-to-many: embed table has <singular(parent)>_id
  const childKey = `${singular(parent)}_id`;
  if (await getColumn(part.table, childKey)) {
    return { type: "many" as const, localKey: "id", foreignKey: childKey };
  }
  return null;
}

async function attachEmbeds(table: string, rows: Record<string, unknown>[], embeds: Extract<SelectPart, { kind: "embed" }>[]) {
  for (const emb of embeds) {
    const rel = await resolveEmbed(table, emb);
    if (!rel) {
      rows.forEach((r) => {
        r[emb.alias] = rel === null ? null : null;
      });
      continue;
    }
    const keys = Array.from(
      new Set(rows.map((r) => r[rel.localKey]).filter((v) => v !== null && v !== undefined)),
    );
    if (keys.length === 0) {
      rows.forEach((r) => {
        r[emb.alias] = rel.type === "many" ? [] : null;
      });
      continue;
    }
    const sub = await runSelect({
      table: emb.table,
      op: "select",
      columns: emb.inner.includes(rel.foreignKey) || emb.inner.trim() === "*" ? emb.inner : `${emb.inner},${rel.foreignKey}`,
      filters: [{ op: "in", col: rel.foreignKey, val: keys }],
    });
    const list = (sub.data as Record<string, unknown>[]) ?? [];
    for (const r of rows) {
      const k = r[rel.localKey];
      const matched = list.filter((x) => String(x[rel.foreignKey]) === String(k));
      r[emb.alias] = rel.type === "many" ? matched : (matched[0] ?? null);
    }
  }
}

/* ---------------- runners ---------------- */

async function runSelect(spec: QuerySpec): Promise<QueryResult> {
  const table = assertIdent(spec.table);
  const parts = parseSelect(spec.columns ?? "*");
  const cols = parts.filter((p) => p.kind === "col") as Extract<SelectPart, { kind: "col" }>[];
  const embeds = parts.filter((p) => p.kind === "embed") as Extract<SelectPart, { kind: "embed" }>[];

  let colSql = "*";
  if (!(cols.length === 1 && cols[0].name === "*")) {
    const tableCols = await getColumns(table);
    const known = new Set(tableCols.map((c) => c.name));
    const picked = cols.filter((c) => c.name === "*" || known.has(c.name));
    const list = picked.map((c) =>
      c.name === "*" ? "*" : `\`${assertIdent(c.name)}\`${c.alias ? ` AS \`${assertIdent(c.alias)}\`` : ""}`,
    );
    // embed'ler için gerekli yerel anahtarları da getir
    for (const emb of embeds) {
      const rel = await resolveEmbed(table, emb);
      if (rel && !picked.some((c) => c.name === rel.localKey || c.name === "*")) {
        list.push(`\`${rel.localKey}\``);
      }
    }
    colSql = list.length ? list.join(", ") : "*";
  }

  const where = await buildWhere(table, spec.filters ?? []);
  let sql = `SELECT ${colSql} FROM \`${table}\`${where.sql}`;
  const params = [...where.params];

  if (spec.order?.length) {
    const ord = spec.order
      .map((o) => `\`${assertIdent(o.col)}\` ${o.ascending ? "ASC" : "DESC"}`)
      .join(", ");
    sql += ` ORDER BY ${ord}`;
  }
  if (spec.range) {
    const size = Math.max(0, spec.range.to - spec.range.from + 1);
    sql += ` LIMIT ${size} OFFSET ${spec.range.from}`;
  } else if (typeof spec.limit === "number") {
    sql += ` LIMIT ${Math.max(0, Math.floor(spec.limit))}`;
  } else if (spec.single || spec.maybeSingle) {
    sql += ` LIMIT 2`;
  }

  let count: number | null = null;
  if (spec.count) {
    const c = await mysqlQuery<{ c: unknown }>(
      `SELECT COUNT(*) AS c FROM \`${table}\`${where.sql}`,
      where.params,
    );
    count = Number(c[0]?.c ?? 0);
  }
  if (spec.head) return { data: null, error: null, count };

  const rows = await mysqlQuery<Record<string, unknown>>(sql, params);
  if (embeds.length) await attachEmbeds(table, rows, embeds);

  if (spec.single) {
    if (rows.length !== 1) {
      return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" }, count };
    }
    return { data: rows[0], error: null, count };
  }
  if (spec.maybeSingle) {
    return { data: rows[0] ?? null, error: null, count };
  }
  return { data: rows, error: null, count };
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function prepareRow(table: string, raw: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cols = await getColumns(table);
  const known = new Map(cols.map((c) => [c.name, c]));
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!known.has(k)) continue;
    row[k] = v;
  }
  const idCol = known.get("id");
  if (idCol && row["id"] === undefined && !idCol.extra.includes("auto_increment") && !idCol.type.includes("int")) {
    row["id"] = crypto.randomUUID();
  }
  const createdAt = known.get("created_at");
  if (createdAt && row["created_at"] === undefined && !createdAt.hasDefault) {
    row["created_at"] = nowSql();
  }
  const updatedAt = known.get("updated_at");
  if (updatedAt && row["updated_at"] === undefined && !updatedAt.hasDefault) {
    row["updated_at"] = nowSql();
  }
  return row;
}

async function runInsert(spec: QuerySpec): Promise<QueryResult> {
  const table = assertIdent(spec.table);
  const payload = Array.isArray(spec.payload) ? spec.payload : [spec.payload];
  const inserted: Record<string, unknown>[] = [];
  for (const raw of payload as Record<string, unknown>[]) {
    const row = await prepareRow(table, raw ?? {});
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const verb = spec.op === "upsert" ? "REPLACE" : "INSERT";
    let sql = `${verb} INTO \`${table}\` (${keys.map((k) => `\`${assertIdent(k)}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
    if (spec.op === "upsert") {
      // REPLACE tüm satırı değiştirir; ON DUPLICATE KEY daha güvenli
      sql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE ${keys
        .filter((k) => k !== "id" && k !== "created_at")
        .map((k) => `\`${k}\`=VALUES(\`${k}\`)`)
        .join(", ")}`;
    }
    const params = keys.map((k) => toParam(row[k]));
    await mysqlQuery(sql, params);
    inserted.push(row);
  }
  if (!spec.returning) return { data: null, error: null };

  const ids = inserted.map((r) => r["id"]).filter((v) => v !== undefined);
  if (ids.length) {
    const res = await runSelect({
      table,
      op: "select",
      columns: spec.columns ?? "*",
      filters: [{ op: "in", col: "id", val: ids as unknown[] }],
      single: spec.single,
      maybeSingle: spec.maybeSingle,
    });
    return res;
  }
  const data = spec.single || spec.maybeSingle ? (inserted[0] ?? null) : inserted;
  return { data, error: null };
}

async function runUpdate(spec: QuerySpec): Promise<QueryResult> {
  const table = assertIdent(spec.table);
  const raw = (spec.payload ?? {}) as Record<string, unknown>;
  const cols = await getColumns(table);
  const known = new Set(cols.map((c) => c.name));
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (known.has(k)) row[k] = v;
  if (known.has("updated_at") && row["updated_at"] === undefined) row["updated_at"] = nowSql();

  const where = await buildWhere(table, spec.filters ?? []);
  if (!where.sql) return { data: null, error: { message: "Filtresiz güncelleme engellendi" } };

  let targetIds: unknown[] | null = null;
  if (spec.returning && known.has("id")) {
    const pre = await mysqlQuery<Record<string, unknown>>(
      `SELECT id FROM \`${table}\`${where.sql}`,
      where.params,
    );
    targetIds = pre.map((r) => r["id"]);
  }

  const keys = Object.keys(row);
  if (keys.length) {
    const sql = `UPDATE \`${table}\` SET ${keys.map((k) => `\`${assertIdent(k)}\`=?`).join(", ")}${where.sql}`;
    await mysqlQuery(sql, [...keys.map((k) => toParam(row[k])), ...where.params]);
  }

  if (!spec.returning) return { data: null, error: null };
  if (targetIds && targetIds.length === 0) {
    if (spec.single) return { data: null, error: { message: "No rows returned" } };
    return { data: spec.maybeSingle ? null : [], error: null };
  }
  return runSelect({
    table,
    op: "select",
    columns: spec.columns ?? "*",
    filters: targetIds ? [{ op: "in", col: "id", val: targetIds }] : (spec.filters ?? []),
    single: spec.single,
    maybeSingle: spec.maybeSingle,
  });
}

async function runDelete(spec: QuerySpec): Promise<QueryResult> {
  const table = assertIdent(spec.table);
  const where = await buildWhere(table, spec.filters ?? []);
  if (!where.sql) return { data: null, error: { message: "Filtresiz silme engellendi" } };
  let removed: unknown = null;
  if (spec.returning) {
    const res = await runSelect({ table, op: "select", columns: spec.columns ?? "*", filters: spec.filters });
    removed = res.data;
  }
  await mysqlQuery(`DELETE FROM \`${table}\`${where.sql}`, where.params);
  if (!spec.returning) return { data: null, error: null };
  if (spec.single || spec.maybeSingle) {
    const arr = (removed as unknown[]) ?? [];
    return { data: arr[0] ?? null, error: null };
  }
  return { data: removed, error: null };
}

export async function runQuery(spec: QuerySpec): Promise<QueryResult> {
  try {
    switch (spec.op) {
      case "select":
        return await runSelect(spec);
      case "insert":
      case "upsert":
        return await runInsert(spec);
      case "update":
        return await runUpdate(spec);
      case "delete":
        return await runDelete(spec);
      default:
        return { data: null, error: { message: "Bilinmeyen işlem" } };
    }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
