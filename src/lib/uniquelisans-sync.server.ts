// Server-only: Uniquelisans "pending" siparişlerini polling ile senkronize eder.
// Sadece server function/route içinden dynamic import ile kullan.

import { ulOrderStatus } from "@/lib/uniquelisans.server";
import { mysqlQuery, mysqlOne } from "@/lib/mysql.server";
import { recordUniquelisansDelivery } from "@/lib/uniquelisans-fulfillment.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

export type SyncOutcome =
  | { orderId: string; ref: string; result: "delivered"; deliveryData: string }
  | { orderId: string; ref: string; result: "still_pending" }
  | { orderId: string; ref: string; result: "error"; message: string }
  | { orderId: string; ref: string; result: "skipped"; reason: string };

/**
 * Tek bir siparişi UL'den yeniden sorgular. "success" dönerse license_key oluşturup
 * siparişi onaylar; "pending" ise dokunmaz; "error" ise admin_note'a yazar.
 */
export async function reconcileUniquelisansOrder(orderId: string): Promise<SyncOutcome> {
  const ord = await mysqlOne<{
    id: string; user_id: string | null; reference_code: string; status: string;
    product_id: string | null; external_order_id: string | null; external_status: string | null;
    product_name: string | null; user_email: string | null;
  }>(
    `SELECT o.id, o.user_id, o.reference_code, o.status, o.product_id,
            o.external_order_id, o.external_status,
            p.name AS product_name, pr.email AS user_email
       FROM orders o
       LEFT JOIN products p ON p.id=o.product_id
       LEFT JOIN profiles pr ON pr.id=o.user_id
      WHERE o.id=?`,
    [orderId],
  );
  if (!ord) return { orderId, ref: "-", result: "skipped", reason: "sipariş bulunamadı" };
  if (!ord.external_order_id) {
    return { orderId, ref: ord.reference_code, result: "skipped", reason: "external_order_id yok" };
  }
  if (ord.status === "approved") {
    return { orderId, ref: ord.reference_code, result: "skipped", reason: "zaten onaylı" };
  }
  if (ord.status === "rejected") {
    return { orderId, ref: ord.reference_code, result: "skipped", reason: "reddedilmiş" };
  }

  let resp;
  try {
    resp = await ulOrderStatus(ord.external_order_id);
  } catch (e) {
    const msg = (e as Error).message;
    await mysqlQuery("UPDATE orders SET admin_note=? WHERE id=?", [`Sync hatası: ${msg}`, orderId]);
    return { orderId, ref: ord.reference_code, result: "error", message: msg };
  }

  const status = String(resp.status || "").toLowerCase();

  if (status === "pending") {
    await mysqlQuery("UPDATE orders SET external_status='pending' WHERE id=?", [orderId]);
    return { orderId, ref: ord.reference_code, result: "still_pending" };
  }

  if (status === "success") {
    const deliveryData = (resp.delivery_data ?? "").toString().trim();
    if (!deliveryData) {
      await mysqlQuery(
        "UPDATE orders SET admin_note='Sync: success ama delivery_data boş', external_status='success' WHERE id=?",
        [orderId],
      );
      return { orderId, ref: ord.reference_code, result: "error", message: "delivery_data boş" };
    }

    if (!ord.product_id) {
      return { orderId, ref: ord.reference_code, result: "error", message: "ürün eşleşmesi bulunamadı" };
    }

    const delivered = await recordUniquelisansDelivery({
      orderId,
      productId: ord.product_id,
      deliveryData,
      externalOrderId: ord.external_order_id,
      externalStatus: "success",
    });

    if (delivered.created) {
      try {
        if (ord.user_id) {
          await mysqlQuery(
            "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
            [uid(), ord.user_id, "order_approved", "Siparişin onaylandı 🎉", `Ref: ${ord.reference_code} · Bilgilerin hesabında hazır.`, "/hesabim", ts()],
          );
        }
      } catch { /* ignore */ }
      try {
        const { notifyTelegram } = await import("@/lib/telegram.server");
        await notifyTelegram(`✅ Uniquelisans otomatik teslim tamamlandı — Ref: ${ord.reference_code}`);
      } catch { /* ignore */ }
      try {
        if (ord.user_email) {
          const { sendAppEmail } = await import('@/lib/app-mail.server');
          await sendAppEmail(
            'order-delivered',
            ord.user_email,
            {
              productName: ord.product_name ?? 'Dijital ürün',
              referenceCode: ord.reference_code,
              deliveryData,
            },
            `order-delivered:${orderId}`,
          );
        }
      } catch (error) {
        // E-posta kuyruğu geçici olarak kapalı olsa bile panel/Telegram bildirimi
        // çalışmaya devam eder; sipariş teslimatı başarısız sayılmaz.
        console.error('[uniquelisans] delivery email failed', (error as Error).message);
      }
    }

    return { orderId, ref: ord.reference_code, result: "delivered", deliveryData };
  }

  // error / diğer
  const msg = resp.message || `bilinmeyen durum: ${resp.status}`;
  await mysqlQuery(
    "UPDATE orders SET external_status=?, admin_note=? WHERE id=?",
    [resp.status ?? "error", `Uniquelisans: ${msg}`, orderId],
  );
  return { orderId, ref: ord.reference_code, result: "error", message: msg };
}

/**
 * "reviewing" durumunda external_order_id'si olan tüm UL siparişlerini senkronize eder.
 */
export async function reconcileAllPendingUniquelisans(
  limit = 50,
): Promise<{ scanned: number; outcomes: SyncOutcome[] }> {
  const rows = await mysqlQuery<{ id: string }>(
    "SELECT id FROM orders WHERE status='reviewing' AND external_order_id IS NOT NULL ORDER BY created_at ASC LIMIT ?",
    [limit],
  );
  const outcomes: SyncOutcome[] = [];
  for (const r of rows) {
    outcomes.push(await reconcileUniquelisansOrder(r.id));
  }
  return { scanned: outcomes.length, outcomes };
}
