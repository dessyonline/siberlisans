import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_preferences" as never)
      .select("order_updates, wallet_events, marketing, abandonment, telegram_chat_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw new Error(error.message);
    return (data ?? DEFAULTS) as NotificationPrefs;
  });

const UpdateSchema = z.object({
  order_updates: z.boolean().optional(),
  wallet_events: z.boolean().optional(),
  marketing: z.boolean().optional(),
  abandonment: z.boolean().optional(),
  telegram_chat_id: z.string().trim().max(64).nullable().optional(),
});

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = { user_id: context.userId, ...data };
    const { error } = await context.supabase
      .from("notification_preferences" as never)
      .upsert(payload as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
