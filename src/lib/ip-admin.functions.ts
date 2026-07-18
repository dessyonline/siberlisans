import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Yetkisiz.");
}

export const listBlockedIps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ip_blocks")
      .select("ip, reason, blocked_until, created_at, user_id")
      .gt("blocked_until", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const listSuspiciousIps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.supabase
      .from("wallet_topups")
      .select("client_ip, ip_country, is_vpn, status, created_at")
      .gte("created_at", since)
      .not("client_ip", "is", null);
    if (error) throw new Error(error.message);
    const agg = new Map<string, { ip: string; country: string | null; vpn: boolean; rejected: number; total: number; last: string }>();
    for (const r of data ?? []) {
      const ip = String((r as any).client_ip);
      const cur = agg.get(ip) ?? { ip, country: (r as any).ip_country ?? null, vpn: false, rejected: 0, total: 0, last: (r as any).created_at };
      cur.total += 1;
      if ((r as any).status === "rejected") cur.rejected += 1;
      if ((r as any).is_vpn) cur.vpn = true;
      if ((r as any).created_at > cur.last) cur.last = (r as any).created_at;
      agg.set(ip, cur);
    }
    const rows = Array.from(agg.values())
      .filter((r) => r.rejected >= 2 || r.vpn)
      .sort((a, b) => b.rejected - a.rejected)
      .slice(0, 50);
    return { rows };
  });

const blockInput = z.object({
  ip: z.string().min(3).max(64),
  reason: z.string().max(200).optional(),
  hours: z.number().min(1).max(24 * 30).default(24),
});

export const blockIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => blockInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const until = new Date(Date.now() + data.hours * 60 * 60 * 1000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ip_blocks")
      .upsert({ ip: data.ip, reason: data.reason ?? "manual", blocked_until: until }, { onConflict: "ip" });
    if (error) throw new Error(error.message);
    try {
      await context.supabase.rpc("log_admin_action" as never, {
        _action: "ip_block",
        _target: data.ip,
        _meta: { hours: data.hours, reason: data.reason ?? null },
      } as never);
    } catch {}
    return { ok: true, blocked_until: until };
  });

const unblockInput = z.object({ ip: z.string().min(3).max(64) });

export const unblockIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => unblockInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ip_blocks").delete().eq("ip", data.ip);
    if (error) throw new Error(error.message);
    try {
      await context.supabase.rpc("log_admin_action" as never, {
        _action: "ip_unblock",
        _target: data.ip,
        _meta: {},
      } as never);
    } catch {}
    return { ok: true };
  });
