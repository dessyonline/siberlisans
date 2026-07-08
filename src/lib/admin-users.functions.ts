import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("Yetki kontrol edilemedi");
  if (!data) throw new Error("Yetkisiz");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: orders, error: oErr }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, email, display_name, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("orders").select("user_id, status, price_try"),
      ]);

    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);
    if (oErr) throw new Error(oErr.message);

    // Auth admin API: fetch last_sign_in_at + email_confirmed flag
    const authMap = new Map<string, { last_sign_in_at: string | null; confirmed: boolean }>();
    try {
      let page = 1;
      while (page <= 20) {
        const { data: authData, error: aErr } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (aErr) break;
        const users = authData?.users ?? [];
        for (const u of users) {
          authMap.set(u.id, {
            last_sign_in_at: u.last_sign_in_at ?? null,
            confirmed: !!u.email_confirmed_at,
          });
        }
        if (users.length < 200) break;
        page++;
      }
    } catch {
      // ignore, sign-in verisi opsiyonel
    }

    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });

    const orderStats = new Map<string, { total: number; approved: number; pending: number; spend: number }>();
    (orders ?? []).forEach((o) => {
      const s = orderStats.get(o.user_id) ?? { total: 0, approved: 0, pending: 0, spend: 0 };
      s.total++;
      if (o.status === "approved") {
        s.approved++;
        s.spend += Number(o.price_try);
      }
      if (o.status === "pending" || o.status === "reviewing") s.pending++;
      orderStats.set(o.user_id, s);
    });

    return (profiles ?? []).map((p) => {
      const a = authMap.get(p.id);
      return {
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        created_at: p.created_at,
        last_sign_in_at: a?.last_sign_in_at ?? null,
        email_confirmed: a?.confirmed ?? false,
        roles: roleMap.get(p.id) ?? [],
        stats: orderStats.get(p.id) ?? { total: 0, approved: 0, pending: 0, spend: 0 },
      };
    });
  });

export const recentUserActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, created_at")
      .order("created_at", { ascending: false })
      .limit(8);

    const authUsers: { id: string; email: string | null; last_sign_in_at: string | null }[] = [];
    try {
      let page = 1;
      while (page <= 20) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        const users = data?.users ?? [];
        for (const u of users) {
          if (u.last_sign_in_at) {
            authUsers.push({
              id: u.id,
              email: u.email ?? null,
              last_sign_in_at: u.last_sign_in_at,
            });
          }
        }
        if (users.length < 200) break;
        page++;
      }
    } catch {
      // ignore
    }

    const nameMap = new Map<string, string | null>();
    (profiles ?? []).forEach((p) => nameMap.set(p.id, p.display_name));
    const missing = authUsers.map((u) => u.id).filter((id) => !nameMap.has(id));
    if (missing.length > 0) {
      const { data: extra } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", missing.slice(0, 100));
      (extra ?? []).forEach((p) => nameMap.set(p.id, p.display_name));
    }

    const recentLogins = authUsers
      .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))
      .slice(0, 8)
      .map((u) => ({
        id: u.id,
        email: u.email,
        display_name: nameMap.get(u.id) ?? null,
        last_sign_in_at: u.last_sign_in_at,
      }));

    const { count: totalCount } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // Son 24 saat kayıt / giriş
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newLast24h = (profiles ?? []).filter((p) => p.created_at > oneDayAgo).length;
    const activeLast24h = authUsers.filter(
      (u) => (u.last_sign_in_at ?? "") > oneDayAgo,
    ).length;

    return {
      recentSignups: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        created_at: p.created_at,
      })),
      recentLogins,
      totals: {
        users: totalCount ?? 0,
        signedInEver: authUsers.length,
        newLast24h,
        activeLast24h,
      },
    };
  });

const setRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
  grant: z.boolean(),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (data.userId === userId && data.role === "admin" && !data.grant) {
      throw new Error("Kendi admin rolünü kaldıramazsın");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const deleteInput = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.userId === userId) throw new Error("Kendini silemezsin");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const orderHistoryInput = z.object({ userId: z.string().uuid() });

export const getUserOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderHistoryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id, reference_code, status, price_try, created_at, product:products(name, slug)")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return orders ?? [];
  });
