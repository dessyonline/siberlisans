import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  discount_type: z.enum(["percent", "amount"]),
  discount_value: z.number().min(0.01).max(1000000),
  starts_at: z.string(),
  ends_at: z.string(),
  is_active: z.boolean(),
  label: z.string().max(80).nullable().optional(),
});

export const adminUpsertFlashSale = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data }) => {
    const { mysqlQuery } = await import("./mysql.server");
    const start = new Date(data.starts_at);
    const end = new Date(data.ends_at);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("Geçersiz tarih aralığı");
    if (data.discount_type === "percent" && data.discount_value > 100) throw new Error("Geçersiz indirim oranı");
    const values = [data.product_id, data.discount_type, data.discount_value,
      start.toISOString().slice(0,19).replace("T"," "), end.toISOString().slice(0,19).replace("T"," "),
      data.is_active, data.label ?? null];
    if (data.id) {
      await mysqlQuery("UPDATE flash_sales SET product_id=?,discount_type=?,discount_value=?,starts_at=?,ends_at=?,is_active=?,label=? WHERE id=?", [...values,data.id]);
    } else {
      await mysqlQuery("INSERT INTO flash_sales (product_id,discount_type,discount_value,starts_at,ends_at,is_active,label,id,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())", [...values,crypto.randomUUID()]);
    }
    return { ok: true };
  });

const deleteInput = z.object({ id: z.string().uuid() });
export const adminDeleteFlashSale = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("DELETE FROM flash_sales WHERE id=?", [data.id]);
    return { ok: true };
  });
