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

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      display_name: p.display_name,
      created_at: p.created_at,
      roles: roleMap.get(p.id) ?? [],
      stats: orderStats.get(p.id) ?? { total: 0, approved: 0, pending: 0, spend: 0 },
    }));
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
