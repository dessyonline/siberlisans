// Server-only: Uniquelisans katalog ve stok/fiyat senkronu.
// Route dosyalarından ve server function handler'larından DİNAMİK import ile çağrılır.
import { resolveLogoUrl } from "@/lib/logo-resolver";
import { notifyTelegram, postToChannel } from "@/lib/telegram.server";
import { mysqlExec, mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";
import { priceApprovalMessage, queueUniquelisansPriceApproval, type PriceApprovalNotice } from "@/lib/uniquelisans-price-approval.server";

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";
const DEFAULT_MARKUP_PERCENT = 20;
const MIN_PROFIT_TL = 200;
const LOCK_MINUTES = 10;

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

function priceWithFloor(cost: number, markupPercent: number) {
  const marked = Math.round(cost * (1 + markupPercent / 100));
  const floor = Math.round(cost + MIN_PROFIT_TL);
  return Math.max(1, marked, floor);
}

function escapeTelegramHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class UlHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UL_TIMEOUT_MS = 12_000;

async function ulOnce(path: string, params: Record<string, string | number>) {
  const key = process.env.UNIQUELISANS_API_KEY;
  const base = process.env.UNIQUELISANS_API_URL || DEFAULT_URL;
  if (!key) throw new Error("UNIQUELISANS_API_KEY tanımlı değil.");

  const url = new URL(`${base}${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UL_TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as Error).name;
    throw new UlHttpError(0, name === "TimeoutError" || name === "AbortError"
      ? "Tedarikçi yanıt vermedi (zaman aşımı)"
      : `Tedarikçiye bağlanılamadı: ${(error as Error).message}`);
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new UlHttpError(res.status, `Tedarikçi yanıtı okunamadı (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = (body as { message?: string })?.message;
    throw new UlHttpError(res.status, res.status === 404
      ? "Tedarikçide bulunamadı (ürün kaldırılmış)"
      : `Tedarikçi hatası [${res.status}]${msg ? `: ${msg}` : ""}`);
  }
  return body as Record<string, unknown>;
}

/** Zaman aşımı / 5xx / 429 durumunda bir kez daha dener; 404 gibi kesin hatalarda denemez. */
async function ul(path: string, params: Record<string, string | number> = {}) {
  try {
    return await ulOnce(path, params);
  } catch (error) {
    const status = error instanceof UlHttpError ? error.status : 0;
    if (status === 0 || status === 429 || status >= 500) {
      await new Promise((r) => setTimeout(r, 800));
      return await ulOnce(path, params);
    }
    throw error;
  }
}

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

type RequiredField = {
  name: string;
  el_type: string;
  input_type: string;
  required: boolean;
};

type SupplierProduct = {
  id: number;
  name: string;
  description: string;
  amount: number;
  is_stock: boolean;
  stock_count: number | null;
  is_automatic_delivery: boolean;
  required_fields?: RequiredField[];
};

type SupplierDetail = {
  amount: number;
  is_stock: boolean;
  is_automatic_delivery: boolean;
  stock_count: number | null;
  required_fields?: RequiredField[];
};

// is_stock=false: tedarikçi stok takibi yapmıyor (manuel teslim, siparişe göre); stok yok DEĞİL.
function isOutOfStock(product: Pick<SupplierProduct, "is_automatic_delivery" | "is_stock" | "stock_count">) {
  return !product.is_automatic_delivery
    && product.is_stock === true && typeof product.stock_count === "number" && product.stock_count <= 0;
}

function emptyResult<T extends object>(result: T) {
  return { ...result, skipped: true };
}

/** Aynı cron işinin birden fazla instance tarafından üst üste çalışmasını sınırlar. */
async function withSyncLock<T extends object>(
  syncKey: string,
  baseResult: T,
  task: () => Promise<T>,
): Promise<T & { skipped?: boolean }> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
  let lockAvailable = true;

  try {
    const affected = await mysqlExec(
      `UPDATE uniquelisans_sync_state
          SET lock_until=?, status='running', last_started_at=?, last_error=NULL, updated_at=?
        WHERE sync_key=? AND (lock_until IS NULL OR lock_until < ?)`,
      [ts(lockUntil), ts(now), ts(now), syncKey, ts(now)],
    );
    lockAvailable = affected === 1;
  } catch (error) {
    // Migration henüz uygulanmadıysa manuel senkronu tamamen kilitlemeyelim;
    // bir sonraki deploy'da kalıcı kilit devreye girer.
    console.error("[uniquelisans] sync lock unavailable", (error as Error).message);
  }

  if (!lockAvailable) return emptyResult(baseResult);

  try {
    const result = await task();
    await updateSyncState(syncKey, "success", result);
    return result;
  } catch (error) {
    await updateSyncState(syncKey, "failed", null, (error as Error).message);
    throw error;
  }
}

async function updateSyncState(
  syncKey: string,
  status: "success" | "failed",
  result: object | null,
  error?: string,
) {
  try {
    const now = ts();
    await mysqlQuery(
      `UPDATE uniquelisans_sync_state
          SET lock_until=NULL, status=?, last_finished_at=?, last_success_at=CASE WHEN ?='success' THEN ? ELSE last_success_at END,
              last_error=?, last_result=?, updated_at=?
        WHERE sync_key=?`,
      [status, now, status, now, error ?? null, result ? JSON.stringify(result) : null, now, syncKey],
    );
  } catch (stateError) {
    console.error("[uniquelisans] sync state update failed", (stateError as Error).message);
  }
}

export type CatalogSyncOpts = {
  markup_percent: number;
  import_new: boolean;
  reactivate: boolean;
};

export type CatalogSyncResult = {
  scanned: number;
  inserted: number;
  updated: number;
  price_changed: number;
  price_decreased: number;
  hidden: number;
  reactivated: number;
  auto_published: number;
  failed: number;
};

export type StockSyncOpts = {
  markup_percent?: number;
  reactivate: boolean;
};

export type StockSyncError = {
  id: string;
  name: string;
  external_id: string | null;
  kind: "not_found" | "timeout" | "error";
  message: string;
  hidden: boolean;
};

export type StockSyncResult = {
  checked: number;
  updated: number;
  price_changed: number;
  price_decreased: number;
  hidden: number;
  reactivated: number;
  failed: number;
  errors: StockSyncError[];
  /** Kendi ürün ↔ tedarikçi eşleşmelerinde görünür tarafı değiştirilen sayısı */
  switched: number;
};

type ExistingRow = {
  id: string;
  active: boolean;
  image_url: string | null;
  price_try: number;
  external_price: number | null;
  stock_hint: number | null;
  supplier_out_of_stock: boolean;
  price_locked: boolean;
  supplier_auto_publish: boolean;
};

async function loadRequiredFields(externalId: number): Promise<RequiredField[] | null> {
  try {
    const body = await ul(`/products/${externalId}`);
    const detail = body.product_detail as { required_fields?: RequiredField[] } | undefined;
    return Array.isArray(detail?.required_fields) ? detail.required_fields : [];
  } catch {
    // Ürün içe aktarılabilir; ancak gerekli kullanıcı alanları doğrulanmadan
    // otomatik satışa açılmaz.
    return null;
  }
}

async function notifyPriceApprovals(items: PriceApprovalNotice[]) {
  if (!items.length) return;
  const messages = items.slice(0, 12).map(priceApprovalMessage);
  const suffix = items.length > messages.length ? `\n\n… ve ${items.length - messages.length} ürün daha` : "";
  try {
    // Onay gelmeden kanala indirim duyurusu yapılmaz; teklif yalnızca admin
    // sohbetine gider. Onay sonrası fiyat ürün akışına yansır.
    await notifyTelegram(`${messages.join("\n\n──────────\n\n")}${suffix}`);
  } catch { /* Telegram opsiyoneldir; katalog senkronu başarısız sayılmaz. */ }
}

async function notifyTelegramAndChannel(text: string) {
  await notifyTelegram(text);
  const result = await postToChannel({ text });
  if (!result.ok && result.error !== "TELEGRAM_CHANNEL_ID yok") {
    console.error("[telegram][channel]", result.error);
  }
}

async function notifyStockOut(productName: string, stockCount: number | null) {
  const count = stockCount === null ? "bilinmiyor" : String(stockCount);
  await notifyTelegramAndChannel(
    `⚠️ <b>Uniquelisans stok tükendi</b>\n<b>${escapeTelegramHtml(productName)}</b>\nTedarikçi stoğu: ${count}\nÜrün satışa kapatıldı; stok gelince otomatik açılacak.`,
  );
}

async function notifyNewProducts(names: string[]) {
  if (!names.length) return;
  const lines = names.slice(0, 12).map((name) => `• ${escapeTelegramHtml(name)}`);
  const suffix = names.length > lines.length ? `\n… ve ${names.length - lines.length} ürün daha` : "";
  try {
    await notifyTelegram(`🆕 <b>Uniquelisans yeni ürünleri yayınlandı</b>\n${lines.join("\n")}${suffix}`);
  } catch { /* Telegram opsiyoneldir */ }
}

export async function runUniquelisansCatalogSync(
  opts: CatalogSyncOpts,
): Promise<CatalogSyncResult & { skipped?: boolean }> {
  const baseResult: CatalogSyncResult = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    price_changed: 0,
    price_decreased: 0,
    hidden: 0,
    reactivated: 0,
    auto_published: 0,
    failed: 0,
  };

  return withSyncLock("catalog", baseResult, async () => {
    const catsBody = await ul("/categories");
    const categories = (catsBody.categories ?? []) as Array<{
      id: number;
      name: string;
      subcategories: Array<{ id: number; category_id: number; name: string }>;
    }>;

    const existingRows = await mysqlQuery<{
      id: string;
      external_id: string | null;
      active: number | null;
      image_url: string | null;
      price_try: string | number | null;
      external_price: string | number | null;
      stock_hint: number | null;
      supplier_out_of_stock: number | null;
      price_locked: number | null;
      supplier_auto_publish: number | null;
    }>(
      `SELECT id, external_id, active, image_url, price_try, external_price, stock_hint,
              supplier_out_of_stock, price_locked, supplier_auto_publish
         FROM products WHERE source='uniquelisans'`,
    );

    const existing = new Map<string, ExistingRow>();
    for (const r of existingRows) {
      if (!r.external_id) continue;
      existing.set(String(r.external_id), {
        id: r.id,
        active: bool(r.active),
        image_url: r.image_url,
        price_try: num(r.price_try) ?? 0,
        external_price: r.external_price == null ? null : num(r.external_price),
        stock_hint: r.stock_hint,
        supplier_out_of_stock: bool(r.supplier_out_of_stock),
        price_locked: bool(r.price_locked),
        supplier_auto_publish: bool(r.supplier_auto_publish),
      });
    }

    const result = { ...baseResult };
    const newAutoPublishIds: string[] = [];
    const newProductNames: string[] = [];
    const priceApprovals: PriceApprovalNotice[] = [];

    for (const cat of categories) {
      const subs = cat.subcategories?.length
        ? cat.subcategories
        : [{ id: 0, category_id: cat.id, name: cat.name }];

      for (const sub of subs) {
        try {
          const params: Record<string, number> = { category_id: cat.id };
          if (sub.id) params.sub_category_id = sub.id;
          const listBody = await ul("/products", params);
          const products = (listBody.products ?? []) as SupplierProduct[];

          for (const p of products) {
            result.scanned++;
            const key = String(p.id);
            const finalPrice = priceWithFloor(p.amount, opts.markup_percent);
            const outOfStock = isOutOfStock(p);
            const prev = existing.get(key);

            if (prev) {
              // Stok bilgisi (stock_hint / gizle-aç) yalnızca ürün detayından okunan
              // stok senkronunda değişir. Liste uç noktası farklı/eksik stok
              // döndürebildiği için burada stok alanlarına dokunmuyoruz; aksi halde
              // iki senkron birbirini bozup ürünü sürekli açıp kapatıyordu.
              const sets: string[] = ["external_price=?", "unlimited_stock=?", "supplier_sync_error=NULL", "supplier_missing_count=0"];
              const vals: Array<string | number | null> = [
                p.amount,
                p.is_automatic_delivery ? 1 : 0,
              ];

              const previousSupplierPrice = prev.external_price;
              if (previousSupplierPrice === null || previousSupplierPrice !== p.amount) {
                if (!prev.price_locked && finalPrice !== prev.price_try) {
                  if (finalPrice < prev.price_try && previousSupplierPrice !== null) {
                    result.price_decreased++;
                    try {
                      const approval = await queueUniquelisansPriceApproval({
                        product_id: prev.id,
                        external_id: key,
                        product_name: p.name,
                        supplier_previous_price: previousSupplierPrice,
                        supplier_new_price: p.amount,
                        current_price: prev.price_try,
                        proposed_price: finalPrice,
                      });
                      if (approval) priceApprovals.push(approval);
                    } catch (error) {
                      result.failed++;
                      console.error("[uniquelisans] price approval queue failed", (error as Error).message);
                    }
                  } else if (finalPrice > prev.price_try) {
                    // Maliyet artışları marj tabanını korumak için otomatik
                    // yükseltilebilir; indirimler admin onayı bekler.
                    sets.push("price_try=?");
                    vals.push(finalPrice);
                  }
                }
                result.price_changed++;
              }

              const stockFlagChanged = null as "hidden" | "reactivated" | null;
              const shouldLaunch = false;

              sets.push("updated_at=?");
              vals.push(ts(), prev.id);
              try {
                await mysqlQuery(`UPDATE products SET ${sets.join(", ")} WHERE id=?`, vals);
                result.updated++;
              } catch {
                result.failed++;
                continue;
              }

              if (shouldLaunch) newAutoPublishIds.push(prev.id);
              if (stockFlagChanged === "reactivated") {
                await notifyStockBack(prev.id, p.name, p.stock_count ?? null);
              } else if (stockFlagChanged === "hidden") {
                await notifyStockOut(p.name, p.stock_count ?? null);
              }
              continue;
            }

            if (!opts.import_new) continue;

            const baseSlug = slugify(p.name) || `ul-${p.id}`;
            let slug = baseSlug;
            for (let i = 2; i < 20; i++) {
              const exists = await mysqlOne<{ id: string }>("SELECT id FROM products WHERE slug=?", [slug]);
              if (!exists) break;
              slug = `${baseSlug}-${i}`;
            }

            // Otomatik teslim ürünlerinde ek alan gerekmez. Manuel stokta ise
            // detay endpoint'i doğrulanmadan ürün satışa açılmaz.
            const requiredFields = p.is_automatic_delivery
              ? (Array.isArray(p.required_fields) ? p.required_fields : [])
              : outOfStock
                ? null
                : await loadRequiredFields(p.id);
            const autoPublish = p.is_automatic_delivery || requiredFields !== null;
            const initialActive = autoPublish && !outOfStock;
            const id = uid();

            try {
              await mysqlQuery(
                `INSERT INTO products (id,name,description,slug,price_try,external_price,category,active,
                   manual_fulfillment,unlimited_stock,supplier_out_of_stock,source,external_id,required_fields,
                   stock_hint,image_url,supplier_auto_publish,created_at,updated_at)
                 VALUES (?,?,?,?,?,?,?, ?,1,?,?, 'uniquelisans',?,?,?,?,?,?,?)`,
                [
                  id,
                  p.name,
                  p.description ?? "",
                  slug,
                  finalPrice,
                  p.amount,
                  sub.name || cat.name || "Dijital Ürünler",
                  initialActive ? 1 : 0,
                  p.is_automatic_delivery ? 1 : 0,
                  outOfStock ? 1 : 0,
                  key,
                  JSON.stringify(requiredFields ?? []),
                  p.stock_count ?? null,
                  resolveLogoUrl(p.name),
                  autoPublish ? 1 : 0,
                  ts(),
                  ts(),
                ],
              );
            } catch {
              result.failed++;
              continue;
            }

            existing.set(key, {
              id,
              active: initialActive,
              image_url: resolveLogoUrl(p.name),
              price_try: finalPrice,
              external_price: p.amount,
              stock_hint: p.stock_count,
              supplier_out_of_stock: outOfStock,
              price_locked: false,
              supplier_auto_publish: autoPublish,
            });
            result.inserted++;
            if (initialActive) {
              result.auto_published++;
              newAutoPublishIds.push(id);
              newProductNames.push(p.name);
            }
          }
        } catch {
          result.failed++;
        }
      }
    }

    if (newAutoPublishIds.length) {
      try {
        const { launchProducts } = await import("./product-launch.server");
        await launchProducts(newAutoPublishIds);
      } catch (error) {
        console.error("[uniquelisans] new product launch failed", (error as Error).message);
      }
    }
    await notifyNewProducts(newProductNames);
    await notifyPriceApprovals(priceApprovals);
    return result;
  });
}

export async function runUniquelisansStockSync(
  opts: StockSyncOpts,
): Promise<StockSyncResult & { skipped?: boolean }> {
  const baseResult: StockSyncResult = {
    checked: 0,
    updated: 0,
    price_changed: 0,
    price_decreased: 0,
    hidden: 0,
    reactivated: 0,
    failed: 0,
    errors: [],
    switched: 0,
  };

  return withSyncLock("stock", baseResult, async () => {
    const rows = await mysqlQuery<{
      id: string;
      name: string | null;
      external_id: string | null;
      price_try: string | number | null;
      external_price: string | number | null;
      active: number | null;
      supplier_out_of_stock: number | null;
      price_locked: number | null;
      supplier_auto_publish: number | null;
      stock_hint: string | number | null;
      supplier_missing_count: string | number | null;
    }>(
      `SELECT id, name, external_id, price_try, external_price, active, supplier_out_of_stock,
              price_locked, supplier_auto_publish, stock_hint, supplier_missing_count
         FROM products WHERE source='uniquelisans'`,
    );

    const result: StockSyncResult = { ...baseResult, errors: [] };
    const priceApprovals: PriceApprovalNotice[] = [];
    const launchIds: string[] = [];
    const markup = opts.markup_percent ?? DEFAULT_MARKUP_PERCENT;

    const checkOne = async (p: (typeof rows)[number]) => {
      if (!p.external_id) return;
      result.checked++;
      const displayName = p.name ?? `Uniquelisans #${p.external_id}`;

      let detail: SupplierDetail | undefined;
      try {
        const body = await ul(`/products/${p.external_id}`);
        detail = body.product_detail as SupplierDetail | undefined;
        if (!detail) throw new UlHttpError(200, "Tedarikçi ürün detayı boş döndü");
      } catch (error) {
        result.failed++;
        const status = error instanceof UlHttpError ? error.status : 0;
        const notFound = status === 404;
        const kind: StockSyncError["kind"] = notFound ? "not_found" : status === 0 ? "timeout" : "error";
        const message = (error as Error).message;
        const missing = notFound ? (num(p.supplier_missing_count) ?? 0) + 1 : 0;
        // Tedarikçi ürünü kaldırdıysa (iki kontrol üst üste 404) müşteri
        // ulaşılamayacak ürünü satın alamasın diye satıştan çekilir.
        const hideNow = notFound && missing >= 2 && !bool(p.supplier_out_of_stock);
        try {
          await mysqlQuery(
            `UPDATE products SET supplier_sync_error=?, supplier_sync_error_at=?, supplier_missing_count=?${hideNow ? ", supplier_out_of_stock=1" : ""} WHERE id=?`,
            [message, ts(), missing, p.id],
          );
        } catch { /* hata kaydı opsiyonel */ }
        if (hideNow) result.hidden++;
        result.errors.push({
          id: p.id,
          name: displayName,
          external_id: p.external_id,
          kind,
          message,
          hidden: hideNow || (notFound && bool(p.supplier_out_of_stock)),
        });
        return;
      }

      try {
        const outOfStock = isOutOfStock(detail);
        const previousOos = bool(p.supplier_out_of_stock);
        const autoPublish = bool(p.supplier_auto_publish);
        const sets: string[] = [
          "external_price=?", "stock_hint=?", "unlimited_stock=?",
          "supplier_sync_error=NULL", "supplier_sync_error_at=NULL", "supplier_missing_count=0",
        ];
        const vals: Array<string | number | null> = [
          detail.amount,
          detail.stock_count ?? null,
          detail.is_automatic_delivery ? 1 : 0,
        ];
        let reactivatedNow = false;
        let hiddenNow = false;
        let shouldLaunch = false;

        const oldCost = num(p.external_price);
        const oldPrice = num(p.price_try) ?? 0;
        const nextPrice = priceWithFloor(detail.amount, markup);
        if (oldCost === null || oldCost !== detail.amount) {
          result.price_changed++;
          if (!bool(p.price_locked) && nextPrice !== oldPrice) {
            if (nextPrice < oldPrice && oldCost !== null) {
              result.price_decreased++;
              try {
                const approval = await queueUniquelisansPriceApproval({
                  product_id: p.id,
                  external_id: p.external_id!,
                  product_name: displayName,
                  supplier_previous_price: oldCost,
                  supplier_new_price: detail.amount,
                  current_price: oldPrice,
                  proposed_price: nextPrice,
                });
                if (approval) priceApprovals.push(approval);
              } catch (error) {
                console.error("[uniquelisans] price approval queue failed", (error as Error).message);
              }
            } else if (nextPrice > oldPrice) {
              sets.push("price_try=?");
              vals.push(nextPrice);
            }
          }
        }

        // Titreşim koruması: tek bir 0 okuması ürünü gizlemez; art arda iki
        // kontrolde de stok 0 görünürse gizlenir. Gizli ürün de ancak stok
        // gerçekten pozitifse (veya tedarikçi stok takibi yapmıyorsa) açılır.
        const prevHint = num(p.stock_hint);
        const confirmedOos = outOfStock && prevHint !== null && prevHint <= 0;
        const clearlyInStock = !outOfStock && (
          detail.is_automatic_delivery || detail.is_stock !== true ||
          (typeof detail.stock_count === "number" && detail.stock_count > 0)
        );
        if (confirmedOos && !previousOos) {
          sets.push("supplier_out_of_stock=?");
          vals.push(1);
          result.hidden++;
          hiddenNow = true;
        } else if (clearlyInStock && previousOos && opts.reactivate) {
          sets.push("supplier_out_of_stock=?");
          vals.push(0);
          if (autoPublish && !bool(p.active)) {
            sets.push("active=?");
            vals.push(1);
            shouldLaunch = true;
          }
          result.reactivated++;
          reactivatedNow = true;
        }

        sets.push("updated_at=?");
        vals.push(ts(), p.id);
        await mysqlQuery(`UPDATE products SET ${sets.join(", ")} WHERE id=?`, vals);
        result.updated++;
        if (shouldLaunch) launchIds.push(p.id);
        if (reactivatedNow) {
          await notifyStockBack(p.id, displayName, detail.stock_count);
        } else if (hiddenNow) {
          await notifyStockOut(displayName, detail.stock_count);
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          id: p.id,
          name: displayName,
          external_id: p.external_id,
          kind: "error",
          message: `Kayıt güncellenemedi: ${(error as Error).message}`,
          hidden: false,
        });
      }
    };

    // Tedarikçiyi boğmadan aynı anda 4 ürün kontrol edilir.
    await runPool(rows, 4, checkOne);

    if (launchIds.length) {
      try {
        const { launchProducts } = await import("./product-launch.server");
        await launchProducts(launchIds);
      } catch (error) {
        console.error("[uniquelisans] reactivation launch failed", (error as Error).message);
      }
    }
    try {
      const { applySupplierLinks } = await import("./uniquelisans-dedupe.server");
      result.switched = (await applySupplierLinks()).switched;
    } catch (error) {
      console.error("[uniquelisans] supplier link apply failed", (error as Error).message);
    }
    await notifyPriceApprovals(priceApprovals);
    result.errors.sort((a, b) => a.kind.localeCompare(b.kind));
    return result;
  });
}

async function notifyStockBack(
  productId: string,
  productName: string,
  stockCount: number | null,
): Promise<void> {
  try {
    const stockLine = stockCount !== null ? ` (stok: ${stockCount})` : "";
    await notifyTelegramAndChannel(
      `✅ <b>Stok yenilendi</b>\n<b>${escapeTelegramHtml(productName)}</b>${stockLine}\nSatışlar tekrar açık.`,
    );
  } catch { /* Telegram opsiyonel */ }

  try {
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
    await mysqlQuery(
      `UPDATE stock_notifications SET notified_at=? WHERE id IN (${ids.map(() => "?").join(",")})`,
      [ts(), ...ids],
    );
  } catch { /* bildirim başarısız olsa dahi sync devam eder */ }
}
