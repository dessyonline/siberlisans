import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Sabit paketler
export const TOPUP_PACKAGES = [100, 250, 500, 1000] as const;

function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "TOP-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const createTopupInput = z.object({
  amount: z.number().int().refine((v) => (TOPUP_PACKAGES as readonly number[]).includes(v), {
    message: "Geçersiz paket",
  }),
});

export const createTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createTopupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const reference = genRef();
    const { data: row, error } = await supabase
      .from("wallet_topups")
      .insert({
        user_id: userId,
        amount_try: data.amount,
        reference_code: reference,
        status: "pending",
      })
      .select("id, reference_code")
      .single();
    if (error) throw new Error(error.message);

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(
        [
          "💰 <b>YENİ BAKİYE YÜKLEME</b>",
          `Ref: <code>${row.reference_code}</code>`,
          `Tutar: <b>${data.amount} TL</b>`,
          `Kullanıcı: ${(claims as { email?: string } | null)?.email ?? "—"}`,
        ].join("\n"),
      );
    } catch (e) {
      console.error("[notify] createTopup", (e as Error).message);
    }

    return { topupId: row.id, referenceCode: row.reference_code };
  });

const markTopupPaidInput = z.object({
  topupId: z.string().uuid(),
  receiptPath: z.string().min(1),
});

export const markTopupPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markTopupPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("wallet_topups")
      .update({ receipt_path: data.receiptPath, status: "reviewing", updated_at: new Date().toISOString() })
      .eq("id", data.topupId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const { data: t } = await supabase
        .from("wallet_topups")
        .select("reference_code, amount_try")
        .eq("id", data.topupId)
        .single();
      if (t) {
        await notifyTelegram(
          `📎 Bakiye dekontu yüklendi — ${t.reference_code} — ${t.amount_try} TL`,
        );
      }
    } catch (e) {
      console.error("[notify] markTopupPaid", (e as Error).message);
    }
    return { ok: true };
  });

const orderIdInput = z.object({ orderId: z.string().uuid() });

export const payOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("pay_order_with_wallet", {
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      ok: true,
      licenseKey: (row?.license_key as string) ?? null,
      activationToken: (row?.activation_token as string) ?? null,
      balanceAfter: Number(row?.balance_after ?? 0),
    };
  });

const topupIdInput = z.object({ topupId: z.string().uuid() });

export const approveTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => topupIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: balance, error } = await supabase.rpc("approve_topup", { _topup_id: data.topupId });
    if (error) throw new Error(error.message);
    return { ok: true, balance: Number(balance ?? 0) };
  });

const rejectTopupInput = z.object({
  topupId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const rejectTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectTopupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { error } = await supabase.rpc("reject_topup", {
      _topup_id: data.topupId,
      _note: data.note ?? "",
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

const adjustInput = z.object({
  userId: z.string().uuid(),
  delta: z.number().refine((v) => v !== 0 && Math.abs(v) <= 1000000, "Geçersiz tutar"),
  note: z.string().max(500).optional(),
});

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adjustInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: balance, error } = await supabase.rpc("admin_adjust_wallet", {
      _user_id: data.userId,
      _delta: data.delta,
      _note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true, balance: Number(balance ?? 0) };
  });
