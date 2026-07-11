import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveLogoUrl } from "@/lib/logo-resolver";
import { writeAuditLog } from "@/lib/admin-audit.functions";

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";
// Varsayılan markup (admin isterse import ederken override eder)
export const DEFAULT_MARKUP_PERCENT = 20;
// Her ürünün üstünde minimum kar (TL) — DB trigger'i de bunu zorunlu tutar.
export const MIN_PROFIT_TL = 200;

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

type SB = { rpc: (...args: never[]) => { data: unknown } | Promise<{ data: unknown }> };
async function assertAdmin(supabase: unknown, userId: string) {
  const { data } = await (supabase as SB).rpc(
    "has_role" as never,
    { _user_id: userId, _role: "admin" } as never,
  );
  if (!data) throw new Error("Yetkisiz.");
}

// ------- Read passthrough (admin) -------
export const ulBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const b = await ul("/balance");
    return { balance: Number((b as { balance?: number }).balance ?? 0) };
  });

export const ulCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const detail = (await ul(`/products/${data.external_id}`)).product_detail as {
      id: number; name: string; description: string; amount: number;
      product_type: string; is_stock: boolean; is_automatic_delivery: boolean;
      stock_count: number | null;
      required_fields?: Array<{ name: string; el_type: string; input_type: string; required: boolean }>;
    };
    if (!detail) throw new Error("Ürün bulunamadı.");

    const finalPrice = priceWithFloor(detail.amount, data.markup_percent);
    const baseSlug = slugify(detail.name) || `ul-${detail.id}`;
    let slug = baseSlug;
    // slug çakışırsa suffix ekle
    for (let i = 2; i < 20; i++) {
      const { data: exists } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${baseSlug}-${i}`;
    }

    // Var olan external kaydı upsert et
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("source", "uniquelisans")
      .eq("external_id", String(detail.id))
      .maybeSingle();

    // Stok kontrolü: SADECE sayısal stok takibi yapılan ürünlerde stock_count <= 0 ise
    // geçici olarak "tedarikçi stok yok" bayrağı yak. Ürün aktif kalır, sadece satış engellenir.
    const outOfStock = !detail.is_automatic_delivery
      && typeof detail.stock_count === "number"
      && detail.stock_count <= 0;

    const payload = {
      name: detail.name,
      description: detail.description ?? "",
      price_try: finalPrice,
      external_price: detail.amount,
      category: data.category ?? "Dijital Ürünler",
      active: data.active,
      manual_fulfillment: true, // otomatik teslim kapalı — admin manuel siparişi Uniquelisans'ta açar
      unlimited_stock: !!detail.is_automatic_delivery,
      supplier_out_of_stock: outOfStock,
      source: "uniquelisans",
      external_id: String(detail.id),
      required_fields: (detail.required_fields ?? []) as never,
      stock_hint: detail.stock_count ?? null,
      image_url: resolveLogoUrl(detail.name),
    };

    if (existing) {
      // Mevcut kayıtta admin manuel logo koyduysa üzerine yazma
      const { data: cur } = await supabase.from("products").select("image_url, active").eq("id", existing.id).maybeSingle();
      const updatePayload = { ...payload };
      if (cur?.image_url) delete (updatePayload as Partial<typeof payload>).image_url;
      // Admin'in active seçimini bozma — sadece supplier bayrağını güncelle
      if (cur) updatePayload.active = cur.active;
      const { error } = await supabase.from("products").update(updatePayload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, productId: existing.id, updated: true, outOfStock };
    } else {
      const { data: row, error } = await supabase
        .from("products")
        .insert({ ...payload, slug })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true as const, productId: row.id, updated: false, outOfStock };
    }
  });


// Tüm içe aktarılmış Uniquelisans ürünlerinin stok/fiyatını API ile senkronize et.
// Stok yoksa "tedarikçi stok yok" bayrağını yakar (ürün aktif kalır, satış engellenir).
// `reactivate` true ise stok dönen ürünlerin bayrağını temizler.
const syncInput = z.object({ reactivate: z.boolean().default(false) }).default({ reactivate: false });

export const ulSyncStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => syncInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: rows } = await supabase
      .from("products")
      .select("id, external_id, price_try, external_price, active, supplier_out_of_stock")
      .eq("source", "uniquelisans");

    const list = rows ?? [];
    let checked = 0, hidden = 0, reactivated = 0, updated = 0, failed = 0;

    for (const p of list) {
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

        const patch: { external_price: number; stock_hint: number | null; unlimited_stock: boolean; supplier_out_of_stock?: boolean } = {
          external_price: d.amount,
          stock_hint: d.stock_count ?? null,
          unlimited_stock: !!d.is_automatic_delivery,
        };
        if (outOfStock && !p.supplier_out_of_stock) {
          patch.supplier_out_of_stock = true;
          hidden++;
        } else if (!outOfStock && p.supplier_out_of_stock && data.reactivate) {
          patch.supplier_out_of_stock = false;
          reactivated++;
        }
        const { error } = await supabase.from("products").update(patch).eq("id", p.id);
        if (error) { failed++; continue; }
        updated++;
      } catch {
        failed++;
      }
    }

    return { checked, updated, hidden, reactivated, failed };
  });


export const ulImportedProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data } = await supabase
      .from("products")
      .select("id, name, slug, price_try, external_id, external_price, active, updated_at, stock_hint, unlimited_stock, supplier_out_of_stock, price_locked")
      .eq("source", "uniquelisans")
      .order("updated_at", { ascending: false })
      .limit(500);
    return data ?? [];
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
});

export const ulUpdateImported = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateImportedInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: row, error: readErr } = await supabase
      .from("products")
      .select("id, external_price, source")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Ürün bulunamadı.");

    const patch: { active?: boolean; price_try?: number; price_locked?: boolean } = {};
    if (typeof data.active === "boolean") patch.active = data.active;

    if (typeof data.price_try === "number") {
      patch.price_try = Math.round(data.price_try);
      patch.price_locked = true;
    } else if (typeof data.markup_percent === "number") {
      const cost = Number(row.external_price ?? 0);
      patch.price_try = priceWithFloor(cost, data.markup_percent);
      patch.price_locked = true;
    }

    if (typeof data.price_locked === "boolean") patch.price_locked = data.price_locked;

    if (Object.keys(patch).length === 0) return { ok: true as const, changed: false };

    const { error } = await supabase.from("products").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAuditLog(supabase, {
      action: "product.update",
      entity_type: "product",
      entity_id: data.id,
      before: { external_price: row.external_price },
      after: patch,
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => catalogSyncInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { runUniquelisansCatalogSync } = await import("@/lib/uniquelisans-catalog.server");
    return await runUniquelisansCatalogSync(supabase as never, data);
  });
