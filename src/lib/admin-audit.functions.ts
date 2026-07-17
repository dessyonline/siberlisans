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

/**
 * Sunucu tarafı yardımcı: bir admin server fn içinden çağrılır.
 * RLS + SECURITY DEFINER üzerinden log_admin_action RPC'sine yazar.
 */
export async function writeAuditLog(
  supabase: unknown,
  input: {
    action: string;
    entity_type: string;
    entity_id?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    await (supabase as SB).rpc(
      "log_admin_action" as never,
      {
        _action: input.action,
        _entity_type: input.entity_type,
        _entity_id: input.entity_id ?? null,
        _before: (input.before ?? null) as never,
        _after: (input.after ?? null) as never,
        _metadata: (input.metadata ?? null) as never,
      } as never,
    );
  } catch {
    // Audit yazımı kritik yolu bloklamaz.
  }
}

// ————————————————————————————————————————————————————————
// Client-facing server functions
// ————————————————————————————————————————————————————————

const listInput = z
  .object({
    limit: z.number().int().min(1).max(200).default(100),
    entity_type: z.string().max(64).optional(),
    actor_id: z.string().uuid().optional(),
    search: z.string().max(200).optional(),
    before: z.string().datetime().optional(),
  })
  .default({ limit: 100 });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("admin_audit_log")
      .select("id, actor_id, actor_email, action, entity_type, entity_id, before_data, after_data, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.actor_id) q = q.eq("actor_id", data.actor_id);
    if (data.before) q = q.lt("created_at", data.before);
    if (data.search) q = q.or(`action.ilike.%${data.search}%,entity_id.ilike.%${data.search}%,actor_email.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ————————————————————————————————————————————————————————
// Profit / loss report
// ————————————————————————————————————————————————————————

const reportInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

export const getProfitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const [series, byProduct] = await Promise.all([
      supabase.rpc("admin_profit_report" as never, {
        _from: data.from,
        _to: data.to,
        _granularity: data.granularity,
      } as never),
      supabase.rpc("admin_profit_by_product" as never, {
        _from: data.from,
        _to: data.to,
      } as never),
    ]);
    if (series.error) throw new Error(series.error.message);
    if (byProduct.error) throw new Error(byProduct.error.message);
    return {
      series: (series.data as Array<{
        bucket: string;
        orders_count: number;
        revenue: number;
        gross_revenue: number;
        discount_total: number;
        cost: number;
        profit: number;
        refunds: number;
        topups: number;
      }>) ?? [],
      byProduct: (byProduct.data as Array<{
        product_id: string;
        product_name: string;
        qty_sold: number;
        revenue: number;
        cost: number;
        profit: number;
      }>) ?? [],
    };
  });

