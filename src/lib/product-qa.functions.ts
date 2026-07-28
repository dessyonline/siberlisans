import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const askInput = z.object({
  productId: z.string().uuid(),
  question: z.string().trim().min(5).max(600),
});

export const askProductQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => askInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Spam koruması: son 1 saatte en fazla 5 soru.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("product_questions" as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) throw new Error("Çok fazla soru gönderdin, biraz sonra tekrar dene.");

    const { error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("product_questions" as any)
      .insert({ product_id: data.productId, user_id: userId, question: data.question });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const answerInput = z.object({
  id: z.string().uuid(),
  answer: z.string().trim().min(1).max(2000),
  isPublic: z.boolean().optional(),
});

export const answerProductQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => answerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");

    const { data: row, error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("product_questions" as any)
      .update({
        answer: data.answer,
        answered_by: userId,
        answered_at: new Date().toISOString(),
        is_public: data.isPublic ?? true,
      })
      .eq("id", data.id)
      .select("user_id, product_id, question")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Soruyu soran kullanıcıya bildirim
    const r = row as { user_id?: string; product_id?: string } | null;
    if (r?.user_id) {
      const { data: product } = await supabase
        .from("products")
        .select("name, slug")
        .eq("id", r.product_id!)
        .maybeSingle();
      await supabase
        // biome-ignore lint/suspicious/noExplicitAny: notifications insert via RLS-permitted admin
        .from("notifications" as any)
        .insert({
          user_id: r.user_id,
          type: "product_question",
          title: "Sorun cevaplandı",
          body: `${product?.name ?? "Ürün"} hakkındaki sorunu yanıtladık.`,
          link: product?.slug ? `/urun/${product.slug}` : null,
        });
    }
    return { ok: true };
  });

export const deleteProductQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("product_questions" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
