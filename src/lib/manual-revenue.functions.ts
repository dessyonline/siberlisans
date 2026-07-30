import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SB = { rpc: (...args: never[]) => Promise<{ data: unknown; error: { message: string } | null }> };

async function assertAdmin(supabase: unknown, userId: string) {
  const { data } = await (supabase as SB).rpc(
    "has_role" as never,
    { _user_id: userId, _role: "admin" } as never,
  );
  if (!data) throw new Error("Yetkisiz.");
}

export type ManualRevenueRow = {
  id: string;
  occurred_at: string;
  amount_try: number;
  cost_try: number;
  label: string;
  note: string | null;
  created_at: string;
};

const listInput = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .default({});

export const listManualRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const params: Record<string, string> = {};
    if (data.from) params._from = data.from;
    if (data.to) params._to = data.to;
    const { data: rows, error } = await (supabase as unknown as SB).rpc(
      "admin_list_manual_revenue" as never,
      params as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as ManualRevenueRow[];
  });

const addInput = z.object({
  amount: z.number().finite(),
  label: z.string().min(1).max(160),
  occurred_at: z.string().datetime().optional(),
  cost: z.number().finite().min(0).default(0),
  note: z.string().max(500).optional(),
});

export const addManualRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: id, error } = await (supabase as unknown as SB).rpc(
      "admin_add_manual_revenue" as never,
      {
        _amount: data.amount,
        _label: data.label,
        _occurred_at: data.occurred_at ?? new Date().toISOString(),
        _cost: data.cost,
        _note: data.note ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const deleteManualRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase as unknown as SB).rpc(
      "admin_delete_manual_revenue" as never,
      { _id: data.id } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const repairDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await (supabase as unknown as SB).rpc(
      "admin_repair_deliveries" as never,
      { _limit: 200 } as never,
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as { order_id: string; reference_code: string; outcome: string }[];
  });
