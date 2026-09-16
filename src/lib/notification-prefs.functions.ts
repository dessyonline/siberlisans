import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, bool } from "./mysql.server";

export type NotificationPrefs = {
  order_updates: boolean;
  wallet_events: boolean;
  marketing: boolean;
  abandonment: boolean;
  telegram_chat_id: string | null;
};

const DEFAULTS: NotificationPrefs = {
  order_updates: true,
  wallet_events: true,
  marketing: true,
  abandonment: true,
  telegram_chat_id: null,
};

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<NotificationPrefs> => {
    const row = await mysqlOne<Record<string, unknown>>(
      `SELECT order_updates, wallet_events, marketing, abandonment, telegram_chat_id
         FROM notification_preferences WHERE user_id=? LIMIT 1`,
      [context.userId],
    );
    if (!row) return DEFAULTS;
    return {
      order_updates: bool(row["order_updates"]),
      wallet_events: bool(row["wallet_events"]),
      marketing: bool(row["marketing"]),
      abandonment: bool(row["abandonment"]),
      telegram_chat_id: (row["telegram_chat_id"] as string | null) ?? null,
    };
  });

const UpdateSchema = z.object({
  order_updates: z.boolean().optional(),
  wallet_events: z.boolean().optional(),
  marketing: z.boolean().optional(),
  abandonment: z.boolean().optional(),
  telegram_chat_id: z.string().trim().max(64).nullable().optional(),
});

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const merged = { ...DEFAULTS, ...data };
    const now = ts();
    await mysqlQuery(
      `INSERT INTO notification_preferences
         (user_id, order_updates, wallet_events, marketing, abandonment, telegram_chat_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         order_updates=VALUES(order_updates),
         wallet_events=VALUES(wallet_events),
         marketing=VALUES(marketing),
         abandonment=VALUES(abandonment),
         telegram_chat_id=VALUES(telegram_chat_id),
         updated_at=VALUES(updated_at)`,
      [
        context.userId,
        merged.order_updates ? 1 : 0,
        merged.wallet_events ? 1 : 0,
        merged.marketing ? 1 : 0,
        merged.abandonment ? 1 : 0,
        merged.telegram_chat_id ?? null,
        now,
        now,
      ],
    );
    return { ok: true };
  });
