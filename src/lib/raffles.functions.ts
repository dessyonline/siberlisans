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

const RAFFLE_COLS =
  "id,title,description,image_url,product_id,custom_prize_name,entry_cost_points,max_entries_per_user,start_at,end_at,status,winner_user_id,drawn_at,delivered_key,min_tier,num_winners,featured,seed_commit,seed_reveal,draw_hash,is_recurring,recurrence_days,daily_bonus_enabled,share_bonus_enabled,tickets_per_amount_try,product:products(id,name,slug,image_url,retail_price_try,price_try)";

export const listActiveRaffles = createServerFn({ method: "GET" }).handler(async () => {
  const sb = pubClient();
  const { data, error } = await sb
    .from("raffles" as never)
    .select(RAFFLE_COLS)
    .in("status", ["active", "drawn"])
    .order("featured", { ascending: false })
    .order("end_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { entries: number; users: number }>();
  const winnersMap = new Map<string, Array<{ display_name: string; place: number }>>();
  if (ids.length) {
    const { data: ec } = await sb.from("raffle_entries" as never).select("raffle_id,entries_count,user_id").in("raffle_id", ids);
    const usersByRaffle: Record<string, Set<string>> = {};
    for (const r of ((ec ?? []) as Array<{ raffle_id: string; entries_count: number; user_id: string }>)) {
      const cur = counts.get(r.raffle_id) ?? { entries: 0, users: 0 };
      cur.entries += r.entries_count;
      counts.set(r.raffle_id, cur);
      (usersByRaffle[r.raffle_id] ??= new Set()).add(r.user_id);
    }
    for (const [rid, set] of Object.entries(usersByRaffle)) {
      const cur = counts.get(rid) ?? { entries: 0, users: 0 };
      cur.users = set.size;
      counts.set(rid, cur);
    }
    const { data: wp } = await sb
      .from("raffle_winners_public" as never)
      .select("raffle_id,place,display_name")
      .in("raffle_id", ids)
      .order("place", { ascending: true });
    for (const w of ((wp ?? []) as Array<{ raffle_id: string; place: number; display_name: string }>)) {
      (winnersMap.get(w.raffle_id) ?? winnersMap.set(w.raffle_id, []).get(w.raffle_id)!).push({
        display_name: w.display_name,
        place: w.place,
      });
    }
  }
  return rows.map((r) => {
    const c = counts.get(r.id) ?? { entries: 0, users: 0 };
    return { ...r, total_entries: c.entries, unique_participants: c.users, winners: winnersMap.get(r.id) ?? [] };
  });
});

export const listPastWinners = createServerFn({ method: "GET" }).handler(async () => {
  const sb = pubClient();
  const { data, error } = await sb
    .from("raffle_winners_public" as never)
    .select("id,raffle_id,place,display_name,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getMyEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [entries, dailies, shares] = await Promise.all([
      context.supabase.from("raffle_entries" as never).select("raffle_id,entries_count,points_spent").eq("user_id", context.userId),
      context.supabase.from("raffle_daily_claims" as never).select("raffle_id,claim_date").eq("user_id", context.userId),
      context.supabase.from("raffle_shares" as never).select("raffle_id,platform").eq("user_id", context.userId),
    ]);
    if (entries.error) throw new Error(entries.error.message);
    const map: Record<string, { entries: number; spent: number; daily_today: boolean; shared: string[] }> = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const r of ((entries.data ?? []) as Array<{ raffle_id: string; entries_count: number; points_spent: number }>)) {
      const cur = (map[r.raffle_id] ??= { entries: 0, spent: 0, daily_today: false, shared: [] });
      cur.entries += r.entries_count;
      cur.spent += r.points_spent;
    }
    for (const d of ((dailies.data ?? []) as Array<{ raffle_id: string; claim_date: string }>)) {
      const cur = (map[d.raffle_id] ??= { entries: 0, spent: 0, daily_today: false, shared: [] });
      if (d.claim_date === today) cur.daily_today = true;
    }
    for (const s of ((shares.data ?? []) as Array<{ raffle_id: string; platform: string }>)) {
      const cur = (map[s.raffle_id] ??= { entries: 0, spent: 0, daily_today: false, shared: [] });
      cur.shared.push(s.platform);
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

export const claimDailyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ raffleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("claim_daily_raffle_ticket" as never, { _raffle_id: data.raffleId } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(r) ? r[0] : r;
    return row as { entry_id: string; total_entries: number };
  });

export const claimShareTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ raffleId: z.string().uuid(), platform: z.enum(["twitter", "telegram", "instagram", "whatsapp", "facebook"]) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("claim_share_raffle_ticket" as never, {
      _raffle_id: data.raffleId,
      _platform: data.platform,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(r) ? r[0] : r;
    return row as { entry_id: string; total_entries: number };
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
  min_tier: z.enum(["bronze", "silver", "gold", "platinum"]).nullable().optional(),
  num_winners: z.number().int().min(1).max(20).default(1),
  featured: z.boolean().default(false),
  is_recurring: z.boolean().default(false),
  recurrence_days: z.number().int().min(1).max(90).nullable().optional(),
  daily_bonus_enabled: z.boolean().default(false),
  share_bonus_enabled: z.boolean().default(false),
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
    const payload: Record<string, unknown> = {
      title: data.title,
      description: data.description ?? null,
      image_url: data.image_url ?? null,
      product_id: data.product_id ?? null,
      custom_prize_name: data.custom_prize_name ?? null,
      entry_cost_points: data.entry_cost_points,
      max_entries_per_user: data.max_entries_per_user,
      end_at: data.end_at,
      status: data.status,
      min_tier: data.min_tier ?? null,
      num_winners: data.num_winners,
      featured: data.featured,
      is_recurring: data.is_recurring,
      recurrence_days: data.recurrence_days ?? null,
      daily_bonus_enabled: data.daily_bonus_enabled,
      share_bonus_enabled: data.share_bonus_enabled,
    };
    const tbl = context.supabase.from("raffles" as never) as any;
    if (data.id) {
      const { error } = await tbl.update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    // Generate seed commit for provably-fair (SHA-256 of random 32 bytes)
    const rand = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    payload.seed_commit = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: row, error } = await tbl.insert({ ...payload, created_by: context.userId }).select("id").single();
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
    return row as { winner_user_id: string; delivered_keys: string[] | null; draw_hash: string };
  });

export const disqualifyWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ winnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: r, error } = await context.supabase.rpc("disqualify_raffle_winner" as never, { _winner_id: data.winnerId } as never);
    if (error) throw new Error(error.message);
    return (Array.isArray(r) ? r[0] : r) as { new_winner_id: string | null; new_user_id: string | null };
  });

export const broadcastRaffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ raffleId: z.string().uuid(), title: z.string().min(2).max(120), body: z.string().min(2).max(500), link: z.string().max(200).optional() })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: r, error } = await context.supabase.rpc("broadcast_raffle_message" as never, {
      _raffle_id: data.raffleId,
      _title: data.title,
      _body: data.body,
      _link: data.link ?? "/cekilis",
    } as never);
    if (error) throw new Error(error.message);
    return { sent: Number(r ?? 0) };
  });

export const raffleAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: r, error } = await context.supabase.rpc("raffle_analytics" as never, { _raffle_id: data.id } as never);
    if (error) throw new Error(error.message);
    return (Array.isArray(r) ? r[0] : r) as {
      total_entries: number;
      unique_participants: number;
      points_spent: number;
      hourly: Array<{ hour: string; count: number }>;
      top_users: Array<{ user_id: string; entries: number; name: string | null }>;
    };
  });

export const adminRaffleWinners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: r, error } = await context.supabase
      .from("raffle_winners" as never)
      .select("id,user_id,entry_id,place,delivered_key,is_backup,disqualified_at,created_at")
      .eq("raffle_id", data.id)
      .order("place", { ascending: true });
    if (error) throw new Error(error.message);
    return r ?? [];
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
