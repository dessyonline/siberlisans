// Server-only UniQLisans teslimat yardımcıları.
// Tedarikçi siparişi oluşturulduktan sonra tekilleştirilmiş teslim kaydı üretir.
import { mysqlExec, mysqlOne, mysqlQuery } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function uid() {
  return crypto.randomUUID();
}

export type RecordUniquelisansDeliveryInput = {
  orderId: string;
  productId: string;
  deliveryData: string;
  externalOrderId?: number | string | null;
  externalStatus?: string;
};

export type RecordUniquelisansDeliveryResult = {
  licenseKey: string;
  activationToken: string | null;
  created: boolean;
};

/**
 * Aynı tedarikçi teslimatının cron, admin ve ödeme isteği tarafından iki kez
 * lisans olarak yazılmasını engeller. DB köprüsü transaction sunmadığı için
 * önce siparişe bağlı anahtar aranır, yarış durumunda tekrar okunur.
 */
export async function recordUniquelisansDelivery(
  input: RecordUniquelisansDeliveryInput,
): Promise<RecordUniquelisansDeliveryResult> {
  const existingLink = await mysqlOne<{
    id: string;
    key_value: string;
    activation_token: string | null;
  }>(
    `SELECT lk.id, lk.key_value, lk.activation_token
       FROM order_keys ok
       JOIN license_keys lk ON lk.id=ok.license_key_id
      WHERE ok.order_id=? LIMIT 1`,
    [input.orderId],
  );

  if (existingLink) {
    await mysqlExec(
      `UPDATE orders
          SET status='approved', approved_at=COALESCE(approved_at,?),
              external_order_id=COALESCE(?,external_order_id),
              external_delivery_data=COALESCE(external_delivery_data,?),
              external_status=?, admin_note=NULL, updated_at=?
        WHERE id=?`,
      [
        ts(),
        input.externalOrderId == null ? null : String(input.externalOrderId),
        input.deliveryData,
        input.externalStatus ?? "success",
        ts(),
        input.orderId,
      ],
    );
    return {
      licenseKey: existingLink.key_value,
      activationToken: existingLink.activation_token,
      created: false,
    };
  }

  let key = await mysqlOne<{
    id: string;
    key_value: string;
    activation_token: string | null;
  }>(
    `SELECT id,key_value,activation_token
       FROM license_keys
      WHERE assigned_order_id=? LIMIT 1`,
    [input.orderId],
  );
  let created = false;
  if (!key) {
    const keyId = uid();
    try {
      await mysqlQuery(
        `INSERT INTO license_keys
           (id,product_id,key_value,status,assigned_order_id,assigned_at,created_at)
         VALUES (?,?,?,'assigned',?,?,?)`,
        [keyId, input.productId, input.deliveryData, input.orderId, ts(), ts()],
      );
      created = true;
    } catch (error) {
      // Aynı payload yarışta daha önce yazılmış olabilir; yalnızca aynı siparişi
      // bağla. Başka siparişin anahtarını kesinlikle yeniden atama.
      key = await mysqlOne<{
        id: string;
        key_value: string;
        activation_token: string | null;
      }>(
        `SELECT id,key_value,activation_token
           FROM license_keys
          WHERE assigned_order_id=? LIMIT 1`,
        [input.orderId],
      );
      if (!key) throw error;
    }
    if (!key) {
      key = { id: keyId, key_value: input.deliveryData, activation_token: null };
    }
  }

  const linked = await mysqlOne<{ id: string }>(
    "SELECT id FROM order_keys WHERE order_id=? AND license_key_id=? LIMIT 1",
    [input.orderId, key.id],
  );
  let linkWasCreated = false;
  if (!linked) {
    try {
      await mysqlQuery(
        `INSERT INTO order_keys (id,order_id,license_key_id,delivered_at)
         VALUES (?,?,?,?)`,
        [uid(), input.orderId, key.id, ts()],
      );
      linkWasCreated = true;
    } catch (error) {
      const linkedAfterRace = await mysqlOne<{ id: string }>(
        "SELECT id FROM order_keys WHERE order_id=? AND license_key_id=? LIMIT 1",
        [input.orderId, key.id],
      );
      if (!linkedAfterRace) throw error;
    }
  }

  await mysqlExec(
    `UPDATE orders
        SET status='approved', approved_at=?,
            external_order_id=?, external_delivery_data=?, external_status=?,
            admin_note=NULL, updated_at=?
      WHERE id=?`,
    [
      ts(),
      input.externalOrderId == null ? null : String(input.externalOrderId),
      input.deliveryData,
      input.externalStatus ?? "success",
      ts(),
      input.orderId,
    ],
  );

  // Bir sonraki 5 dakikalık senkronu beklemeden mağazadaki tahmini stok da
  // azaltılır. Tedarikçinin gerçek sayısı sonraki senkronlarda tekrar yazılır.
  if (created || linkWasCreated) {
    await decrementLocalUniquelisansStock(input.productId, 1);
  }

  return { licenseKey: key.key_value, activationToken: key.activation_token, created };
}

export async function decrementLocalUniquelisansStock(
  productId: string,
  quantity: number,
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) return;
  const product = await mysqlOne<{ stock_hint: number | null; unlimited_stock: number | null }>(
    "SELECT stock_hint,unlimited_stock FROM products WHERE id=? AND source='uniquelisans' LIMIT 1",
    [productId],
  );
  if (!product || product.stock_hint == null || Number(product.unlimited_stock ?? 0) === 1) return;

  const next = Math.max(0, Number(product.stock_hint) - quantity);
  await mysqlExec(
    `UPDATE products
        SET stock_hint=?, supplier_out_of_stock=?, updated_at=?
      WHERE id=? AND source='uniquelisans'`,
    [next, next <= 0 ? 1 : 0, ts(), productId],
  );
}

export function parseUniquelisansFields(value: unknown): Record<string, string> {
  if (value == null) return {};
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed)
      .map(([key, item]) => [String(key), String(item ?? "").trim()])
      .filter(([, item]) => item),
  );
}

export function missingUniquelisansFields(
  requiredFields: unknown,
  supplied: Record<string, string>,
): string[] {
  let parsed: unknown = requiredFields;
  if (typeof requiredFields === "string") {
    try {
      parsed = JSON.parse(requiredFields);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (field): field is { name?: string; required?: boolean } =>
        !!field && typeof field === "object",
    )
    .filter((field) => field.required !== false)
    .map((field) => String(field.name ?? "").trim())
    .filter((name) => name && !supplied[name]);
}
