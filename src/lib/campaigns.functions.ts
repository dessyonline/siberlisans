import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne } from "@/lib/mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

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

export type CampaignRow = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  product_id: string | null;
  promo_code_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  telegram_message_id: number | null;
  status: string;
  error: string | null;
  created_at: string;
  product: { id: string; name: string; slug: string; image_url: string | null } | null;
  promo: { id: string; code: string } | null;
};

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<CampaignRow[]> => {
    const rows = await mysqlQuery<{
      id: string;
      title: string;
      body: string | null;
      image_url: string | null;
      product_id: string | null;
      promo_code_id: string | null;
      scheduled_at: string | null;
      sent_at: string | null;
      telegram_message_id: number | null;
      status: string;
      error: string | null;
      created_at: string;
      p_id: string | null;
      p_name: string | null;
      p_slug: string | null;
      p_image_url: string | null;
      pr_id: string | null;
      pr_code: string | null;
    }>(
      `SELECT c.id, c.title, c.body, c.image_url, c.product_id, c.promo_code_id, c.scheduled_at, c.sent_at,
              c.telegram_message_id, c.status, c.error, c.created_at,
              p.id as p_id, p.name as p_name, p.slug as p_slug, p.image_url as p_image_url,
              pr.id as pr_id, pr.code as pr_code
         FROM campaigns c
         LEFT JOIN products p ON p.id = c.product_id
         LEFT JOIN promo_codes pr ON pr.id = c.promo_code_id
        ORDER BY c.created_at DESC
        LIMIT 200`,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      image_url: r.image_url,
      product_id: r.product_id,
      promo_code_id: r.promo_code_id,
      scheduled_at: r.scheduled_at,
      sent_at: r.sent_at,
      telegram_message_id: r.telegram_message_id,
      status: r.status,
      error: r.error,
      created_at: r.created_at,
      product: r.p_id ? { id: r.p_id, name: r.p_name ?? "", slug: r.p_slug ?? "", image_url: r.p_image_url } : null,
      promo: r.pr_id ? { id: r.pr_id, code: r.pr_code ?? "" } : null,
    }));
  });

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
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
      await mysqlQuery(
        `UPDATE campaigns SET title=?, body=?, image_url=?, product_id=?, promo_code_id=?, scheduled_at=?, status=?, updated_at=?
          WHERE id=?`,
        [payload.title, payload.body, payload.image_url, payload.product_id, payload.promo_code_id, payload.scheduled_at, payload.status, ts(), data.id],
      );
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO campaigns (id, title, body, image_url, product_id, promo_code_id, scheduled_at, status, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, payload.title, payload.body, payload.image_url, payload.product_id, payload.promo_code_id, payload.scheduled_at, payload.status, context.userId, ts(), ts()],
    );
    return { id };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await mysqlQuery("DELETE FROM campaigns WHERE id=?", [data.id]);
    return { ok: true };
  });

export const sendCampaignNow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; messageId: number | null }> => {
    const c = await mysqlOne<{
      id: string;
      title: string;
      body: string | null;
      image_url: string | null;
      product_id: string | null;
      status: string;
      p_name: string | null;
      p_slug: string | null;
      p_image_url: string | null;
    }>(
      `SELECT c.id, c.title, c.body, c.image_url, c.product_id, c.status,
              p.name as p_name, p.slug as p_slug, p.image_url as p_image_url
         FROM campaigns c
         LEFT JOIN products p ON p.id = c.product_id
        WHERE c.id=?`,
      [data.id],
    );
    if (!c) throw new Error("Bulunamadı");

    const tg = await import("@/lib/telegram.server");
    const payload = tg.campaignPayload({
      title: c.title,
      body: c.body,
      imageUrl: c.image_url ?? c.p_image_url ?? null,
      productSlug: c.p_slug ?? null,
    });
    const r = await tg.postToChannel(payload);
    if (r.ok) {
      await mysqlQuery(
        "UPDATE campaigns SET status='sent', sent_at=?, telegram_message_id=?, error=NULL, updated_at=? WHERE id=?",
        [ts(), r.messageId ?? null, ts(), data.id],
      );
    } else {
      await mysqlQuery("UPDATE campaigns SET status='failed', error=?, updated_at=? WHERE id=?", [
        r.error ?? "bilinmeyen hata",
        ts(),
        data.id,
      ]);
      throw new Error(r.error ?? "Gönderim başarısız");
    }
    return { ok: true, messageId: r.messageId ?? null };
  });

export type TelegramTestResult =
  | { ok: false; step: string; error: string; channelIdConfigured?: string; botUsername?: string; hint?: string }
  | {
      ok: true;
      botUsername: string;
      channelIdConfigured: string;
      chatTitle: string;
      chatUsername: string | null;
      chatType: string;
      memberStatus: string;
      memberError: string | null;
    };

export const testTelegramChannel = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async (): Promise<TelegramTestResult> => {
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

/* ================= ADMIN PICKERS (MySQL) ================= */

export const listCampaignProductOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ id: string; name: string; slug: string }[]> => {
    const rows = await mysqlQuery<{ id: string; name: string; slug: string }>(
      "SELECT id, name, slug FROM products ORDER BY name",
    );
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), slug: String(r.slug) }));
  });

export const listCampaignPromoOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ id: string; code: string }[]> => {
    const rows = await mysqlQuery<{ id: string; code: string }>(
      "SELECT id, code FROM promo_codes WHERE active=1 ORDER BY code",
    );
    return rows.map((r) => ({ id: String(r.id), code: String(r.code) }));
  });
