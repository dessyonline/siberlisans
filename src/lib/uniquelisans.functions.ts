import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveLogoUrl } from "@/lib/logo-resolver";

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";
// Varsayılan markup (admin isterse import ederken override eder)
export const DEFAULT_MARKUP_PERCENT = 20;

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

    const finalPrice = Math.max(1, Math.round(detail.amount * (1 + data.markup_percent / 100)));
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

    // Stok kontrolü: API stok yok diyorsa veya stock_count <= 0 ise ürünü pasif tut
    const outOfStock = detail.is_automatic_delivery
      ? false
      : (detail.is_stock === false || (typeof detail.stock_count === "number" && detail.stock_count <= 0));
    const effectiveActive = outOfStock ? false : data.active;

    const payload = {
      name: detail.name,
      description: detail.description ?? "",
      price_try: finalPrice,
      external_price: detail.amount,
      category: data.category ?? "Dijital Ürünler",
      active: effectiveActive,
      manual_fulfillment: true, // otomatik teslim kapalı — admin manuel siparişi Uniquelisans'ta açar
      unlimited_stock: !!detail.is_automatic_delivery,
      source: "uniquelisans",
      external_id: String(detail.id),
      required_fields: (detail.required_fields ?? []) as never,
      stock_hint: detail.stock_count ?? null,
      image_url: resolveLogoUrl(detail.name),
    };

    if (existing) {
      // Mevcut kayıtta admin manuel logo koyduysa üzerine yazma
      const { data: cur } = await supabase.from("products").select("image_url").eq("id", existing.id).maybeSingle();
      const updatePayload = { ...payload };
      if (cur?.image_url) delete (updatePayload as Partial<typeof payload>).image_url;
      const { error } = await supabase.from("products").update(updatePayload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, productId: existing.id, updated: true };
    } else {
      const { data: row, error } = await supabase
        .from("products")
        .insert({ ...payload, slug })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true as const, productId: row.id, updated: false };
    }
  });

export const ulImportedProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data } = await supabase
      .from("products")
      .select("id, name, slug, price_try, external_id, external_price, active, updated_at")
      .eq("source", "uniquelisans")
      .order("updated_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });
