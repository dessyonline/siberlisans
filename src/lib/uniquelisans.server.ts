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

