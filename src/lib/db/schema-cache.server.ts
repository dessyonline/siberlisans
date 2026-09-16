import { mysqlQuery } from "@/lib/mysql.server";

export type ColumnInfo = { name: string; type: string; nullable: boolean; hasDefault: boolean; extra: string };

const cache = new Map<string, ColumnInfo[]>();

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Geçersiz tanımlayıcı: ${name}`);
  return name;
}

export async function getColumns(table: string): Promise<ColumnInfo[]> {
  assertIdent(table);
  const hit = cache.get(table);
  if (hit) return hit;
  const rows = await mysqlQuery<Record<string, unknown>>(`SHOW COLUMNS FROM \`${table}\``);
  const cols: ColumnInfo[] = rows.map((r) => ({
    name: String(r["Field"]),
    type: String(r["Type"] ?? "").toLowerCase(),
    nullable: String(r["Null"] ?? "YES") === "YES",
    hasDefault: r["Default"] !== null && r["Default"] !== undefined,
    extra: String(r["Extra"] ?? "").toLowerCase(),
  }));
  cache.set(table, cols);
  return cols;
}

export async function hasColumn(table: string, column: string): Promise<boolean> {
  const cols = await getColumns(table);
  return cols.some((c) => c.name === column);
}

export async function getColumn(table: string, column: string): Promise<ColumnInfo | null> {
  const cols = await getColumns(table);
  return cols.find((c) => c.name === column) ?? null;
}

/** products -> product, license_keys -> license_key, profiles -> profile */
export function singular(table: string): string {
  if (table.endsWith("ies")) return `${table.slice(0, -3)}y`;
  if (table.endsWith("ses")) return table.slice(0, -2);
  if (table.endsWith("s")) return table.slice(0, -1);
  return table;
}
