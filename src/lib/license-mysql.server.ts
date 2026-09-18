// Shared MySQL helpers for the license-related public endpoints and hooks.
// Server-only.
import { mysqlQuery, mysqlOne, bool } from "@/lib/mysql.server";
import { json } from "@/lib/license-api.server";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function uid(): string {
  return crypto.randomUUID();
}

function randomB64Token(bytes = 18): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "").replace(/\//g, "").replace(/=/g, "");
}

/**
 * Reject stale timestamps (±5 min) and previously seen nonces.
 * Returns null on OK, or an error Response.
 */
export async function guardReplayMysql(
  license_key: string,
  tsVal: unknown,
  nonce: unknown,
): Promise<Response | null> {
  const tsNum = Number(tsVal);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > REPLAY_WINDOW_MS) {
    return json({ success: false, valid: false, error: "Geçersiz istek." }, 400);
  }
  const n = (nonce ?? "").toString().trim();
  if (!n || n.length < 6 || n.length > 128) {
    return json({ success: false, valid: false, error: "Geçersiz istek." }, 400);
  }
  const dup = await mysqlOne<{ id: string }>("SELECT id FROM license_nonces WHERE nonce=?", [n]);
  if (dup) {
    return json({ success: false, valid: false, error: "Geçersiz istek." }, 409);
  }
  try {
    await mysqlQuery("INSERT INTO license_nonces (id,nonce,license_key,created_at) VALUES (?,?,?,?)", [
      uid(),
      n,
      license_key,
      ts(),
    ]);
  } catch (e) {
    console.error("[license-mysql] nonce insert failed", (e as Error).message);
  }
  return null;
}

export type LicenseEventName =
  | "activate"
  | "validate"
  | "revoke"
  | "fail"
  | "admin_create"
  | "admin_revoke"
  | "unlock"
  | "tampering"
  | "hwid_reset";

export async function logEventMysql(entry: {
  license_key: string;
  event: LicenseEventName;
  hwid?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await mysqlQuery(
      "INSERT INTO license_events (id,license_key,event,hwid,ip,user_agent,detail,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), entry.license_key, entry.event, entry.hwid ?? null, entry.ip ?? null, entry.user_agent ?? null, entry.detail ?? null, ts()],
    );
  } catch (e) {
    console.error("[license-mysql] event log failed", (e as Error).message);
  }
}

const LOVABLE_PRODUCT_ID = "4f6d86cf-6a89-4940-90af-953cc3d6ab5f";

type ProductRow = {
  id: string;
  delivery_type: string;
  slug: string | null;
  unlimited_stock: number | null;
  manual_fulfillment: number | null;
};

function genLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "SIBER";
  for (let i = 0; i < 3; i++) {
    let seg = "";
    for (let j = 0; j < 4; j++) seg += chars[Math.floor(Math.random() * chars.length)];
    out += "-" + seg;
  }
  return out;
}

async function assignOneUnit(product: ProductRow, orderId: string): Promise<{ key: string | null; token: string | null }> {
  if (bool(product.manual_fulfillment)) return { key: null, token: null };

  const isLovable =
    product.id === LOVABLE_PRODUCT_ID || (product.slug ?? "").toLowerCase().startsWith("lovable");

  if (isLovable) {
    let keyId: string | null = null;
    let keyValue: string | null = null;
    for (let attempt = 0; attempt < 12 && !keyId; attempt++) {
      const candidate = genLicenseKey();
      const newId = uid();
      try {
        await mysqlQuery("INSERT INTO license_keys (id,product_id,key_value,status,created_at) VALUES (?,?,?,'available',?)", [
          newId,
          product.id,
          candidate,
          ts(),
        ]);
        keyId = newId;
        keyValue = candidate;
      } catch {
        // unique violation - retry
      }
    }
    if (!keyId) throw new Error("Key üretilemedi");

    let token: string | null = null;
    if (product.delivery_type === "link_token") {
      token = randomB64Token();
      await mysqlQuery(
        "UPDATE license_keys SET status='assigned', assigned_order_id=?, assigned_at=?, activation_token=COALESCE(activation_token,?) WHERE id=?",
        [orderId, ts(), token, keyId],
      );
      const row = await mysqlOne<{ activation_token: string | null }>(
        "SELECT activation_token FROM license_keys WHERE id=?",
        [keyId],
      );
      token = row?.activation_token ?? token;
    } else {
      await mysqlQuery("UPDATE license_keys SET status='assigned', assigned_order_id=?, assigned_at=? WHERE id=?", [
        orderId,
        ts(),
        keyId,
      ]);
    }
    await mysqlQuery("INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,?)", [
      uid(),
      orderId,
      keyId,
      ts(),
    ]);
    return { key: keyValue, token };
  }

  if (bool(product.unlimited_stock)) {
    const cand = await mysqlOne<{ id: string; key_value: string }>(
      "SELECT id,key_value FROM license_keys WHERE product_id=? AND (revoked IS NULL OR revoked=0) ORDER BY (status='available') DESC, created_at ASC LIMIT 1",
      [product.id],
    );
    if (!cand) throw new Error(`Sınırsız stok ürününde havuzda key yok (ürün id: ${product.id})`);
    await mysqlQuery("INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,?)", [
      uid(),
      orderId,
      cand.id,
      ts(),
    ]);
    return { key: cand.key_value, token: null };
  }

  const cand = await mysqlOne<{ id: string; key_value: string }>(
    "SELECT id,key_value FROM license_keys WHERE product_id=? AND status='available' ORDER BY created_at ASC LIMIT 1",
    [product.id],
  );
  if (!cand) throw new Error(`Stokta anahtar tükendi (ürün id: ${product.id})`);

  let token: string | null = null;
  if (product.delivery_type === "link_token") {
    token = randomB64Token();
    await mysqlQuery(
      "UPDATE license_keys SET status='assigned', assigned_order_id=?, assigned_at=?, activation_token=COALESCE(activation_token,?) WHERE id=? AND status='available'",
      [orderId, ts(), token, cand.id],
    );
    const row = await mysqlOne<{ activation_token: string | null }>(
      "SELECT activation_token FROM license_keys WHERE id=?",
      [cand.id],
    );
    token = row?.activation_token ?? token;
  } else {
    await mysqlQuery(
      "UPDATE license_keys SET status='assigned', assigned_order_id=?, assigned_at=? WHERE id=? AND status='available'",
      [orderId, ts(), cand.id],
    );
  }
  await mysqlQuery("INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,?)", [
    uid(),
    orderId,
    cand.id,
    ts(),
  ]);
  return { key: cand.key_value, token };
}

/**
 * Ports `public._assign_key_to_order` (Postgres RPC) to MySQL.
 * Assigns license keys for either a single-product order or a cart (order_items) order.
 */
export async function assignKeyToOrder(orderId: string): Promise<{ licenseKey: string | null; activationToken: string | null }> {
  const items = await mysqlQuery<{ product_id: string; quantity: number }>(
    "SELECT product_id, quantity FROM order_items WHERE order_id=?",
    [orderId],
  );

  let first: { key: string | null; token: string | null } | null = null;

  if (items.length === 0) {
    const order = await mysqlOne<{ product_id: string | null }>("SELECT product_id FROM orders WHERE id=?", [orderId]);
    if (!order?.product_id) throw new Error("Sipariş için ürün bulunamadı");
    const product = await mysqlOne<ProductRow>(
      "SELECT id, delivery_type, slug, unlimited_stock, manual_fulfillment FROM products WHERE id=?",
      [order.product_id],
    );
    if (!product) throw new Error("Ürün bulunamadı");
    first = await assignOneUnit(product, orderId);
  } else {
    for (const item of items) {
      const product = await mysqlOne<ProductRow>(
        "SELECT id, delivery_type, slug, unlimited_stock, manual_fulfillment FROM products WHERE id=?",
        [item.product_id],
      );
      if (!product || bool(product.manual_fulfillment)) continue;
      for (let q = 0; q < Number(item.quantity); q++) {
        const r = await assignOneUnit(product, orderId);
        if (!first) first = r;
      }
    }
  }

  return { licenseKey: first?.key ?? null, activationToken: first?.token ?? null };
}
