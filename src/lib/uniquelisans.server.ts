// Server-only helpers for Uniquelisans purchase flow.
// Never import from client-reachable modules directly — always via dynamic import
// inside a server function/handler body.

const DEFAULT_URL = "https://bayi.uniquelisans.com/api";

export type UlBuyResponse = {
  status: "success" | "pending" | "error" | string;
  code: number;
  order_id?: number;
  delivery_data?: string | null;
  message?: string;
  required_fields?: Record<string, string[]>;
};

/**
 * POST /orders with product_id + required_field params.
 * Bilgiler `required_fields` altında değil, doğrudan üst düzey parametre olarak gönderilir
 * (Uniquelisans dökümanına göre: email/link/wordpress_link/wordpress_user/wordpress_password ...).
 */
export async function ulBuy(
  externalId: number,
  fields: Record<string, string>,
): Promise<UlBuyResponse> {
  const key = process.env.UNIQUELISANS_API_KEY;
  const base = process.env.UNIQUELISANS_API_URL || DEFAULT_URL;
  if (!key) throw new Error("UNIQUELISANS_API_KEY tanımlı değil.");

  const url = new URL(`${base}/orders`);
  url.searchParams.set("key", key);
  url.searchParams.set("product_id", String(externalId));
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const text = await res.text();
  let body: UlBuyResponse;
  try {
    body = JSON.parse(text) as UlBuyResponse;
  } catch {
    throw new Error(`Uniquelisans yanıtı JSON değil: ${text.slice(0, 200)}`);
  }
  return body;
}

export type UlStatusResponse = {
  status: "success" | "pending" | "error" | string;
  code?: number;
  order_id?: number;
  delivery_data?: string | null;
  message?: string;
};

/**
 * Sipariş durumunu Uniquelisans'tan sorgular.
 * Varsayılan endpoint: GET /orders/{id}?key=...
 * Farklıysa UNIQUELISANS_STATUS_PATH ile override edilir (örn. "/order-status/{id}").
 */
export async function ulOrderStatus(orderId: number | string): Promise<UlStatusResponse> {
  const key = process.env.UNIQUELISANS_API_KEY;
  const base = process.env.UNIQUELISANS_API_URL || DEFAULT_URL;
  if (!key) throw new Error("UNIQUELISANS_API_KEY tanımlı değil.");

  const template = process.env.UNIQUELISANS_STATUS_PATH || "/orders/{id}";
  const path = template.replace("{id}", String(orderId));
  const url = new URL(`${base}${path}`);
  url.searchParams.set("key", key);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const text = await res.text();
  let body: UlStatusResponse;
  try {
    body = JSON.parse(text) as UlStatusResponse;
  } catch {
    throw new Error(`Uniquelisans durum yanıtı JSON değil (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok && !body.status) {
    throw new Error(`Uniquelisans durum HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return body;
}

/**
 * Sipariş oluşturmadan hemen önce Uniquelisans tarafında ürünün stok/fiyat durumunu doğrular.
 * Fail-open: API'ye ulaşılamıyorsa engellemez (yerel stok kontrolü devrede kalır).
 */
export async function ulCheckAvailability(externalId: number): Promise<{
  ok: boolean;
  reason?: "out_of_stock" | "inactive";
  amount?: number;
  stock_count?: number | null;
  is_stock?: boolean;
}> {
  const key = process.env.UNIQUELISANS_API_KEY;
  const base = process.env.UNIQUELISANS_API_URL || DEFAULT_URL;
  if (!key) return { ok: true };
  try {
    const url = new URL(`${base}/products/${externalId}`);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: true };
    const body = (await res.json()) as {
      product_detail?: { amount: number; is_stock: boolean; stock_count: number | null };
    };
    const d = body.product_detail;
    if (!d) return { ok: true };
    const out = d.is_stock && typeof d.stock_count === "number" && d.stock_count <= 0;
    if (out) return { ok: false, reason: "out_of_stock", amount: d.amount, stock_count: d.stock_count, is_stock: d.is_stock };
    return { ok: true, amount: d.amount, stock_count: d.stock_count, is_stock: d.is_stock };
  } catch {
    return { ok: true };
  }
}

/** Uniquelisans bayi bakiyesi. Ulaşılamazsa null döner (bloklamaz). */
export async function ulGetBalance(): Promise<number | null> {
  const key = process.env.UNIQUELISANS_API_KEY;
  const base = process.env.UNIQUELISANS_API_URL || DEFAULT_URL;
  if (!key) return null;
  try {
    const url = new URL(`${base}/balance`);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const body = (await res.json()) as { balance?: number };
    return Number(body.balance ?? 0);
  } catch {
    return null;
  }
}

/** Admin panel loglarına Uniquelisans stok/bakiye kontrol sonucunu yazar. */
export async function logSupplierCheck(entry: {
  user_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  external_id?: string | number | null;
  stock_ok?: boolean | null;
  stock_count?: number | null;
  is_stock?: boolean | null;
  supplier_amount?: number | null;
  balance?: number | null;
  balance_ok?: boolean | null;
  blocked: boolean;
  block_reason?: string | null;
  context: "single_order" | "cart_order";
  error?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("supplier_check_logs").insert({
      source: "uniquelisans",
      user_id: entry.user_id ?? null,
      product_id: entry.product_id ?? null,
      product_name: entry.product_name ?? null,
      external_id: entry.external_id != null ? String(entry.external_id) : null,
      stock_ok: entry.stock_ok ?? null,
      stock_count: entry.stock_count ?? null,
      is_stock: entry.is_stock ?? null,
      supplier_amount: entry.supplier_amount ?? null,
      balance: entry.balance ?? null,
      balance_ok: entry.balance_ok ?? null,
      blocked: entry.blocked,
      block_reason: entry.block_reason ?? null,
      context: entry.context,
      error: entry.error ?? null,
    });
  } catch (e) {
    console.error("[supplier_check_log]", (e as Error).message);
  }
}



