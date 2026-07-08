import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2).max(140).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(200),
  excerpt: z.string().max(400).nullable().optional(),
  content: z.string().max(50000),
  cover_url: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  published_at: z.string().nullable().optional(),
});

export const adminUpsertBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    // biome-ignore lint/suspicious/noExplicitAny: new table not in generated types
    const table = supabase.from("blog_posts" as any);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await table.update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await table.insert({ ...data, author_id: userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const deleteInput = z.object({ id: z.string().uuid() });
export const adminDeleteBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    // biome-ignore lint/suspicious/noExplicitAny: new table
    const { error } = await supabase.from("blog_posts" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
