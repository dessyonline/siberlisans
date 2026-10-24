// UniQLisans tedarikçi fiyat düşüşleri için admin onay akışı.
// Yalnızca server tarafında import edilmelidir.
import { mysqlExec, mysqlOne, mysqlQuery, num, bool } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function escapeTelegramHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function newApprovalCode() {
  return `UL-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type PriceApprovalNotice = {
  approval_code: string;
  product_name: string;
  supplier_previous_price: number | null;
  supplier_new_price: number;
  current_price: number;
  proposed_price: number;
  profit_try: number;
};

export type PendingApproval = PriceApprovalNotice & {
  id: string;
  product_id: string;
  slug: string | null;
  expires_at: string;
};

export async function queueUniquelisansPriceApproval(input: {
  product_id: string;
  external_id: string;
  product_name: string;
  supplier_previous_price: number | null;
  supplier_new_price: number;
  current_price: number;
  proposed_price: number;
}): Promise<PriceApprovalNotice | null> {
  if (input.proposed_price >= input.current_price) return null;

  await mysqlQuery(
    `UPDATE uniquelisans_price_approvals
        SET status='expired', pending_key=NULL, updated_at=?
      WHERE product_id=? AND status='pending' AND expires_at <= NOW()`,
    [ts(), input.product_id],
  );

  const pending = await mysqlOne<{
    id: string;
    approval_code: string;
    proposed_price: string | number | null;
    supplier_new_price: string | number | null;
  }>(
    `SELECT id, approval_code, proposed_price, supplier_new_price
       FROM uniquelisans_price_approvals
      WHERE product_id=? AND status='pending' AND expires_at > NOW()
      ORDER BY created_at DESC LIMIT 1`,
    [input.product_id],
  );

  if (pending) {
    const sameProposal = num(pending.proposed_price) === input.proposed_price
      && num(pending.supplier_new_price) === input.supplier_new_price;
    if (sameProposal) return null;

    await mysqlQuery(
      `UPDATE uniquelisans_price_approvals
          SET supplier_previous_price=?, supplier_new_price=?, current_price=?, proposed_price=?,
              product_name=?, updated_at=?
        WHERE id=? AND status='pending'`,
      [
        input.supplier_previous_price,
        input.supplier_new_price,
        input.current_price,
        input.proposed_price,
        input.product_name,
        ts(),
        pending.id,
      ],
    );
    return {
      approval_code: pending.approval_code,
      product_name: input.product_name,
      supplier_previous_price: input.supplier_previous_price,
      supplier_new_price: input.supplier_new_price,
      current_price: input.current_price,
      proposed_price: input.proposed_price,
      profit_try: Math.max(0, input.proposed_price - input.supplier_new_price),
    };
  }

  const code = newApprovalCode();
  await mysqlQuery(
    `INSERT INTO uniquelisans_price_approvals
       (id,product_id,external_id,approval_code,product_name,supplier_previous_price,
        supplier_new_price,current_price,proposed_price,status,pending_key,created_at,expires_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?,?)`,
    [
      crypto.randomUUID(),
      input.product_id,
      input.external_id,
      code,
      input.product_name,
      input.supplier_previous_price,
      input.supplier_new_price,
      input.current_price,
      input.proposed_price,
      input.product_id,
      ts(),
      ts(new Date(Date.now() + 7 * 86400000)),
      ts(),
    ],
  );
  return {
    approval_code: code,
    product_name: input.product_name,
    supplier_previous_price: input.supplier_previous_price,
    supplier_new_price: input.supplier_new_price,
    current_price: input.current_price,
    proposed_price: input.proposed_price,
    profit_try: Math.max(0, input.proposed_price - input.supplier_new_price),
  };
}

export function priceApprovalMessage(item: PriceApprovalNotice) {
  const previous = item.supplier_previous_price === null ? "ilk kayıt" : `₺${item.supplier_previous_price}`;
  return [
    "📉 <b>Uniquelisans fiyat indirimi onayı</b>",
    `📦 Ürün: <b>${escapeTelegramHtml(item.product_name)}</b>`,
    `🏷 UniQLisans: ${previous} → <b>₺${item.supplier_new_price}</b>`,
    `💰 Bizde mevcut: <b>₺${item.current_price}</b>`,
    `✅ Önerilen satış: <b>₺${item.proposed_price}</b>`,
    `📊 Önerilen kâr: <b>₺${item.profit_try}</b>`,
    "",
    `Onaylamak için: <code>onay ${item.approval_code}</code>`,
    "Tek bekleyen indirim varsa sadece <code>onay</code> da yazabilirsin.",
  ].join("\n");
}

export async function listPendingUniquelisansPriceApprovals(): Promise<PendingApproval[]> {
  await mysqlQuery(
    `UPDATE uniquelisans_price_approvals
        SET status='expired', pending_key=NULL, updated_at=?
      WHERE status='pending' AND expires_at <= NOW()`,
    [ts()],
  );
  const rows = await mysqlQuery<{
    id: string;
    product_id: string;
    approval_code: string;
    product_name: string;
    supplier_previous_price: string | number | null;
    supplier_new_price: string | number | null;
    current_price: string | number | null;
    proposed_price: string | number | null;
    expires_at: string;
  }>(
    `SELECT id, product_id, approval_code, product_name, supplier_previous_price,
            supplier_new_price, current_price, proposed_price, expires_at
       FROM uniquelisans_price_approvals
      WHERE status='pending' AND expires_at > NOW()
      ORDER BY created_at ASC`,
  );

  if (!rows.length) return [];
  const ids = rows.map((row) => row.product_id);
  const placeholders = ids.map(() => "?").join(",");
  const products = await mysqlQuery<{ id: string; slug: string | null }>(
    `SELECT id, slug FROM products WHERE id IN (${placeholders})`,
    ids,
  );
  const slugById = new Map(products.map((product) => [product.id, product.slug]));

  return rows.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    slug: slugById.get(row.product_id) ?? null,
    approval_code: row.approval_code,
    product_name: row.product_name,
    supplier_previous_price: num(row.supplier_previous_price),
    supplier_new_price: num(row.supplier_new_price) ?? 0,
    current_price: num(row.current_price) ?? 0,
    proposed_price: num(row.proposed_price) ?? 0,
    profit_try: Math.max(0, (num(row.proposed_price) ?? 0) - (num(row.supplier_new_price) ?? 0)),
    expires_at: row.expires_at,
  }));
}

export type ApprovePriceResult =
  | { kind: "none" }
  | { kind: "multiple"; approvals: PendingApproval[] }
  | { kind: "not_found"; code: string }
  | { kind: "approved"; approval: PendingApproval; new_price: number }
  | { kind: "already"; approval: PendingApproval; new_price: number }
  | { kind: "locked"; approval: PendingApproval }
  | { kind: "stale"; approval: PendingApproval };

export async function approveUniquelisansPrice(selector?: string): Promise<ApprovePriceResult> {
  const approvals = await listPendingUniquelisansPriceApprovals();
  let approval: PendingApproval | undefined;
  if (selector) {
    approval = approvals.find((item) => item.approval_code.toUpperCase() === selector.toUpperCase());
    if (!approval) return { kind: "not_found", code: selector };
  } else if (approvals.length === 0) {
    return { kind: "none" };
  } else if (approvals.length > 1) {
    return { kind: "multiple", approvals };
  } else {
    approval = approvals[0];
  }

  const product = await mysqlOne<{
    price_try: string | number | null;
    price_locked: number | null;
    name: string;
  }>(
    "SELECT price_try, price_locked, name FROM products WHERE id=? AND source='uniquelisans' LIMIT 1",
    [approval.product_id],
  );
  if (!product) return { kind: "stale", approval };
  const currentPrice = num(product.price_try) ?? 0;
  if (bool(product.price_locked)) return { kind: "locked", approval };
  if (currentPrice <= approval.proposed_price) {
    await markApproval(approval.id, "approved", "Fiyat zaten önerilen seviyede veya daha düşük.");
    return { kind: "already", approval, new_price: currentPrice };
  }
  if (currentPrice !== approval.current_price) {
    await markApproval(approval.id, "rejected", "Ürünün mevcut fiyatı onay mesajından sonra değişti.");
    return { kind: "stale", approval };
  }

  const affected = await mysqlExec(
    `UPDATE products
        SET price_try=?, updated_at=?
      WHERE id=? AND source='uniquelisans' AND price_locked=0 AND price_try=? AND price_try>?`,
    [approval.proposed_price, ts(), approval.product_id, approval.current_price, approval.proposed_price],
  );
  if (affected !== 1) return { kind: "stale", approval };

  await markApproval(approval.id, "approved", "Admin Telegram onayı");
  return { kind: "approved", approval, new_price: approval.proposed_price };
}

async function markApproval(id: string, status: "approved" | "rejected", note: string) {
  await mysqlQuery(
    `UPDATE uniquelisans_price_approvals
        SET status=?, pending_key=NULL, decision_note=?, approved_at=?, updated_at=?
      WHERE id=? AND status='pending'`,
    [status, note, ts(), ts(), id],
  );
}
