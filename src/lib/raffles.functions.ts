import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function pubClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listActiveRaffles = createServerFn({ method: "GET" }).handler(async () => {
  const sb = pubClient();
  const { data, error } = await sb
    .from("raffles" as never)
    .select("id,title,description,image_url,product_id,custom_prize_name,entry_cost_points,max_entries_per_user,start_at,end_at,status,winner_user_id,drawn_at,product:products(id,name,slug,image_url,retail_price_try,price_try)")
    .in("status", ["active", "drawn"])
    .order("end_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  let counts = new Map<string, number>();
  if (ids.length) {
    const { data: ec } = await sb
      .from("raffle_entries" as never)
      .select("raffle_id,entries_count")
      .in("raffle_id", ids);
    for (const r of ((ec ?? []) as Array<{ raffle_id: string; entries_count: number }>)) {
      counts.set(r.raffle_id, (counts.get(r.raffle_id) ?? 0) + r.entries_count);
    }
  }
  return ((data ?? []) as Array<Record<string, unknown> & { id: string }>).map((r) => ({
    ...r,
    total_entries: counts.get(r.id) ?? 0,
  }));
});

export const getMyEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("raffle_entries" as never)
      .select("raffle_id,entries_count,points_spent,created_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const map: Record<string, { entries: number; spent: number }> = {};
    for (const r of ((data ?? []) as Array<{ raffle_id: string; entries_count: number; points_spent: number }>)) {
      const cur = map[r.raffle_id] ?? { entries: 0, spent: 0 };
      cur.entries += r.entries_count;
      cur.spent += r.points_spent;
      map[r.raffle_id] = cur;
    }
    return map;
  });

export const enterRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ raffleId: z.string().uuid(), count: z.number().int().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("enter_raffle" as never, {
      _raffle_id: data.raffleId,
      _count: data.count,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(r) ? r[0] : r;
    return row as { entry_id: string; total_entries: number; points_spent: number };
  });

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  image_url: z.string().url().max(500).nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  custom_prize_name: z.string().max(200).nullable().optional(),
  entry_cost_points: z.number().int().min(0).max(100000),
  max_entries_per_user: z.number().int().min(1).max(1000),
  end_at: z.string(),
  status: z.enum(["draft", "active", "cancelled"]).default("active"),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Yetkisiz.");
}

export const adminListRaffles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("raffles" as never)
      .select("*, product:products(id,name,slug)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      title: data.title,
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      product_id: data.product_id ?? null,
      custom_prize_name: data.custom_prize_name ?? null,
      entry_cost_points: data.entry_cost_points,
      max_entries_per_user: data.max_entries_per_user,
      end_at: data.end_at,
      status: data.status,
    };
    const tbl = context.supabase.from("raffles" as never) as any;
    if (data.id) {
      const { error } = await tbl.update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await tbl
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const drawRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: r, error } = await context.supabase.rpc("draw_raffle" as never, { _raffle_id: data.id } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(r) ? r[0] : r;
    return row as { winner_user_id: string; winner_entry_id: string; delivered_key: string | null };
  });

export const deleteRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("raffles" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
