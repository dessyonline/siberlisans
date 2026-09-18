// Server-only: Uniquelisans tam katalog senkronu.
// Route dosyalarından ve server function handler'larından DİNAMİK import ile çağrılır.
import { resolveLogoUrl } from "@/lib/logo-resolver";
import { notifyTelegram } from "@/lib/telegram.server";
import { mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
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
  try { body = JSON.parse(text); } catch { throw new Error(`Uniquelisans yanıtı JSON değil: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`Uniquelisans hatası [${res.status}]: ${text.slice(0, 200)}`);
  return body as Record<string, unknown>;
}

export type CatalogSyncOpts = {
  markup_percent: number;
  import_new: boolean;
  reactivate: boolean;
};

export type CatalogSyncResult = {
  scanned: number; inserted: number; updated: number;
  price_changed: number; hidden: number; reactivated: number; failed: number;
};

type ExistingRow = {
  id: string; active: boolean; image_url: string | null;
  price_try: number; external_price: number | null; stock_hint: number | null;
  supplier_out_of_stock: boolean | null; price_locked: boolean | null;
};

export async function runUniquelisansCatalogSync(
  opts: CatalogSyncOpts,
): Promise<CatalogSyncResult> {
  const catsBody = await ul("/categories");
  const categories = (catsBody.categories ?? []) as Array<{
    id: number; name: string;
    subcategories: Array<{ id: number; category_id: number; name: string }>;
  }>;

  const existingRows = await mysqlQuery<{
    id: string; external_id: string | null; active: number | null; image_url: string | null;
    price_try: string | number | null; external_price: string | number | null; stock_hint: number | null;
    supplier_out_of_stock: number | null; price_locked: number | null;
  }>(
    "SELECT id, external_id, active, image_url, price_try, external_price, stock_hint, supplier_out_of_stock, price_locked FROM products WHERE source='uniquelisans'",
  );

  const existing = new Map<string, ExistingRow>();
  for (const r of existingRows) {
    if (r.external_id) {
      existing.set(String(r.external_id), {
        id: r.id,
        active: bool(r.active),
        image_url: r.image_url,
        price_try: num(r.price_try) ?? 0,
        external_price: r.external_price == null ? null : num(r.external_price),
        stock_hint: r.stock_hint,
        supplier_out_of_stock: bool(r.supplier_out_of_stock),
        price_locked: bool(r.price_locked),
      });
    }
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
          const MIN_PROFIT_TL = 200;
          const marked = Math.round(p.amount * (1 + opts.markup_percent / 100));
          const floor = Math.round(p.amount + MIN_PROFIT_TL);
          const finalPrice = Math.max(1, marked, floor);
          const outOfStock = !p.is_automatic_delivery
            && typeof p.stock_count === "number"
            && p.stock_count <= 0;

          const prev = existing.get(key);
          if (prev) {
            const sets: string[] = ["external_price=?", "stock_hint=?", "unlimited_stock=?"];
            const vals: Array<string | number | null> = [p.amount, p.stock_count ?? null, p.is_automatic_delivery ? 1 : 0];
            let priceChanged = false;
            if (Number(prev.external_price ?? 0) !== p.amount) {
              if (!prev.price_locked) { sets.push("price_try=?"); vals.push(finalPrice); }
              priceChanged = true;
              res.price_changed++;
            }
            let stockFlagChanged: boolean | null = null;
            if (outOfStock && !prev.supplier_out_of_stock) {
              sets.push("supplier_out_of_stock=?"); vals.push(1);
              stockFlagChanged = true;
              res.hidden++;
            } else if (!outOfStock && prev.supplier_out_of_stock) {
              sets.push("supplier_out_of_stock=?"); vals.push(0);
              stockFlagChanged = false;
              res.reactivated++;
            }
            void priceChanged;
            sets.push("updated_at=?"); vals.push(ts());
            vals.push(prev.id);
            try {
              await mysqlQuery(`UPDATE products SET ${sets.join(", ")} WHERE id=?`, vals);
            } catch {
              res.failed++; continue;
            }
            res.updated++;
            if (stockFlagChanged === false) {
              await notifyStockBack(prev.id, p.name, p.stock_count ?? null);
            }
          } else if (opts.import_new) {
            const baseSlug = slugify(p.name) || `ul-${p.id}`;
            let slug = baseSlug;
            for (let i = 2; i < 20; i++) {
              const exists = await mysqlOne<{ id: string }>("SELECT id FROM products WHERE slug=?", [slug]);
              if (!exists) break;
              slug = `${baseSlug}-${i}`;
            }
            try {
              await mysqlQuery(
                `INSERT INTO products (id,name,description,slug,price_try,external_price,category,active,manual_fulfillment,unlimited_stock,supplier_out_of_stock,source,external_id,stock_hint,image_url,created_at,updated_at)
                 VALUES (?,?,?,?,?,?,?,0,1,?,?, 'uniquelisans',?,?,?,?,?)`,
                [
                  uid(),
                  p.name,
                  p.description ?? "",
                  slug,
                  finalPrice,
                  p.amount,
                  cat.name || "Dijital Ürünler",
                  p.is_automatic_delivery ? 1 : 0,
                  outOfStock ? 1 : 0,
                  key,
                  p.stock_count ?? null,
                  resolveLogoUrl(p.name),
                  ts(),
                  ts(),
                ],
              );
            } catch {
              res.failed++; continue;
            }
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
    const subs = await mysqlQuery<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM stock_notifications WHERE product_id=? AND notified_at IS NULL",
      [productId],
    );
    if (subs.length === 0) return;

    for (const r of subs) {
      await mysqlQuery(
        "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
        [uid(), r.user_id, "stock_back", "Beklediğin ürün stokta!", `${productName} tekrar satışta. Hemen sipariş verebilirsin.`, `/urun/${productId}`, ts()],
      );
    }
    const ids = subs.map((r) => r.id);
    if (ids.length > 0) {
      await mysqlQuery(
        `UPDATE stock_notifications SET notified_at=? WHERE id IN (${ids.map(() => "?").join(",")})`,
        [ts(), ...ids],
      );
    }
  } catch { /* bildirim başarısız olsa dahi sync devam etsin */ }
}
