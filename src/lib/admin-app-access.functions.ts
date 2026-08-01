import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_SLUG = "cyberlab";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Yetki kontrol edilemedi");
  if (!data) throw new Error("Yetkisiz");
}

export type AppAccessRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  expiresAt: string | null;
  lifetime: boolean;
  active: boolean;
  createdAt: string;
  sourceOrderId: string | null;
};

/** CyberLab erişimi olan tüm kullanıcıları listeler. */
export const listAppAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppAccessRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("app_access")
      .select("user_id, expires_at, created_at, source_order_id")
      .eq("app_slug", APP_SLUG)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.user_id);
    const nameMap = new Map<string, { email: string | null; display_name: string | null }>();
    if (ids.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, display_name")
        .in("id", ids);
      (profiles ?? []).forEach((p) =>
        nameMap.set(p.id, { email: p.email, display_name: p.display_name }),
      );
    }

    const now = Date.now();
    return (rows ?? []).map((r) => {
      const lifetime = !r.expires_at;
      return {
        userId: r.user_id,
        email: nameMap.get(r.user_id)?.email ?? null,
        displayName: nameMap.get(r.user_id)?.display_name ?? null,
        expiresAt: r.expires_at,
        lifetime,
        active: lifetime || new Date(r.expires_at as string).getTime() > now,
        createdAt: r.created_at,
        sourceOrderId: r.source_order_id,
      };
    });
  });

/** Admin kullanıcı arama (e-posta / isim). */
export const searchUsersForAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .or(`email.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(10);
    if (error) throw new Error(error.message);
    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      displayName: p.display_name,
    }));
  });

const grantInput = z.object({
  userId: z.string().uuid(),
  mode: z.enum(["days", "lifetime", "until"]),
  days: z.number().int().min(1).max(3650).optional(),
  until: z.string().optional(),
  extend: z.boolean().optional(),
});

/** Kullanıcıya CyberLab erişimi verir / süresini günceller. */
export const grantAppAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => grantInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("app_access")
      .select("id, expires_at")
      .eq("user_id", data.userId)
      .eq("app_slug", APP_SLUG)
      .maybeSingle();

    let expiresAt: string | null = null;
    if (data.mode === "days") {
      if (!data.days) throw new Error("Gün sayısı gerekli");
      const base =
        data.extend && existing?.expires_at && new Date(existing.expires_at).getTime() > Date.now()
          ? new Date(existing.expires_at).getTime()
          : Date.now();
      expiresAt = new Date(base + data.days * 86400000).toISOString();
    } else if (data.mode === "until") {
      if (!data.until) throw new Error("Bitiş tarihi gerekli");
      const t = new Date(data.until);
      if (Number.isNaN(t.getTime())) throw new Error("Geçersiz tarih");
      if (t.getTime() < Date.now()) throw new Error("Bitiş tarihi geçmişte olamaz");
      expiresAt = t.toISOString();
    }

    if (existing) {
      const { error } = await supabaseAdmin
        .from("app_access")
        .update({ expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("app_access")
        .insert({ user_id: data.userId, app_slug: APP_SLUG, expires_at: expiresAt });
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: existing ? "app_access_update" : "app_access_grant",
      entity_type: "app_access",
      entity_id: data.userId,
      metadata: { app_slug: APP_SLUG, expires_at: expiresAt, mode: data.mode },
    });

    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.userId,
        title: "CyberLab erişimin aktif",
        body: expiresAt
          ? `CyberLab erişimin ${new Date(expiresAt).toLocaleDateString("tr-TR")} tarihine kadar açıldı.`
          : "CyberLab erişimin süresiz olarak açıldı.",
        type: "info",
        link: "/cyberlab",
      });
    } catch {
      // bildirim opsiyonel
    }

    return { ok: true, expiresAt };
  });

/** Erişimi kaldırır. */
export const revokeAppAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_access")
      .delete()
      .eq("user_id", data.userId)
      .eq("app_slug", APP_SLUG);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "app_access_revoke",
      entity_type: "app_access",
      entity_id: data.userId,
      metadata: { app_slug: APP_SLUG },
    });
    return { ok: true };
  });
