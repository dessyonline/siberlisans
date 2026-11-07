// Server-only: kendi ürünü ↔ UniQLisans ürünü eşleşmelerinde hangi tarafın
// satışta görüneceğini belirler. Kural: kendi stoğun (parası ödenmiş anahtar)
// varsa önce o satılır; bitince tedarikçi ürünü açılır, kendi ürün gizlenir.
import { mysqlQuery, mysqlOne, bool } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function applySupplierLinks(): Promise<{ switched: number }> {
  const links = await mysqlQuery<{
    id: string;
    own_product_id: string;
    ul_product_id: string;
    active_side: string;
  }>("SELECT id, own_product_id, ul_product_id, active_side FROM product_supplier_links");

  let switched = 0;
  for (const link of links) {
    const own = await mysqlOne<{ unlimited_stock: number | null; manual_fulfillment: number | null }>(
      "SELECT unlimited_stock, manual_fulfillment FROM products WHERE id=?",
      [link.own_product_id],
    );
    const ul = await mysqlOne<{ supplier_out_of_stock: number | null }>(
      "SELECT supplier_out_of_stock FROM products WHERE id=?",
      [link.ul_product_id],
    );
    if (!own || !ul) continue;

    const keys = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM license_keys WHERE product_id=? AND status='available'",
      [link.own_product_id],
    );
    const ownHasStock = Number(keys?.c ?? 0) > 0 || bool(own.unlimited_stock);
    const ulAvailable = !bool(ul.supplier_out_of_stock);

    let side: "own" | "ul" | null = null;
    let reason = "";
    if (ownHasStock) {
      side = "own";
      reason = "Kendi stoğun var; önce o satılıyor.";
    } else if (ulAvailable) {
      side = "ul";
      reason = "Kendi stoğun bitti; tedarikçi ürünü satışta.";
    }
    if (!side) continue;

    const now = ts();
    if (side === "own") {
      await mysqlQuery("UPDATE products SET active=1, updated_at=? WHERE id=?", [now, link.own_product_id]);
      await mysqlQuery("UPDATE products SET active=0, supplier_auto_publish=0, updated_at=? WHERE id=?", [now, link.ul_product_id]);
    } else {
      await mysqlQuery("UPDATE products SET active=1, supplier_auto_publish=1, updated_at=? WHERE id=?", [now, link.ul_product_id]);
      await mysqlQuery("UPDATE products SET active=0, updated_at=? WHERE id=?", [now, link.own_product_id]);
    }
    if (side !== link.active_side) switched++;
    await mysqlQuery(
      "UPDATE product_supplier_links SET active_side=?, reason=?, updated_at=? WHERE id=?",
      [side, reason, now, link.id],
    );
  }
  return { switched };
}
