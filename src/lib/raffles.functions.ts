import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireAuth } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const l = local.length <= 2 ? local[0] + "*" : local.slice(0, 2) + "*".repeat(Math.max(1, local.length - 3)) + local.slice(-1);
  const [dName, ...dRest] = domain.split(".");
  const d = dName.length <= 2 ? dName[0] + "*" : dName[0] + "*".repeat(Math.max(1, dName.length - 2)) + dName.slice(-1);
  return `${l}@${d}${dRest.length ? "." + dRest.join(".") : ""}`;
}

const TIER_RANK: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };

type RaffleProduct = {
  id: string;
  name: string | null;
  slug: string | null;
  image_url: string | null;
  retail_price_try: number | null;
  price_try: number | null;
};

export type RaffleWinnerBrief = {
  display_name: string;
  place: number;
  avatar_id: string | null;
  tier: string | null;
  masked_email: string | null;
};

export type ActiveRaffleRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  product_id: string | null;
  custom_prize_name: string | null;
  entry_cost_points: number;
  max_entries_per_user: number;
  start_at: string | null;
  end_at: string | null;
  status: string;
  winner_user_id: string | null;
  drawn_at: string | null;
  delivered_key: string | null;
  min_tier: string | null;
  num_winners: number;
  featured: boolean;
  seed_commit: string | null;
  seed_reveal: string | null;
  draw_hash: string | null;
  is_recurring: boolean;
  recurrence_days: number | null;
  daily_bonus_enabled: boolean;
  share_bonus_enabled: boolean;
  tickets_per_amount_try: number;
  product: RaffleProduct | null;
  total_entries: number;
  unique_participants: number;
  winners: RaffleWinnerBrief[];
};

type RaffleDbRow = {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  product_id: string | null;
  custom_prize_name: string | null;
  entry_cost_points: number | null;
  max_entries_per_user: number | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  winner_user_id: string | null;
  drawn_at: string | null;
  delivered_key: string | null;
  min_tier: string | null;
  num_winners: number | null;
  featured: number | null;
  seed_commit: string | null;
  seed_reveal: string | null;
  draw_hash: string | null;
  is_recurring: number | null;
  recurrence_days: number | null;
  daily_bonus_enabled: number | null;
  share_bonus_enabled: number | null;
  tickets_per_amount_try: unknown;
  p_id: string | null;
  p_name: string | null;
  p_slug: string | null;
  p_image_url: string | null;
  p_retail_price_try: unknown;
  p_price_try: unknown;
};

const RAFFLE_SELECT = `
  SELECT r.id, r.title, r.description, r.image_url, r.product_id, r.custom_prize_name,
         r.entry_cost_points, r.max_entries_per_user, r.start_at, r.end_at, r.status,
         r.winner_user_id, r.drawn_at, r.delivered_key, r.min_tier, r.num_winners, r.featured,
         r.seed_commit, r.seed_reveal, r.draw_hash, r.is_recurring, r.recurrence_days,
         r.daily_bonus_enabled, r.share_bonus_enabled, r.tickets_per_amount_try,
         p.id AS p_id, p.name AS p_name, p.slug AS p_slug, p.image_url AS p_image_url,
         p.retail_price_try AS p_retail_price_try, p.price_try AS p_price_try
    FROM raffles r
    LEFT JOIN products p ON p.id = r.product_id
`;

function mapRaffleRow(r: RaffleDbRow): Omit<ActiveRaffleRow, "total_entries" | "unique_participants" | "winners"> {
  return {
    id: r.id,
    title: r.title ?? "",
    description: r.description,
    image_url: r.image_url,
    product_id: r.product_id,
    custom_prize_name: r.custom_prize_name,
    entry_cost_points: Number(r.entry_cost_points ?? 0),
    max_entries_per_user: Number(r.max_entries_per_user ?? 1),
    start_at: r.start_at,
    end_at: r.end_at,
    status: r.status ?? "draft",
    winner_user_id: r.winner_user_id,
    drawn_at: r.drawn_at,
    delivered_key: r.delivered_key,
    min_tier: r.min_tier,
    num_winners: Number(r.num_winners ?? 1),
    featured: bool(r.featured),
    seed_commit: r.seed_commit,
    seed_reveal: r.seed_reveal,
    draw_hash: r.draw_hash,
    is_recurring: bool(r.is_recurring),
    recurrence_days: r.recurrence_days,
    daily_bonus_enabled: bool(r.daily_bonus_enabled),
    share_bonus_enabled: bool(r.share_bonus_enabled),
    tickets_per_amount_try: num(r.tickets_per_amount_try) ?? 0,
    product: r.p_id
      ? {
          id: r.p_id,
          name: r.p_name,
          slug: r.p_slug,
          image_url: r.p_image_url,
          retail_price_try: num(r.p_retail_price_try),
          price_try: num(r.p_price_try),
        }
      : null,
  };
}

export const listActiveRaffles = createServerFn({ method: "GET" }).handler(async (): Promise<ActiveRaffleRow[]> => {
  const rows = await mysqlQuery<RaffleDbRow>(
    `${RAFFLE_SELECT} WHERE r.status IN ('active','drawn') ORDER BY r.featured DESC, r.end_at ASC LIMIT 50`,
  );
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, { entries: number; users: Set<string> }>();
  const winnersMap = new Map<string, RaffleWinnerBrief[]>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const ec = await mysqlQuery<{ raffle_id: string; entries_count: number; user_id: string }>(
      `SELECT raffle_id, entries_count, user_id FROM raffle_entries WHERE raffle_id IN (${placeholders})`,
      ids,
    );
    for (const r of ec) {
      const cur = counts.get(r.raffle_id) ?? { entries: 0, users: new Set<string>() };
      cur.entries += Number(r.entries_count ?? 0);
      cur.users.add(r.user_id);
      counts.set(r.raffle_id, cur);
    }
    const wp = await mysqlQuery<{
      raffle_id: string;
      place: number;
      user_id: string;
      display_name: string | null;
      avatar_id: string | null;
      tier: string | null;
      email: string | null;
    }>(
      `SELECT w.raffle_id, w.place, w.user_id, p.display_name, p.avatar_id, p.tier, p.email
         FROM raffle_winners w
         LEFT JOIN profiles p ON p.id = w.user_id
        WHERE w.raffle_id IN (${placeholders}) AND w.disqualified_at IS NULL
        ORDER BY w.place ASC`,
      ids,
    );
    for (const w of wp) {
      const list = winnersMap.get(w.raffle_id) ?? [];
      list.push({
        display_name: w.display_name ?? "Anonim",
        place: w.place,
        avatar_id: w.avatar_id,
        tier: w.tier,
        masked_email: maskEmail(w.email),
      });
      winnersMap.set(w.raffle_id, list);
    }
  }
  return rows.map((r) => {
    const mapped = mapRaffleRow(r);
    const c = counts.get(r.id);
    return {
      ...mapped,
      total_entries: c?.entries ?? 0,
      unique_participants: c?.users.size ?? 0,
      winners: winnersMap.get(r.id) ?? [],
    };
  });
});

export type PastWinnerRow = {
  id: string;
  raffle_id: string;
  place: number;
  created_at: string;
  display_name: string;
  avatar_id: string | null;
  tier: string | null;
  masked_email: string | null;
};

export const listPastWinners = createServerFn({ method: "GET" }).handler(async (): Promise<PastWinnerRow[]> => {
  const rows = await mysqlQuery<{
    id: string;
    raffle_id: string;
    place: number;
    created_at: string;
    display_name: string | null;
    avatar_id: string | null;
    tier: string | null;
    email: string | null;
  }>(
    `SELECT w.id, w.raffle_id, w.place, w.created_at, p.display_name, p.avatar_id, p.tier, p.email
       FROM raffle_winners w
       LEFT JOIN profiles p ON p.id = w.user_id
      WHERE w.disqualified_at IS NULL
      ORDER BY w.created_at DESC
      LIMIT 30`,
  );
  return rows.map((r) => ({
    id: r.id,
    raffle_id: r.raffle_id,
    place: r.place,
    created_at: r.created_at,
    display_name: r.display_name ?? "Anonim",
    avatar_id: r.avatar_id,
    tier: r.tier,
    masked_email: maskEmail(r.email),
  }));
});

export type MyRaffleWinRow = {
  id: string;
  raffle_id: string;
  place: number;
  delivered_key: string | null;
  is_backup: boolean;
  created_at: string;
};

export const getMyRaffleWins = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyRaffleWinRow[]> => {
    const rows = await mysqlQuery<{
      id: string;
      raffle_id: string;
      place: number;
      delivered_key: string | null;
      is_backup: number | null;
      created_at: string;
    }>(
      `SELECT id, raffle_id, place, delivered_key, is_backup, created_at
         FROM raffle_winners WHERE user_id=? AND disqualified_at IS NULL`,
      [context.userId],
    );
    return rows.map((r) => ({
      id: r.id,
      raffle_id: r.raffle_id,
      place: r.place,
      delivered_key: r.delivered_key,
      is_backup: bool(r.is_backup),
      created_at: r.created_at,
    }));
  });

export type MyEntryInfo = { entries: number; spent: number; daily_today: boolean; shared: string[] };

export const getMyEntries = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Record<string, MyEntryInfo>> => {
    const userId = context.userId;
    const [entries, dailies, shares] = await Promise.all([
      mysqlQuery<{ raffle_id: string; entries_count: number; points_spent: number }>(
        "SELECT raffle_id, entries_count, points_spent FROM raffle_entries WHERE user_id=?",
        [userId],
      ),
      mysqlQuery<{ raffle_id: string; claim_date: string }>(
        "SELECT raffle_id, claim_date FROM raffle_daily_claims WHERE user_id=?",
        [userId],
      ),
      mysqlQuery<{ raffle_id: string; platform: string }>(
        "SELECT raffle_id, platform FROM raffle_shares WHERE user_id=?",
        [userId],
      ),
    ]);
    const map: Record<string, MyEntryInfo> = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const r of entries) {
      const cur = (map[r.raffle_id] ??= { entries: 0, spent: 0, daily_today: false, shared: [] });
      cur.entries += Number(r.entries_count ?? 0);
      cur.spent += Number(r.points_spent ?? 0);
    }
    for (const d of dailies) {
      const cur = (map[d.raffle_id] ??= { entries: 0, spent: 0, daily_today: false, shared: [] });
      const claimDate = String(d.claim_date).slice(0, 10);
      if (claimDate === today) cur.daily_today = true;
    }
    for (const s of shares) {
      const cur = (map[s.raffle_id] ??= { entries: 0, spent: 0, daily_today: false, shared: [] });
      cur.shared.push(s.platform);
    }
    return map;
  });

async function loadRaffleForUpdate(raffleId: string) {
  return mysqlOne<{
    id: string;
    status: string | null;
    start_at: string | null;
    end_at: string | null;
    max_entries_per_user: number | null;
    entry_cost_points: number | null;
    min_tier: string | null;
    daily_bonus_enabled: number | null;
    share_bonus_enabled: number | null;
  }>(
    `SELECT id, status, start_at, end_at, max_entries_per_user, entry_cost_points, min_tier,
            daily_bonus_enabled, share_bonus_enabled
       FROM raffles WHERE id=? LIMIT 1`,
    [raffleId],
  );
}

export const enterRaffle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ raffleId: z.string().uuid(), count: z.number().int().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }): Promise<{ entry_id: string; total_entries: number; points_spent: number }> => {
    const uid = context.userId;
    const r = await loadRaffleForUpdate(data.raffleId);
    if (!r) throw new Error("raffle_not_found");
    if (r.status !== "active") throw new Error("raffle_not_active");
    const now = Date.now();
    if (r.start_at && now < new Date(r.start_at).getTime()) throw new Error("raffle_closed");
    if (r.end_at && now >= new Date(r.end_at).getTime()) throw new Error("raffle_closed");

    if (r.min_tier) {
      const prof = await mysqlOne<{ tier: string | null }>("SELECT tier FROM profiles WHERE id=?", [uid]);
      const myRank = TIER_RANK[prof?.tier ?? ""] ?? 0;
      const minRank = TIER_RANK[r.min_tier] ?? 0;
      if (myRank < minRank) throw new Error("tier_too_low");
    }

    const mineRow = await mysqlOne<{ s: number | null }>(
      "SELECT COALESCE(SUM(entries_count),0) s FROM raffle_entries WHERE raffle_id=? AND user_id=?",
      [data.raffleId, uid],
    );
    const mine = Number(mineRow?.s ?? 0);
    const maxEntries = Number(r.max_entries_per_user ?? 1);
    if (mine + data.count > maxEntries) throw new Error("max_entries_reached");

    const cost = Number(r.entry_cost_points ?? 0) * data.count;
    if (cost > 0) {
      const prof = await mysqlOne<{ total_points: number | null }>("SELECT total_points FROM profiles WHERE id=?", [uid]);
      const bal = Number(prof?.total_points ?? 0);
      if (bal < cost) throw new Error("insufficient_points");
      await mysqlQuery("UPDATE profiles SET total_points=total_points-? WHERE id=?", [cost, uid]);
      const after = await mysqlOne<{ total_points: number | null }>("SELECT total_points FROM profiles WHERE id=?", [uid]);
      await mysqlQuery(
        `INSERT INTO user_points_ledger (id,user_id,delta,reason,balance_after,created_at) VALUES (?,?,?,?,?,?)`,
        [crypto.randomUUID(), uid, -cost, "raffle_entry", after?.total_points ?? 0, ts()],
      );
    }

    const entryId = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO raffle_entries (id,raffle_id,user_id,entries_count,points_spent,created_at) VALUES (?,?,?,?,?,?)`,
      [entryId, data.raffleId, uid, data.count, cost, ts()],
    );

    return { entry_id: entryId, total_entries: mine + data.count, points_spent: cost };
  });

export const claimDailyTicket = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ raffleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ entry_id: string; total_entries: number }> => {
    const uid = context.userId;
    const r = await loadRaffleForUpdate(data.raffleId);
    if (!r) throw new Error("raffle_not_found");
    if (r.status !== "active" || (r.end_at && Date.now() >= new Date(r.end_at).getTime())) throw new Error("raffle_closed");
    if (!bool(r.daily_bonus_enabled)) throw new Error("daily_bonus_disabled");
    const today = new Date().toISOString().slice(0, 10);
    const already = await mysqlOne<{ x: number }>(
      "SELECT 1 x FROM raffle_daily_claims WHERE user_id=? AND raffle_id=? AND claim_date=? LIMIT 1",
      [uid, data.raffleId, today],
    );
    if (already) throw new Error("already_claimed_today");
    const mineRow = await mysqlOne<{ s: number | null }>(
      "SELECT COALESCE(SUM(entries_count),0) s FROM raffle_entries WHERE raffle_id=? AND user_id=?",
      [data.raffleId, uid],
    );
    const mine = Number(mineRow?.s ?? 0);
    if (mine + 1 > Number(r.max_entries_per_user ?? 1)) throw new Error("max_entries_reached");
    await mysqlQuery("INSERT INTO raffle_daily_claims (user_id,raffle_id,claim_date,created_at) VALUES (?,?,?,?)", [
      uid,
      data.raffleId,
      today,
      ts(),
    ]);
    const entryId = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO raffle_entries (id,raffle_id,user_id,entries_count,points_spent,created_at) VALUES (?,?,?,1,0,?)`,
      [entryId, data.raffleId, uid, ts()],
    );
    return { entry_id: entryId, total_entries: mine + 1 };
  });

export const claimShareTicket = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ raffleId: z.string().uuid(), platform: z.enum(["twitter", "telegram", "instagram", "whatsapp", "facebook"]) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ entry_id: string; total_entries: number }> => {
    const uid = context.userId;
    const r = await loadRaffleForUpdate(data.raffleId);
    if (!r) throw new Error("raffle_not_found");
    if (r.status !== "active" || (r.end_at && Date.now() >= new Date(r.end_at).getTime())) throw new Error("raffle_closed");
    if (!bool(r.share_bonus_enabled)) throw new Error("share_bonus_disabled");
    const already = await mysqlOne<{ x: number }>(
      "SELECT 1 x FROM raffle_shares WHERE user_id=? AND raffle_id=? AND platform=? LIMIT 1",
      [uid, data.raffleId, data.platform],
    );
    if (already) throw new Error("already_shared");
    const mineRow = await mysqlOne<{ s: number | null }>(
      "SELECT COALESCE(SUM(entries_count),0) s FROM raffle_entries WHERE raffle_id=? AND user_id=?",
      [data.raffleId, uid],
    );
    const mine = Number(mineRow?.s ?? 0);
    if (mine + 1 > Number(r.max_entries_per_user ?? 1)) throw new Error("max_entries_reached");
    await mysqlQuery("INSERT INTO raffle_shares (user_id,raffle_id,platform,created_at) VALUES (?,?,?,?)", [
      uid,
      data.raffleId,
      data.platform,
      ts(),
    ]);
    const entryId = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO raffle_entries (id,raffle_id,user_id,entries_count,points_spent,created_at) VALUES (?,?,?,1,0,?)`,
      [entryId, data.raffleId, uid, ts()],
    );
    return { entry_id: entryId, total_entries: mine + 1 };
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

function assertAdmin(context: { isAdmin: boolean }) {
  if (!context.isAdmin) throw new Error("Yetkisiz.");
}

export type AdminRaffleRow = Omit<ActiveRaffleRow, "total_entries" | "unique_participants" | "winners"> & {
  created_at: string | null;
  updated_at: string | null;
};

export const adminListRaffles = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminRaffleRow[]> => {
    assertAdmin(context);
    const rows = await mysqlQuery<RaffleDbRow & { created_at: string | null; updated_at: string | null }>(
      `${RAFFLE_SELECT.replace("SELECT r.id,", "SELECT r.id, r.created_at, r.updated_at,")} ORDER BY r.created_at DESC LIMIT 200`,
    );
    return rows.map((r) => ({ ...mapRaffleRow(r), created_at: r.created_at, updated_at: r.updated_at }));
  });

export const upsertRaffle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    assertAdmin(context);
    const now = ts();
    if (data.id) {
      await mysqlQuery(
        `UPDATE raffles SET title=?, description=?, image_url=?, product_id=?, custom_prize_name=?,
           entry_cost_points=?, max_entries_per_user=?, end_at=?, status=?, min_tier=?, num_winners=?,
           featured=?, is_recurring=?, recurrence_days=?, daily_bonus_enabled=?, share_bonus_enabled=?,
           updated_at=? WHERE id=?`,
        [
          data.title,
          data.description ?? null,
          data.image_url ?? null,
          data.product_id ?? null,
          data.custom_prize_name ?? null,
          data.entry_cost_points,
          data.max_entries_per_user,
          ts(new Date(data.end_at)),
          data.status,
          data.min_tier ?? null,
          data.num_winners,
          data.featured ? 1 : 0,
          data.is_recurring ? 1 : 0,
          data.recurrence_days ?? null,
          data.daily_bonus_enabled ? 1 : 0,
          data.share_bonus_enabled ? 1 : 0,
          now,
          data.id,
        ],
      );
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    const rand = crypto.randomBytes(32).toString("hex");
    const seedCommit = crypto.createHash("sha256").update(rand).digest("hex");
    await mysqlQuery(
      `INSERT INTO raffles (id,title,description,image_url,product_id,custom_prize_name,entry_cost_points,
         max_entries_per_user,start_at,end_at,status,min_tier,num_winners,featured,is_recurring,recurrence_days,
         daily_bonus_enabled,share_bonus_enabled,seed_commit,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        data.title,
        data.description ?? null,
        data.image_url ?? null,
        data.product_id ?? null,
        data.custom_prize_name ?? null,
        data.entry_cost_points,
        data.max_entries_per_user,
        now,
        ts(new Date(data.end_at)),
        data.status,
        data.min_tier ?? null,
        data.num_winners,
        data.featured ? 1 : 0,
        data.is_recurring ? 1 : 0,
        data.recurrence_days ?? null,
        data.daily_bonus_enabled ? 1 : 0,
        data.share_bonus_enabled ? 1 : 0,
        seedCommit,
        context.userId,
        now,
        now,
      ],
    );
    return { id };
  });

type TicketKey = { entryId: string; userId: string; key: number };

function ticketKey(seed: string, entryId: string, idx: number): number {
  const h = crypto.createHash("md5").update(seed + entryId + String(idx)).digest("hex").slice(0, 15);
  const bigVal = BigInt("0x" + h) & ((1n << 60n) - 1n);
  const u = Number(bigVal) / 1152921504606846976;
  return -Math.log(Math.max(1e-18, u));
}

export const drawRaffle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        redraw: z.boolean().optional(),
        forcedUserIds: z.array(z.string().uuid()).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ winner_user_id: string; delivered_keys: string[]; draw_hash: string }> => {
    assertAdmin(context);
    const r = await mysqlOne<{
      id: string;
      title: string | null;
      status: string | null;
      product_id: string | null;
      num_winners: number | null;
    }>("SELECT id, title, status, product_id, num_winners FROM raffles WHERE id=? LIMIT 1", [data.id]);
    if (!r) throw new Error("raffle_not_found");
    if (r.status === "drawn" && !data.redraw) throw new Error("already_drawn");

    if (r.status === "drawn" && data.redraw) {
      const prevWinners = await mysqlQuery<{ delivered_key: string | null }>(
        "SELECT delivered_key FROM raffle_winners WHERE raffle_id=? AND delivered_key IS NOT NULL",
        [data.id],
      );
      for (const w of prevWinners) {
        if (w.delivered_key) {
          await mysqlQuery(
            "UPDATE license_keys SET status='available', assigned_at=NULL WHERE key_value=? AND product_id=?",
            [w.delivered_key, r.product_id],
          );
        }
      }
      await mysqlQuery("DELETE FROM raffle_winners WHERE raffle_id=?", [data.id]);
    }

    const seed = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(seed + data.id).digest("hex");
    const forced = data.forcedUserIds ?? [];
    let numWinners = Math.max(1, Math.min(Number(r.num_winners ?? 1), 20));
    if (forced.length) numWinners = Math.max(numWinners, forced.length);

    const entries = await mysqlQuery<{ id: string; user_id: string; entries_count: number }>(
      "SELECT id, user_id, entries_count FROM raffle_entries WHERE raffle_id=?",
      [data.id],
    );

    const forcedEntries: { entryId: string; userId: string }[] = [];
    for (const uid of forced) {
      const match = entries.find((e) => e.user_id === uid);
      forcedEntries.push({ entryId: match?.id ?? crypto.randomUUID(), userId: uid });
    }

    const bestPerUser = new Map<string, TicketKey>();
    for (const e of entries) {
      if (forced.includes(e.user_id)) continue;
      const count = Number(e.entries_count ?? 0);
      for (let i = 1; i <= count; i++) {
        const key = ticketKey(seed, e.id, i);
        const cur = bestPerUser.get(e.user_id);
        if (!cur || key < cur.key) bestPerUser.set(e.user_id, { entryId: e.id, userId: e.user_id, key });
      }
    }
    const randomOrdered = Array.from(bestPerUser.values()).sort((a, b) => a.key - b.key);

    const picks: { entryId: string; userId: string }[] = [
      ...forcedEntries,
      ...randomOrdered.slice(0, Math.max(0, numWinners - forcedEntries.length)),
    ].slice(0, numWinners);

    if (picks.length === 0) throw new Error("no_entries");

    const keys: string[] = [];
    let primaryUser: string | null = null;
    let place = 1;
    for (const pick of picks) {
      let delivered: string | null = null;
      if (r.product_id) {
        const keyRow = await mysqlOne<{ id: string; key_value: string | null }>(
          "SELECT id, key_value FROM license_keys WHERE product_id=? AND status='available' ORDER BY created_at ASC LIMIT 1",
          [r.product_id],
        );
        if (keyRow) {
          await mysqlQuery("UPDATE license_keys SET status='assigned', assigned_at=? WHERE id=?", [ts(), keyRow.id]);
          delivered = keyRow.key_value;
          if (delivered) keys.push(delivered);
        }
      }
      await mysqlQuery(
        `INSERT INTO raffle_winners (id,raffle_id,user_id,entry_id,place,delivered_key,is_backup,created_at)
         VALUES (?,?,?,?,?,?,0,?)`,
        [crypto.randomUUID(), data.id, pick.userId, pick.entryId, place, delivered, ts()],
      );
      if (place === 1) primaryUser = pick.userId;
      await mysqlQuery(
        `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          pick.userId,
          "raffle_win",
          `🎉 Çekilişi kazandın! (${place}.)`,
          `Tebrikler, "${r.title ?? ""}" çekilişinde ${place}. oldun. Ödülünü hesabından kontrol et.`,
          "/hesabim/lisanslar",
          ts(),
        ],
      );
      place += 1;
    }
    if (!primaryUser) throw new Error("no_entries");

    await mysqlQuery(
      "UPDATE raffles SET status='drawn', winner_user_id=?, drawn_at=?, seed_reveal=?, draw_hash=?, updated_at=? WHERE id=?",
      [primaryUser, ts(), seed, hash, ts(), data.id],
    );

    if (!data.redraw) {
      const distinctUsers = Array.from(new Set(entries.map((e) => e.user_id))).filter((u) => u !== primaryUser);
      for (const uid of distinctUsers) {
        await mysqlQuery(
          `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
          [crypto.randomUUID(), uid, "raffle_result", "Çekiliş sonuçlandı", `"${r.title ?? ""}" çekilişi tamamlandı. Sonuçları gör.`, "/cekilis", ts()],
        );
      }
    }

    return { winner_user_id: primaryUser, delivered_keys: keys, draw_hash: hash };
  });

export type RaffleParticipant = { user_id: string; display_name: string; avatar_id: string | null; tier: string | null; tickets: number };

export const listRaffleParticipants = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<RaffleParticipant[]> => {
    const rows = await mysqlQuery<{
      user_id: string;
      display_name: string | null;
      avatar_id: string | null;
      tier: string | null;
      tickets: number;
    }>(
      `SELECT p.id AS user_id, p.display_name, p.avatar_id, p.tier, SUM(e.entries_count) AS tickets
         FROM raffle_entries e
         JOIN profiles p ON p.id = e.user_id
        WHERE e.raffle_id=?
        GROUP BY p.id, p.display_name, p.avatar_id, p.tier
        ORDER BY tickets DESC
        LIMIT 120`,
      [data.id],
    );
    return rows.map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name ?? "Anonim",
      avatar_id: r.avatar_id,
      tier: r.tier,
      tickets: Number(r.tickets ?? 0),
    }));
  });

export const disqualifyWinner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ winnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ new_winner_id: string | null; new_user_id: string | null }> => {
    assertAdmin(context);
    const w = await mysqlOne<{ id: string; raffle_id: string; place: number; disqualified_at: string | null }>(
      "SELECT id, raffle_id, place, disqualified_at FROM raffle_winners WHERE id=? LIMIT 1",
      [data.winnerId],
    );
    if (!w) throw new Error("not_found");
    if (w.disqualified_at) throw new Error("already_disqualified");
    const r = await mysqlOne<{ seed_reveal: string | null }>("SELECT seed_reveal FROM raffles WHERE id=?", [w.raffle_id]);
    await mysqlQuery("UPDATE raffle_winners SET disqualified_at=? WHERE id=?", [ts(), data.winnerId]);

    const activeWinners = await mysqlQuery<{ user_id: string }>(
      "SELECT user_id FROM raffle_winners WHERE raffle_id=? AND disqualified_at IS NULL",
      [w.raffle_id],
    );
    const excluded = new Set(activeWinners.map((x) => x.user_id));
    const entries = await mysqlQuery<{ id: string; user_id: string; entries_count: number }>(
      "SELECT id, user_id, entries_count FROM raffle_entries WHERE raffle_id=?",
      [w.raffle_id],
    );
    const seed = r?.seed_reveal ?? "";
    let best: { entryId: string; userId: string; key: string } | null = null;
    for (const e of entries) {
      if (excluded.has(e.user_id)) continue;
      const count = Number(e.entries_count ?? 0);
      for (let i = 1; i <= count; i++) {
        const key = crypto.createHash("md5").update(seed + e.id + String(i)).digest("hex");
        if (!best || key < best.key) best = { entryId: e.id, userId: e.user_id, key };
      }
    }
    if (!best) return { new_winner_id: null, new_user_id: null };
    const newWinnerId = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO raffle_winners (id,raffle_id,user_id,entry_id,place,is_backup,created_at) VALUES (?,?,?,?,?,1,?)`,
      [newWinnerId, w.raffle_id, best.userId, best.entryId, w.place, ts()],
    );
    await mysqlQuery(
      `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        best.userId,
        "raffle_win",
        "🎉 Yedek kazanan sensin!",
        "Bir çekilişte yedekten seçildin, ödülünü kontrol et.",
        "/hesabim/lisanslar",
        ts(),
      ],
    );
    return { new_winner_id: newWinnerId, new_user_id: best.userId };
  });

export const broadcastRaffle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ raffleId: z.string().uuid(), title: z.string().min(2).max(120), body: z.string().min(2).max(500), link: z.string().max(200).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ sent: number }> => {
    assertAdmin(context);
    const users = await mysqlQuery<{ user_id: string }>(
      "SELECT DISTINCT user_id FROM raffle_entries WHERE raffle_id=?",
      [data.raffleId],
    );
    const link = data.link ?? "/cekilis";
    for (const u of users) {
      await mysqlQuery(
        `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), u.user_id, "raffle_update", data.title, data.body, link, ts()],
      );
    }
    return { sent: users.length };
  });

export type RaffleAnalytics = {
  total_entries: number;
  unique_participants: number;
  points_spent: number;
  hourly: Array<{ hour: string; count: number }>;
  top_users: Array<{ user_id: string; entries: number; name: string | null }>;
};

export const raffleAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RaffleAnalytics> => {
    assertAdmin(context);
    const totals = await mysqlOne<{ total_entries: number | null; unique_participants: number | null; points_spent: number | null }>(
      `SELECT COALESCE(SUM(entries_count),0) total_entries, COUNT(DISTINCT user_id) unique_participants,
              COALESCE(SUM(points_spent),0) points_spent
         FROM raffle_entries WHERE raffle_id=?`,
      [data.id],
    );
    const hourly = await mysqlQuery<{ hour: string; count: number | null }>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour, SUM(entries_count) AS count
         FROM raffle_entries WHERE raffle_id=? GROUP BY hour ORDER BY hour ASC`,
      [data.id],
    );
    const topUsers = await mysqlQuery<{ user_id: string; entries: number | null; name: string | null }>(
      `SELECT e.user_id, SUM(e.entries_count) AS entries, p.display_name AS name
         FROM raffle_entries e
         LEFT JOIN profiles p ON p.id = e.user_id
        WHERE e.raffle_id=?
        GROUP BY e.user_id, p.display_name
        ORDER BY entries DESC
        LIMIT 10`,
      [data.id],
    );
    return {
      total_entries: Number(totals?.total_entries ?? 0),
      unique_participants: Number(totals?.unique_participants ?? 0),
      points_spent: Number(totals?.points_spent ?? 0),
      hourly: hourly.map((h) => ({ hour: h.hour, count: Number(h.count ?? 0) })),
      top_users: topUsers.map((u) => ({ user_id: u.user_id, entries: Number(u.entries ?? 0), name: u.name })),
    };
  });

export type AdminRaffleWinnerRow = {
  id: string;
  user_id: string;
  entry_id: string | null;
  place: number;
  delivered_key: string | null;
  is_backup: boolean;
  disqualified_at: string | null;
  created_at: string;
  email: string | null;
  display_name: string | null;
};

export const adminRaffleWinners = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AdminRaffleWinnerRow[]> => {
    assertAdmin(context);
    const rows = await mysqlQuery<{
      id: string;
      user_id: string;
      entry_id: string | null;
      place: number;
      delivered_key: string | null;
      is_backup: number | null;
      disqualified_at: string | null;
      created_at: string;
      display_name: string | null;
      email: string | null;
    }>(
      `SELECT w.id, w.user_id, w.entry_id, w.place, w.delivered_key, w.is_backup, w.disqualified_at, w.created_at,
              p.display_name, p.email
         FROM raffle_winners w
         LEFT JOIN profiles p ON p.id = w.user_id
        WHERE w.raffle_id=?
        ORDER BY w.place ASC`,
      [data.id],
    );
    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      entry_id: r.entry_id,
      place: r.place,
      delivered_key: r.delivered_key,
      is_backup: bool(r.is_backup),
      disqualified_at: r.disqualified_at,
      created_at: r.created_at,
      email: r.email,
      display_name: r.display_name,
    }));
  });

export const deleteRaffle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    assertAdmin(context);
    await mysqlQuery("DELETE FROM raffles WHERE id=?", [data.id]);
    return { ok: true };
  });

/* ===== Admin picker helpers (product options + profile search) ===== */

export type ProductOption = { id: string; name: string | null };

export const listActiveProductOptionsForRaffle = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ProductOption[]> => {
    assertAdmin(context);
    const rows = await mysqlQuery<{ id: string; name: string | null }>(
      "SELECT id, name FROM products WHERE active=1 ORDER BY name ASC",
    );
    return rows;
  });

export type ProfileSearchRow = { user_id: string; display_name: string | null; email: string | null };

export const searchProfilesForRaffle = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }): Promise<ProfileSearchRow[]> => {
    assertAdmin(context);
    const term = `%${data.q.trim()}%`;
    const rows = await mysqlQuery<{ id: string; display_name: string | null; email: string | null }>(
      "SELECT id, display_name, email FROM profiles WHERE display_name LIKE ? OR email LIKE ? LIMIT 20",
      [term, term],
    );
    return rows.map((r) => ({ user_id: r.id, display_name: r.display_name, email: r.email }));
  });
