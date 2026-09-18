import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";
import { resolveLogoUrl } from "@/lib/logo-resolver";
import { writeAuditLog } from "@/lib/admin-audit.functions";

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";
// Varsayılan markup (admin isterse import ederken override eder)
export const DEFAULT_MARKUP_PERCENT = 20;
// Her ürünün üstünde minimum kar (TL) — DB trigger'i de bunu zorunlu tutar.
export const MIN_PROFIT_TL = 200;

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

function priceWithFloor(cost: number, markupPercent: number): number {
  const marked = Math.round(cost * (1 + markupPercent / 100));
  const floor = Math.round(cost + MIN_PROFIT_TL);
  return Math.max(1, marked, floor);
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function ul(path: string, params: Record<string, string | number> = {}) {
  const key = process.env.UNIQUELISANS_API_KEY;
  const base = process.env.UNIQUELISANS_API_URL || DEFAULT_URL;
  if (!key) throw new Error("UNIQUELISANS_API_KEY tanımlı değil.");
  const url = new URL(`${base}${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new Error(`Uniquelisans yanıtı JSON değil: ${text.slice(0,200)}`); }
  if (!res.ok) throw new Error(`Uniquelisans hatası [${res.status}]: ${text.slice(0,200)}`);
  return body as Record<string, unknown>;
}

async function assertAdmin(isAdmin: boolean) {
  if (!isAdmin) throw new Error("Yetkisiz.");
}

async function nextSlug(baseSlug: string) {
  let slug = baseSlug;
  for (let i = 2; i < 20; i++) {
    const exists = await mysqlOne<{ id: string }>("SELECT id FROM products WHERE slug=?", [slug]);
    if (!exists) break;
    slug = `${baseSlug}-${i}`;
  }
  return slug;
}

// ------- Read passthrough (admin) -------
export const ulBalance = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.isAdmin);
    const b = await ul("/balance");
    return { balance: Number((b as { balance?: number }).balance ?? 0) };
  });

export const ulCategories = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.isAdmin);
    const b = await ul("/categories");
    return (b.categories ?? []) as Array<{
      id: number; name: string;
      subcategories: Array<{ id: number; category_id: number; name: string }>;
    }>;
  });

const listInput = z.object({
  category_id: z.number().int().positive(),
  sub_category_id: z.number().int().positive().optional(),
});

export const ulProducts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.isAdmin);
    const params: Record<string, number> = { category_id: data.category_id };
    if (data.sub_category_id) params.sub_category_id = data.sub_category_id;
    const b = await ul("/products", params);
    return (b.products ?? []) as Array<{
      id: number; name: string; description: string; amount: number;
      is_stock: boolean; stock_count: number | null; is_automatic_delivery: boolean;
    }>;
  });

const detailInput = z.object({ external_id: z.number().int().positive() });

export const ulProductDetail = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => detailInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.isAdmin);
    const b = await ul(`/products/${data.external_id}`);
    return b.product_detail as {
      id: number; name: string; description: string; amount: number;
      product_type: string; is_stock: boolean; is_automatic_delivery: boolean;
      stock_count: number | null;
      required_fields?: Array<{ name: string; el_type: string; input_type: string; required: boolean }>;
    };
  });

// ------- Import -------
const importInput = z.object({
  external_id: z.number().int().positive(),
  markup_percent: z.number().min(0).max(500).default(DEFAULT_MARKUP_PERCENT),
  category: z.string().max(80).optional(),
  active: z.boolean().default(false),
});

export const ulImportProduct = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.isAdmin);

    const detail = (await ul(`/products/${data.external_id}`)).product_detail as {
      id: number; name: string; description: string; amount: number;
      product_type: string; is_stock: boolean; is_automatic_delivery: boolean;
      stock_count: number | null;
      required_fields?: Array<{ name: string; el_type: string; input_type: string; required: boolean }>;
    };
    if (!detail) throw new Error("Ürün bulunamadı.");

    const finalPrice = priceWithFloor(detail.amount, data.markup_percent);
    const baseSlug = slugify(detail.name) || `ul-${detail.id}`;

    const existing = await mysqlOne<{ id: string }>(
      "SELECT id FROM products WHERE source='uniquelisans' AND external_id=?",
      [String(detail.id)],
    );

    // Stok kontrolü: SADECE sayısal stok takibi yapılan ürünlerde stock_count <= 0 ise
    // geçici olarak "tedarikçi stok yok" bayrağı yak. Ürün aktif kalır, sadece satış engellenir.
    const outOfStock = !detail.is_automatic_delivery
      && typeof detail.stock_count === "number"
      && detail.stock_count <= 0;

    if (existing) {
      const cur = await mysqlOne<{ image_url: string | null; active: number | null }>(
        "SELECT image_url, active FROM products WHERE id=?",
        [existing.id],
      );
      const imageUrl = cur?.image_url ? cur.image_url : resolveLogoUrl(detail.name);
      const active = cur ? bool(cur.active) : data.active;
      await mysqlQuery(
        `UPDATE products SET name=?, description=?, price_try=?, external_price=?, category=?, active=?,
           manual_fulfillment=1, unlimited_stock=?, supplier_out_of_stock=?, required_fields=?, stock_hint=?, image_url=?, updated_at=?
         WHERE id=?`,
        [
          detail.name,
          detail.description ?? "",
          finalPrice,
          detail.amount,
          data.category ?? "Dijital Ürünler",
          active ? 1 : 0,
          detail.is_automatic_delivery ? 1 : 0,
          outOfStock ? 1 : 0,
          JSON.stringify(detail.required_fields ?? []),
          detail.stock_count ?? null,
          imageUrl,
          ts(),
          existing.id,
        ],
      );
      return { ok: true as const, productId: existing.id, updated: true, outOfStock };
    } else {
      const slug = await nextSlug(baseSlug);
      const id = uid();
      await mysqlQuery(
        `INSERT INTO products (id,name,description,slug,price_try,external_price,category,active,manual_fulfillment,unlimited_stock,supplier_out_of_stock,source,external_id,required_fields,stock_hint,image_url,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,1,?,?, 'uniquelisans',?,?,?,?,?,?)`,
        [
          id,
          detail.name,
          detail.description ?? "",
          slug,
          finalPrice,
          detail.amount,
          data.category ?? "Dijital Ürünler",
          data.active ? 1 : 0,
          detail.is_automatic_delivery ? 1 : 0,
          outOfStock ? 1 : 0,
          String(detail.id),
          JSON.stringify(detail.required_fields ?? []),
          detail.stock_count ?? null,
          resolveLogoUrl(detail.name),
          ts(),
          ts(),
        ],
      );
      return { ok: true as const, productId: id, updated: false, outOfStock };
    }
  });


// Tüm içe aktarılmış Uniquelisans ürünlerinin stok/fiyatını API ile senkronize et.
// Stok yoksa "tedarikçi stok yok" bayrağını yakar (ürün aktif kalır, satış engellenir).
// `reactivate` true ise stok dönen ürünlerin bayrağını temizler.
const syncInput = z.object({ reactivate: z.boolean().default(false) }).default({ reactivate: false });

export const ulSyncStock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => syncInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.isAdmin);

    const rows = await mysqlQuery<{
      id: string; external_id: string | null; price_try: string | number | null;
      external_price: string | number | null; active: number | null; supplier_out_of_stock: number | null;
    }>(
      "SELECT id, external_id, price_try, external_price, active, supplier_out_of_stock FROM products WHERE source='uniquelisans'",
    );

    let checked = 0, hidden = 0, reactivated = 0, updated = 0, failed = 0;

    for (const p of rows) {
      if (!p.external_id) continue;
      checked++;
      try {
        const b = await ul(`/products/${p.external_id}`);
        const d = b.product_detail as {
          amount: number; is_stock: boolean; is_automatic_delivery: boolean; stock_count: number | null;
        } | undefined;
        if (!d) { failed++; continue; }

        const outOfStock = !d.is_automatic_delivery
          && typeof d.stock_count === "number"
          && d.stock_count <= 0;

        const supplierOos = bool(p.supplier_out_of_stock);
        let nextFlag = supplierOos;
        if (outOfStock && !supplierOos) {
          nextFlag = true;
          hidden++;
        } else if (!outOfStock && supplierOos && data.reactivate) {
          nextFlag = false;
          reactivated++;
        }

        await mysqlQuery(
          "UPDATE products SET external_price=?, stock_hint=?, unlimited_stock=?, supplier_out_of_stock=?, updated_at=? WHERE id=?",
          [d.amount, d.stock_count ?? null, d.is_automatic_delivery ? 1 : 0, nextFlag ? 1 : 0, ts(), p.id],
        );
        updated++;
      } catch {
        failed++;
      }
    }

    return { checked, updated, hidden, reactivated, failed };
  });


export const ulImportedProducts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.isAdmin);
    const rows = await mysqlQuery<{
      id: string; name: string; slug: string; price_try: string | number | null;
      external_id: string | null; external_price: string | number | null; active: number | null;
      updated_at: string | null; stock_hint: number | null; unlimited_stock: number | null;
      supplier_out_of_stock: number | null; price_locked: number | null;
      retail_price_try: string | number | null; retail_price_source_url: string | null;
      duration_label: string | null;
    }>(
      `SELECT id, name, slug, price_try, external_id, external_price, active, updated_at, stock_hint, unlimited_stock, supplier_out_of_stock, price_locked, retail_price_try, retail_price_source_url, duration_label
         FROM products WHERE source='uniquelisans' ORDER BY updated_at DESC LIMIT 500`,
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      price_try: num(r.price_try) ?? 0,
      external_id: r.external_id,
      external_price: r.external_price == null ? null : num(r.external_price),
      active: bool(r.active),
      updated_at: r.updated_at,
      stock_hint: r.stock_hint,
      unlimited_stock: bool(r.unlimited_stock),
      supplier_out_of_stock: bool(r.supplier_out_of_stock),
      price_locked: bool(r.price_locked),
      retail_price_try: r.retail_price_try == null ? null : num(r.retail_price_try),
      retail_price_source_url: r.retail_price_source_url,
      duration_label: r.duration_label,
    }));
  });

// Admin: içe aktarılmış Uniquelisans ürününü hızlı düzenle
// - active: aktif/pasif
// - price_try: manuel satış fiyatı (verildiğinde price_locked = true olur)
// - markup_percent: alış üstüne %; MIN_PROFIT_TL zemini uygulanır, price_locked = true olur
// - price_locked: kilidi açıp/kapatmak için
const updateImportedInput = z.object({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  price_try: z.number().positive().optional(),
  markup_percent: z.number().min(0).max(500).optional(),
  price_locked: z.boolean().optional(),
  retail_price_try: z.number().nonnegative().nullable().optional(),
  retail_price_source_url: z.string().max(500).nullable().optional(),
  duration_label: z.string().max(40).nullable().optional(),
});

export const ulUpdateImported = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => updateImportedInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.isAdmin);

    const row = await mysqlOne<{ id: string; external_price: string | number | null; source: string | null }>(
      "SELECT id, external_price, source FROM products WHERE id=?",
      [data.id],
    );
    if (!row) throw new Error("Ürün bulunamadı.");

    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    const patchSummary: Record<string, unknown> = {};

    if (typeof data.active === "boolean") {
      sets.push("active=?"); params.push(data.active ? 1 : 0);
      patchSummary.active = data.active;
    }

    let priceTry: number | undefined;
    if (typeof data.price_try === "number") {
      priceTry = Math.round(data.price_try);
    } else if (typeof data.markup_percent === "number") {
      const cost = num(row.external_price) ?? 0;
      priceTry = priceWithFloor(cost, data.markup_percent);
    }
    if (priceTry !== undefined) {
      sets.push("price_try=?", "price_locked=1"); params.push(priceTry);
      patchSummary.price_try = priceTry;
      patchSummary.price_locked = true;
    }

    if (typeof data.price_locked === "boolean") {
      sets.push("price_locked=?"); params.push(data.price_locked ? 1 : 0);
      patchSummary.price_locked = data.price_locked;
    }

    if (data.retail_price_try !== undefined) {
      const v = data.retail_price_try === null ? null : Math.round(data.retail_price_try);
      sets.push("retail_price_try=?", "retail_price_updated_at=?");
      params.push(v, ts());
      patchSummary.retail_price_try = v;
    }
    if (data.retail_price_source_url !== undefined) {
      sets.push("retail_price_source_url=?"); params.push(data.retail_price_source_url || null);
      patchSummary.retail_price_source_url = data.retail_price_source_url || null;
    }
    if (data.duration_label !== undefined) {
      sets.push("duration_label=?"); params.push(data.duration_label || null);
      patchSummary.duration_label = data.duration_label || null;
    }

    if (sets.length === 0) return { ok: true as const, changed: false };

    sets.push("updated_at=?"); params.push(ts());
    params.push(data.id);
    await mysqlQuery(`UPDATE products SET ${sets.join(", ")} WHERE id=?`, params);

    await writeAuditLog(context, {
      action: "product.update",
      entity_type: "product",
      entity_id: data.id,
      before: { external_price: row.external_price },
      after: patchSummary,
      metadata: { source: "uniquelisans" },
    });
    return { ok: true as const, changed: true };
  });

/**
 * Uniquelisans tam katalog senkronu (günlük cron için).
 * Ağır iş `uniquelisans-catalog.server.ts` içinde; burada sadece admin auth ve dinamik import.
 */
const catalogSyncInput = z.object({
  markup_percent: z.number().min(0).max(500).default(DEFAULT_MARKUP_PERCENT),
  import_new: z.boolean().default(true),
  reactivate: z.boolean().default(true),
}).default({ markup_percent: DEFAULT_MARKUP_PERCENT, import_new: true, reactivate: true });

export const ulSyncCatalog = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => catalogSyncInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.isAdmin);
    const { runUniquelisansCatalogSync } = await import("@/lib/uniquelisans-catalog.server");
    return await runUniquelisansCatalogSync(data);
  });
