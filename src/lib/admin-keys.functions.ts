import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { bool, mysqlQuery, num } from "./mysql.server";

export const getAdminKeyData = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const [products, keys, assigned] = await Promise.all([
    mysqlQuery<Record<string, unknown>>(`SELECT p.id,p.name,p.slug,p.active,p.price_try,p.delivery_type,p.unlimited_stock,
      COALESCE(SUM(lk.status='available'),0) available_count,COALESCE(SUM(lk.status='assigned'),0) assigned_count,COUNT(lk.id) total_count
      FROM products p LEFT JOIN license_keys lk ON lk.product_id=p.id GROUP BY p.id,p.name,p.slug,p.active,p.price_try,p.delivery_type,p.unlimited_stock ORDER BY p.name`),
    mysqlQuery<Record<string, unknown>>(`SELECT lk.id,lk.key_value,lk.status,lk.created_at,lk.product_id,p.name product_name,p.slug product_slug FROM license_keys lk LEFT JOIN products p ON p.id=lk.product_id ORDER BY lk.created_at DESC LIMIT 500`),
    mysqlQuery<Record<string, unknown>>(`SELECT lk.id key_id,lk.key_value,lk.product_id,p.name product_name,lk.assigned_order_id order_id,o.reference_code,o.status order_status,pr.email user_email,lk.assigned_at,lk.activated_at,lk.expires_at,lk.revoked FROM license_keys lk LEFT JOIN products p ON p.id=lk.product_id LEFT JOIN orders o ON o.id=lk.assigned_order_id LEFT JOIN profiles pr ON pr.id=o.user_id WHERE lk.status='assigned' OR lk.assigned_order_id IS NOT NULL ORDER BY lk.assigned_at DESC LIMIT 200`),
  ]);
  return {
    products: products.map((p) => ({ id:String(p.id),name:String(p.name),slug:String(p.slug),active:bool(p.active),price_try:num(p.price_try)??0,delivery_type:String(p.delivery_type??"key"),unlimited_stock:bool(p.unlimited_stock),license_keys:[...Array.from({length:num(p.available_count)??0},()=>({status:"available"})),...Array.from({length:num(p.assigned_count)??0},()=>({status:"assigned"})),...Array.from({length:Math.max(0,(num(p.total_count)??0)-(num(p.available_count)??0)-(num(p.assigned_count)??0))},()=>({status:"revoked"}))] })),
    keys: keys.map((k) => ({ id:String(k.id),key_value:String(k.key_value),status:String(k.status),created_at:String(k.created_at),product_id:String(k.product_id),product:k.product_name?{name:String(k.product_name),slug:String(k.product_slug)}:null })),
    assigned: assigned.map((r) => ({ key_id:String(r.key_id),key_value:String(r.key_value),product_id:String(r.product_id),product_name:(r.product_name as string|null)??null,order_id:(r.order_id as string|null)??null,reference_code:(r.reference_code as string|null)??null,order_status:(r.order_status as string|null)??null,user_email:(r.user_email as string|null)??null,assigned_at:r.assigned_at?String(r.assigned_at):null,activated_at:r.activated_at?String(r.activated_at):null,expires_at:r.expires_at?String(r.expires_at):null,revoked:bool(r.revoked) })),
  };
});

export const purgeAvailableKeys = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const before = await mysqlQuery<{id:string}>("SELECT id FROM license_keys WHERE product_id=? AND status='available'", [data.productId]);
    await mysqlQuery("DELETE FROM license_keys WHERE product_id=? AND status='available'", [data.productId]);
    return { deleted: before.length };
  });