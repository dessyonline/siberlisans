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

const sendSchema = z.object({
  target: z.enum(["all", "user", "email"]),
  userId: z.string().uuid().optional().nullable(),
  email: z.string().email().optional().nullable(),
  type: z.string().min(1).max(50).default("admin"),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
});

export const sendAdminNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetIds: string[] = [];
    if (data.target === "all") {
      const { data: profs, error } = await supabaseAdmin
        .from("profiles")
        .select("id");
      if (error) throw new Error(error.message);
      targetIds = (profs ?? []).map((p) => p.id);
    } else if (data.target === "user") {
      if (!data.userId) throw new Error("Kullanıcı seçilmedi");
      targetIds = [data.userId];
    } else if (data.target === "email") {
      if (!data.email) throw new Error("E-posta boş");
      const { data: profs, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", data.email.trim())
        .limit(1);
      if (error) throw new Error(error.message);
      if (!profs || profs.length === 0) throw new Error("Bu e-postaya ait kullanıcı yok");
      targetIds = profs.map((p) => p.id);
    }

    if (targetIds.length === 0) throw new Error("Hedef kullanıcı yok");

    const rows = targetIds.map((uid) => ({
      user_id: uid,
      type: data.type,
      title: data.title,
      body: data.body || null,
      link: data.link || null,
    }));

    // batch insert (chunk 500)
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("notifications").insert(chunk);
      if (error) throw new Error(error.message);
      inserted += chunk.length;
    }
    return { ok: true, count: inserted };
  });

export const listRecentAdminNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, type, title, body, link, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
