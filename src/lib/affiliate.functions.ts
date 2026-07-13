import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getAffiliateStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [stats, payouts, referred] = await Promise.all([
      supabase.rpc("affiliate_stats", { _user_id: userId }),
      supabase
        .from("affiliate_payouts")
        .select("id, amount_try, status, method, destination, admin_note, created_at, processed_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.rpc("list_my_referred"),
    ]);
    const s = stats.data?.[0] ?? {
      total_earned: 0,
      total_paid: 0,
      pending: 0,
      referred_count: 0,
      active_referred_count: 0,
    };
    return {
      totalEarned: Number(s.total_earned) || 0,
      totalPaid: Number(s.total_paid) || 0,
      pending: Number(s.pending) || 0,
      referredCount: s.referred_count ?? 0,
      activeReferredCount: s.active_referred_count ?? 0,
      payouts: payouts.data ?? [],
      referred: referred.data ?? [],
    };
  });

export const requestAffiliatePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        amount: z.number().min(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_affiliate_payout", {
      _amount: data.amount,
      _method: "wallet",
      _destination: "",
    });
    if (error) throw new Error(error.message);
    return { id };
  });
