// Server-only: Uniquelisans tam katalog senkronu.
// Route dosyalarından ve server function handler'larından DİNAMİK import ile çağrılır.
import { resolveLogoUrl } from "@/lib/logo-resolver";
import { notifyTelegram } from "@/lib/telegram.server";

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";

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
  try { body = JSON.parse(text); } catch { throw new Error(`Uniquelisans yanıtı JSON değil: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`Uniquelisans hatası [${res.status}]: ${text.slice(0, 200)}`);
  return body as Record<string, unknown>;
}

type SB = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type CatalogSyncOpts = {
  markup_percent: number;
  import_new: boolean;
  reactivate: boolean;
};

export type CatalogSyncResult = {
  scanned: number; inserted: number; updated: number;
  price_changed: number; hidden: number; reactivated: number; failed: number;
};

export async function runUniquelisansCatalogSync(
  supabase: SB,
  opts: CatalogSyncOpts,
): Promise<CatalogSyncResult> {
  const catsBody = await ul("/categories");
  const categories = (catsBody.categories ?? []) as Array<{
    id: number; name: string;
    subcategories: Array<{ id: number; category_id: number; name: string }>;
  }>;

  const { data: existingRows } = await supabase.from("products")
    .select("id, external_id, active, image_url, price_try, external_price, stock_hint, supplier_out_of_stock")
    .eq("source", "uniquelisans");

  const existing = new Map<string, {
    id: string; active: boolean; image_url: string | null;
    price_try: number; external_price: number | null; stock_hint: number | null;
    supplier_out_of_stock: boolean | null;
  }>();
  for (const r of (existingRows ?? []) as Array<{
    id: string; external_id: string | null; active: boolean; image_url: string | null;
    price_try: number; external_price: number | null; stock_hint: number | null;
    supplier_out_of_stock: boolean | null;
  }>) {
    if (r.external_id) existing.set(String(r.external_id), r);
  }


  const res: CatalogSyncResult = {
    scanned: 0, inserted: 0, updated: 0, price_changed: 0, hidden: 0, reactivated: 0, failed: 0,
  };

  for (const cat of categories) {
    const subs = cat.subcategories?.length
      ? cat.subcategories
      : [{ id: 0, category_id: cat.id, name: cat.name }];
    for (const sub of subs) {
      try {
        const params: Record<string, number> = { category_id: cat.id };
        if (sub.id) params.sub_category_id = sub.id;
        const listBody = await ul("/products", params);
        const products = (listBody.products ?? []) as Array<{
          id: number; name: string; description: string; amount: number;
          is_stock: boolean; stock_count: number | null; is_automatic_delivery: boolean;
        }>;

        for (const p of products) {
          res.scanned++;
          const key = String(p.id);
          const finalPrice = Math.max(1, Math.round(p.amount * (1 + opts.markup_percent / 100)));
          const outOfStock = !p.is_automatic_delivery
            && typeof p.stock_count === "number"
            && p.stock_count <= 0;

          const prev = existing.get(key);
          if (prev) {
            const patch: Record<string, unknown> = {
              external_price: p.amount,
              stock_hint: p.stock_count ?? null,
              unlimited_stock: !!p.is_automatic_delivery,
            };
            if (Number(prev.external_price ?? 0) !== p.amount) {
              patch.price_try = finalPrice;
              res.price_changed++;
            }
            // Ürünü pasifleştirmek yerine geçici "tedarikçi stok yok" bayrağı ile satışı engelle.
            // Admin manuel active ayarına dokunmuyoruz — stok dönünce bayrağı temizliyoruz.
            if (outOfStock && !prev.supplier_out_of_stock) {
              patch.supplier_out_of_stock = true;
              res.hidden++;
            } else if (!outOfStock && prev.supplier_out_of_stock) {
              patch.supplier_out_of_stock = false;
              res.reactivated++;
            }
            const { error } = await supabase.from("products").update(patch).eq("id", prev.id);
            if (error) { res.failed++; continue; }
            res.updated++;
            // Stok geri geldiğinde: adminlere Telegram + abone kullanıcılara bildirim
            if (patch.supplier_out_of_stock === false) {
              await notifyStockBack(supabase, prev.id, p.name, p.stock_count ?? null);
            }
          } else if (opts.import_new) {
            const baseSlug = slugify(p.name) || `ul-${p.id}`;
            let slug = baseSlug;
            for (let i = 2; i < 20; i++) {
              const { data: exists } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
              if (!exists) break;
              slug = `${baseSlug}-${i}`;
            }
            const { error } = await supabase.from("products").insert({
              name: p.name,
              description: p.description ?? "",
              slug,
              price_try: finalPrice,
              external_price: p.amount,
              category: cat.name || "Dijital Ürünler",
              active: false,
              manual_fulfillment: true,
              unlimited_stock: !!p.is_automatic_delivery,
              supplier_out_of_stock: outOfStock,
              source: "uniquelisans",
              external_id: key,
              stock_hint: p.stock_count ?? null,
              image_url: resolveLogoUrl(p.name),
            });
            if (error) { res.failed++; continue; }
            res.inserted++;
          }

        }
      } catch {
        res.failed++;
      }
    }
  }

  return res;
}

async function notifyStockBack(
  supabase: SB,
  productId: string,
  productName: string,
  stockCount: number | null,
): Promise<void> {
  try {
    // Adminlere Telegram bildirimi
    const stockLine = stockCount !== null ? ` (stok: ${stockCount})` : "";
    await notifyTelegram(
      `✅ <b>Stok yenilendi</b>\n<b>${productName}</b>${stockLine}\nSatışlar tekrar açık.`,
    );
  } catch { /* telegram opsiyonel */ }

  try {
    // Abone kullanıcılara bildirim
    const { data: subs } = await supabase
      .from("stock_notifications")
      .select("id, user_id")
      .eq("product_id", productId)
      .is("notified_at", null);

    const rows = (subs ?? []) as Array<{ id: string; user_id: string }>;
    if (rows.length === 0) return;

    const notifRows = rows.map((r) => ({
      user_id: r.user_id,
      title: "Beklediğin ürün stokta!",
      body: `${productName} tekrar satışta. Hemen sipariş verebilirsin.`,
      type: "stock_back",
      link: `/urun/${productId}`,
    }));
    await supabase.from("notifications").insert(notifRows);

    await supabase
      .from("stock_notifications")
      .update({ notified_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id));
  } catch { /* bildirim başarısız olsa dahi sync devam etsin */ }
}
