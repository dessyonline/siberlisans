import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InvoiceItem = {
  name: string;
  quantity: number;
  unit_price_try: number;
  line_total_try: number;
};

export type InvoiceRow = {
  id: string;
  order_id: string;
  invoice_number: string;
  issued_at: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_tax_id: string | null;
  buyer_address: string | null;
  subtotal_try: number;
  vat_rate: number;
  vat_amount_try: number;
  total_try: number;
  items_snapshot: InvoiceItem[];
  order?: { reference_code: string } | null;
};

export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: invoices, error: invoicesError } = await context.supabase
      .from("invoices")
      .select(
        "id, order_id, invoice_number, issued_at, buyer_name, buyer_email, subtotal_try, vat_rate, vat_amount_try, total_try",
      )
      .eq("user_id", context.userId)
      .order("issued_at", { ascending: false });
    if (invoicesError) throw new Error(invoicesError.message);

    const { data: orders, error: ordersError } = await context.supabase
      .from("orders")
      .select("id, reference_code, status, price_try, created_at, approved_at")
      .eq("user_id", context.userId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false });
    if (ordersError) throw new Error(ordersError.message);

    const orderMap = new Map(
      (orders ?? []).map((order) => [
        order.id,
        {
          reference_code: order.reference_code,
          price_try: Number(order.price_try),
          issued_at: order.approved_at ?? order.created_at,
        },
      ]),
    );

    const rows = ((invoices ?? []) as unknown as InvoiceRow[]).map((invoice) => ({
      ...invoice,
      order: orderMap.get(invoice.order_id)
        ? { reference_code: orderMap.get(invoice.order_id)!.reference_code }
        : null,
    }));

    const invoicedOrderIds = new Set(rows.map((invoice) => invoice.order_id));
    const missingInvoiceRows = (orders ?? [])
      .filter((order) => !invoicedOrderIds.has(order.id))
      .map((order) => {
        const total = Number(order.price_try);
        const subtotal = Math.round((total / 1.2) * 100) / 100;
        const vat = Math.round((total - subtotal) * 100) / 100;
        return {
          id: `pending-${order.id}`,
          order_id: order.id,
          invoice_number: `Hazır: ${order.reference_code}`,
          issued_at: order.approved_at ?? order.created_at,
          buyer_name: null,
          buyer_email: null,
          buyer_tax_id: null,
          buyer_address: null,
          subtotal_try: subtotal,
          vat_rate: 20,
          vat_amount_try: vat,
          total_try: total,
          items_snapshot: [],
          order: { reference_code: order.reference_code },
        } satisfies InvoiceRow;
      });

    return [...rows, ...missingInvoiceRows].sort(
      (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime(),
    );
  });

export const getMyInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("invoices")
      .select(
        "id, order_id, invoice_number, issued_at, buyer_name, buyer_email, buyer_tax_id, buyer_address, subtotal_try, vat_rate, vat_amount_try, total_try, items_snapshot, order:orders(reference_code, status, created_at)",
      )
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Fatura bulunamadı");
    return row as unknown as InvoiceRow & {
      order?: { reference_code: string; status: string; created_at: string } | null;
    };
  });

export const getInvoiceByOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ orderId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("invoices")
      .select(
        "id, order_id, invoice_number, issued_at, buyer_name, buyer_email, buyer_tax_id, buyer_address, subtotal_try, vat_rate, vat_amount_try, total_try, items_snapshot, order:orders(reference_code, status, created_at)",
      )
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as
      | (InvoiceRow & {
          order?: { reference_code: string; status: string; created_at: string } | null;
        })
      | null;
  });

const billingSchema = z.object({
  billing_name: z.string().trim().max(120).nullable().optional(),
  billing_tax_id: z.string().trim().max(20).nullable().optional(),
  billing_address: z.string().trim().max(500).nullable().optional(),
});

export const getMyBillingProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("billing_name, billing_tax_id, billing_address, display_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateBillingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => billingSchema.parse(v))
  .handler(async ({ data, context }) => {
    const patch: {
      billing_name?: string | null;
      billing_tax_id?: string | null;
      billing_address?: string | null;
    } = {};
    if (data.billing_name !== undefined) patch.billing_name = data.billing_name || null;
    if (data.billing_tax_id !== undefined) patch.billing_tax_id = data.billing_tax_id || null;
    if (data.billing_address !== undefined) patch.billing_address = data.billing_address || null;

    const { error } = await context.supabase
      .from("profiles")
      .update(patch)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- ADMIN --------------------

async function assertAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("Yetki kontrol edilemedi");
  if (!data) throw new Error("Yetkisiz");
}

const adminFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const adminListInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => adminFilterSchema.parse(v ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("invoices")
      .select(
        "id, order_id, invoice_number, issued_at, buyer_name, buyer_email, buyer_tax_id, subtotal_try, vat_amount_try, total_try, user_id, order:orders(reference_code, status)",
      )
      .order("issued_at", { ascending: false })
      .limit(data.limit);

    if (data.from) q = q.gte("issued_at", data.from);
    if (data.to) q = q.lte("issued_at", data.to);
    if (data.q && data.q.length > 0) {
      const term = data.q.replace(/[%_]/g, "");
      q = q.or(
        `invoice_number.ilike.%${term}%,buyer_name.ilike.%${term}%,buyer_email.ilike.%${term}%`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const totals = (rows ?? []).reduce(
      (acc, r) => {
        acc.count++;
        acc.total += Number(r.total_try);
        acc.subtotal += Number(r.subtotal_try);
        acc.vat += Number(r.vat_amount_try);
        return acc;
      },
      { count: 0, total: 0, subtotal: 0, vat: 0 },
    );

    return { rows: (rows ?? []) as unknown as InvoiceRow[], totals };
  });

export const adminRegenerateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ orderId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error } = await supabaseAdmin.rpc("create_invoice_for_order", {
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    return { invoiceId: id as string };
  });
