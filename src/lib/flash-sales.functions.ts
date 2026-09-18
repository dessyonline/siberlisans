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

export type FlashSaleRow = {
  id: string;
  product_id: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  label: string | null;
  product: { name: string; slug: string } | null;
};

export const listAdminFlashSales = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<FlashSaleRow[]> => {
    const { mysqlQuery, bool } = await import("./mysql.server");
    const rows = await mysqlQuery<{
      id: string;
      product_id: string;
      discount_type: "percent" | "amount";
      discount_value: number;
      starts_at: string;
      ends_at: string;
      is_active: number;
      label: string | null;
      product_name: string | null;
      product_slug: string | null;
    }>(
      `SELECT f.id, f.product_id, f.discount_type, f.discount_value, f.starts_at, f.ends_at, f.is_active, f.label,
              p.name product_name, p.slug product_slug
         FROM flash_sales f
         LEFT JOIN products p ON p.id = f.product_id
        ORDER BY f.ends_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      discount_type: r.discount_type,
      discount_value: Number(r.discount_value),
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      is_active: bool(r.is_active),
      label: r.label,
      product: r.product_name ? { name: r.product_name, slug: r.product_slug ?? "" } : null,
    }));
  });

export type MinimalProduct = { id: string; name: string };

export const listMinimalProducts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<MinimalProduct[]> => {
    const { mysqlQuery } = await import("./mysql.server");
    return mysqlQuery<MinimalProduct>("SELECT id, name FROM products ORDER BY name");
  });
