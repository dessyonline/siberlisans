import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  body: z.string().max(3000).nullable().optional(),
  image_url: z.string().url().max(500).nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  promo_code_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  status: z.enum(["draft", "scheduled"]).default("draft"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Yetkisiz.");
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("*, product:products(id,name,slug,image_url), promo:promo_codes(id,code)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      title: data.title,
      body: data.body ?? null,
      image_url: data.image_url ?? null,
      product_id: data.product_id ?? null,
      promo_code_id: data.promo_code_id ?? null,
      scheduled_at: data.scheduled_at ?? null,
      status: data.status,
    };
    if (data.id) {
      const { error } = await context.supabase.from("campaigns").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendCampaignNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: c, error } = await context.supabase
      .from("campaigns")
      .select("id,title,body,image_url,product_id,promo_code_id,status,product:products(name,slug,image_url,price_try),promo:promo_codes(code,discount_type,discount_value,min_amount,expires_at,max_uses)")
      .eq("id", data.id)
      .single();
    if (error || !c) throw new Error(error?.message ?? "Bulunamadı");

    const tg = await import("@/lib/telegram.server");
    const product = c.product as { name: string; slug: string; image_url: string | null; price_try: number } | null;
    const payload = tg.campaignPayload({
      title: c.title,
      body: c.body,
      imageUrl: c.image_url ?? product?.image_url ?? null,
      productSlug: product?.slug ?? null,
    });
    const r = await tg.postToChannel(payload);
    const upd = r.ok
      ? { status: "sent", sent_at: new Date().toISOString(), telegram_message_id: r.messageId ?? null, error: null }
      : { status: "failed", error: r.error ?? "bilinmeyen hata" };
    await context.supabase.from("campaigns").update(upd).eq("id", data.id);
    if (!r.ok) throw new Error(r.error ?? "Gönderim başarısız");
    return { ok: true, messageId: r.messageId };
  });

export const testTelegramChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (!token) return { ok: false, step: "env", error: "TELEGRAM_BOT_TOKEN yok" };
    if (!channelId) return { ok: false, step: "env", error: "TELEGRAM_CHANNEL_ID yok" };

    const api = (m: string) => `https://api.telegram.org/bot${token}/${m}`;
    const call = async (m: string, body: Record<string, unknown> = {}) => {
      const r = await fetch(api(m), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await r.json().catch(() => ({}))) as { ok?: boolean; result?: Record<string, unknown>; description?: string };
    };

    const me = await call("getMe");
    if (!me.ok) return { ok: false, step: "getMe", channelIdConfigured: channelId, error: me.description ?? "getMe hatası" };
    const botUsername = (me.result?.username as string) ?? "?";
    const botId = me.result?.id as number | undefined;

    const chat = await call("getChat", { chat_id: channelId });
    if (!chat.ok) {
      return {
        ok: false,
        step: "getChat",
        botUsername,
        channelIdConfigured: channelId,
        error: chat.description ?? "getChat hatası",
        hint: chat.description?.includes("chat not found")
          ? "TELEGRAM_CHANNEL_ID yanlış. @kullaniciadi (başında @) veya -100 ile başlayan sayısal ID olmalı."
          : undefined,
      };
    }
    const chatTitle = (chat.result?.title as string) ?? "?";
    const chatUsername = (chat.result?.username as string) ?? null;
    const chatType = (chat.result?.type as string) ?? "?";

    let memberStatus = "unknown";
    let memberError: string | null = null;
    if (botId) {
      const mem = await call("getChatMember", { chat_id: channelId, user_id: botId });
      if (mem.ok) memberStatus = (mem.result?.status as string) ?? "unknown";
      else memberError = mem.description ?? "getChatMember hatası";
    }

    return {
      ok: true,
      botUsername,
      channelIdConfigured: channelId,
      chatTitle,
      chatUsername: chatUsername ? "@" + chatUsername : null,
      chatType,
      memberStatus,
      memberError,
    };
  });
