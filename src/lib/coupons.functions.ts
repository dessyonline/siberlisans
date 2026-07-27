import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(1).max(50), subtotal: z.number().nonnegative() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc(
      // biome-ignore lint/suspicious/noExplicitAny: rpc not in generated types
      "validate_coupon" as any,
      { _code: data.code, _subtotal: data.subtotal },
    );
    if (error) throw new Error(error.message);
    const r = (Array.isArray(rows) ? rows[0] : rows) as
      | { coupon_id: string; code: string; discount_try: number; final_try: number }
      | undefined;
    if (!r) throw new Error("Kupon uygulanamadı");
    return {
      couponId: r.coupon_id,
      code: r.code,
      discountTry: Number(r.discount_try),
      finalTry: Number(r.final_try),
    };
  });

/* ================= ADMIN ================= */

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(50),
  discount_type: z.enum(["percent", "amount"]),
  discount_value: z.number().positive(),
  min_order_try: z.number().nonnegative().default(0),
  max_uses: z.number().int().positive().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const adminUpsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!role) throw new Error("Yetkisiz");
    const payload = {
      code: data.code.toUpperCase(),
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_try: data.min_order_try,
      max_uses: data.max_uses ?? null,
      expires_at: data.expires_at || null,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: table not in generated types
        .from("coupons" as any)
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not in generated types
      .from("coupons" as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as unknown as { id: string }).id };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!role) throw new Error("Yetkisiz");
    const { error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not in generated types
      .from("coupons" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminIssueSegmentCoupons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        segment: z.enum(["no_purchase", "returning", "inactive_30"]),
        discount_type: z.enum(["percent", "amount"]),
        discount_value: z.number().positive(),
        min_order_try: z.number().nonnegative().default(0),
        days_valid: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(1000).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!role) throw new Error("Yetkisiz");
    const { data: rows, error } = await supabase.rpc(
      // biome-ignore lint/suspicious/noExplicitAny: rpc not in generated types
      "admin_issue_segment_coupons" as any,
      {
        _segment: data.segment,
        _discount_type: data.discount_type,
        _discount_value: data.discount_value,
        _min_order_try: data.min_order_try,
        _days_valid: data.days_valid,
        _limit: data.limit,
      },
    );
    if (error) throw new Error(error.message);
    const r = (Array.isArray(rows) ? rows[0] : rows) as
      | { issued: number; sample_code: string | null }
      | undefined;
    return { issued: Number(r?.issued ?? 0), sampleCode: r?.sample_code ?? null };
  });
