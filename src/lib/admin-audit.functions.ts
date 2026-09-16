import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { mysqlQuery, num } from "./mysql.server";

export async function writeAuditLog(
  actor: unknown,
  input: { action: string; entity_type: string; entity_id?: string | null; before?: unknown; after?: unknown; metadata?: Record<string, unknown> },
) {
  try {
    if (!actor || typeof actor !== "object" || !("userId" in actor)) return;
    const identity = actor as { userId: string; email?: string | null };
    await mysqlQuery(`INSERT INTO admin_audit_log (id,actor_id,actor_email,action,entity_type,entity_id,before_data,after_data,metadata,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())`, [
      crypto.randomUUID(), identity.userId, identity.email ?? null, input.action, input.entity_type, input.entity_id ?? null,
      input.before == null ? null : JSON.stringify(input.before), input.after == null ? null : JSON.stringify(input.after),
      input.metadata == null ? null : JSON.stringify(input.metadata),
    ]);
  } catch { /* denetim kaydı ana işlemi engellemez */ }
}

const listInput = z.object({ limit:z.number().int().min(1).max(200).default(100), entity_type:z.string().max(64).optional(), actor_id:z.string().uuid().optional(), search:z.string().max(200).optional(), before:z.string().datetime().optional() }).default({ limit:100 });
export const listAuditLog = createServerFn({ method:"POST" }).middleware([requireAdmin]).validator((d:unknown)=>listInput.parse(d??{})).handler(async ({data}) => {
  const where=["1=1"]; const params:Array<string|number>=[];
  if(data.entity_type){where.push("entity_type=?");params.push(data.entity_type)}
  if(data.actor_id){where.push("actor_id=?");params.push(data.actor_id)}
  if(data.before){where.push("created_at<?");params.push(data.before)}
  if(data.search){where.push("(action LIKE ? OR entity_id LIKE ? OR actor_email LIKE ?)"); for(let i=0;i<3;i++)params.push(`%${data.search}%`)}
  const rows = await mysqlQuery<Record<string, unknown>>(`SELECT id,actor_id,actor_email,action,entity_type,entity_id,before_data,after_data,metadata,created_at FROM admin_audit_log WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`, [...params,data.limit]);
  return rows.map((row) => ({
    id: String(row.id), actor_id: row.actor_id ? String(row.actor_id) : null,
    actor_email: row.actor_email ? String(row.actor_email) : null, action: String(row.action),
    entity_type: String(row.entity_type), entity_id: row.entity_id ? String(row.entity_id) : null,
    before_data: row.before_data ? String(row.before_data) : null,
    after_data: row.after_data ? String(row.after_data) : null,
    metadata: row.metadata ? String(row.metadata) : null, created_at: String(row.created_at),
  }));
});

const reportInput=z.object({from:z.string().datetime(),to:z.string().datetime(),granularity:z.enum(["day","week","month"]).default("day")});
export const getProfitReport=createServerFn({method:"POST"}).middleware([requireAdmin]).validator((d:unknown)=>reportInput.parse(d)).handler(async({data})=>{
  const bucket=data.granularity==="month"?"DATE_FORMAT(COALESCE(o.approved_at,o.created_at),'%Y-%m-01')":data.granularity==="week"?"DATE_SUB(DATE(COALESCE(o.approved_at,o.created_at)), INTERVAL WEEKDAY(COALESCE(o.approved_at,o.created_at)) DAY)":"DATE(COALESCE(o.approved_at,o.created_at))";
  const manualBucket=data.granularity==="month"?"DATE_FORMAT(m.occurred_at,'%Y-%m-01')":data.granularity==="week"?"DATE_SUB(DATE(m.occurred_at), INTERVAL WEEKDAY(m.occurred_at) DAY)":"DATE(m.occurred_at)";
  const topupBucket=data.granularity==="month"?"DATE_FORMAT(COALESCE(w.approved_at,w.updated_at),'%Y-%m-01')":data.granularity==="week"?"DATE_SUB(DATE(COALESCE(w.approved_at,w.updated_at)), INTERVAL WEEKDAY(COALESCE(w.approved_at,w.updated_at)) DAY)":"DATE(COALESCE(w.approved_at,w.updated_at))";
  const seriesRows=await mysqlQuery<Record<string,unknown>>(`SELECT bucket,SUM(orders_count) orders_count,SUM(revenue) revenue,SUM(gross_revenue) gross_revenue,SUM(discount_total) discount_total,SUM(cost) cost,SUM(profit) profit,SUM(refunds) refunds,SUM(topups) topups FROM (
    SELECT ${bucket} bucket,
      SUM(o.status='approved') orders_count,
      SUM(CASE WHEN o.status='approved' THEN GREATEST(COALESCE(o.price_try,0)-COALESCE(d.discount_total,0),0) ELSE 0 END) revenue,
      SUM(CASE WHEN o.status='approved' THEN COALESCE(o.price_try,0) ELSE 0 END) gross_revenue,
      SUM(CASE WHEN o.status='approved' THEN LEAST(COALESCE(d.discount_total,0),COALESCE(o.price_try,0)) ELSE 0 END) discount_total,
      SUM(CASE WHEN o.status='approved' THEN COALESCE(ic.item_cost,p.cost_try,p.external_price,0) ELSE 0 END) cost,
      SUM(CASE WHEN o.status='approved' THEN GREATEST(COALESCE(o.price_try,0)-COALESCE(d.discount_total,0),0)-COALESCE(ic.item_cost,p.cost_try,p.external_price,0) ELSE 0 END) profit,
      SUM(CASE WHEN o.status IN ('cancelled','rejected','failed') THEN GREATEST(COALESCE(o.price_try,0)-COALESCE(d.discount_total,0),0) ELSE 0 END) refunds,0 topups
    FROM orders o LEFT JOIN products p ON p.id=o.product_id
    LEFT JOIN (SELECT order_id,SUM(discount_try) discount_total FROM order_discounts GROUP BY order_id)d ON d.order_id=o.id
    LEFT JOIN (SELECT oi.order_id,SUM(oi.quantity*COALESCE(p2.cost_try,p2.external_price,0)) item_cost FROM order_items oi LEFT JOIN products p2 ON p2.id=oi.product_id GROUP BY oi.order_id)ic ON ic.order_id=o.id
    WHERE COALESCE(o.approved_at,o.created_at)>=? AND COALESCE(o.approved_at,o.created_at)<? AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=o.user_id AND ur.role='admin') GROUP BY bucket
    UNION ALL SELECT ${manualBucket},0,SUM(m.amount_try),SUM(m.amount_try),0,SUM(m.cost_try),SUM(m.amount_try-m.cost_try),0,0 FROM manual_revenue_entries m WHERE m.occurred_at>=? AND m.occurred_at<? GROUP BY 1
    UNION ALL SELECT ${topupBucket},0,0,0,0,0,0,0,SUM(w.amount_try) FROM wallet_topups w WHERE w.status='approved' AND COALESCE(w.approved_at,w.updated_at)>=? AND COALESCE(w.approved_at,w.updated_at)<? AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=w.user_id AND ur.role='admin') GROUP BY 1
  )x GROUP BY bucket ORDER BY bucket`,[data.from,data.to,data.from,data.to,data.from,data.to]);
  const productRows=await mysqlQuery<Record<string,unknown>>(`SELECT p.id product_id,p.name product_name,SUM(lines.quantity) qty_sold,SUM(lines.net_revenue) revenue,SUM(lines.line_cost) cost,SUM(lines.net_revenue-lines.line_cost) profit FROM (
    SELECT oi.order_id,oi.product_id,oi.quantity,(oi.quantity*oi.unit_price_try)-COALESCE(d.discount_total,0)*(oi.quantity*oi.unit_price_try)/NULLIF(t.gross,0) net_revenue,oi.quantity*COALESCE(pp.cost_try,pp.external_price,0) line_cost
    FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products pp ON pp.id=oi.product_id JOIN(SELECT order_id,SUM(quantity*unit_price_try)gross FROM order_items GROUP BY order_id)t ON t.order_id=o.id LEFT JOIN(SELECT order_id,SUM(discount_try)discount_total FROM order_discounts GROUP BY order_id)d ON d.order_id=o.id WHERE o.status='approved' AND COALESCE(o.approved_at,o.created_at)>=? AND COALESCE(o.approved_at,o.created_at)<? AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=o.user_id AND ur.role='admin')
    UNION ALL SELECT o.id,o.product_id,1,GREATEST(COALESCE(o.price_try,0)-COALESCE(d.discount_total,0),0),COALESCE(pp.cost_try,pp.external_price,0) FROM orders o JOIN products pp ON pp.id=o.product_id LEFT JOIN(SELECT order_id,SUM(discount_try)discount_total FROM order_discounts GROUP BY order_id)d ON d.order_id=o.id WHERE o.status='approved' AND COALESCE(o.approved_at,o.created_at)>=? AND COALESCE(o.approved_at,o.created_at)<? AND NOT EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=o.user_id AND ur.role='admin')
  )lines JOIN products p ON p.id=lines.product_id GROUP BY p.id,p.name ORDER BY profit DESC`,[data.from,data.to,data.from,data.to]);
  return {series:seriesRows.map(r=>({bucket:String(r.bucket),orders_count:num(r.orders_count)??0,revenue:num(r.revenue)??0,gross_revenue:num(r.gross_revenue)??0,discount_total:num(r.discount_total)??0,cost:num(r.cost)??0,profit:num(r.profit)??0,refunds:num(r.refunds)??0,topups:num(r.topups)??0})),byProduct:productRows.map(r=>({product_id:String(r.product_id),product_name:String(r.product_name),qty_sold:num(r.qty_sold)??0,revenue:num(r.revenue)??0,cost:num(r.cost)??0,profit:num(r.profit)??0}))};
});
