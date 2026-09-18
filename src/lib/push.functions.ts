import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

export const VAPID_PUBLIC_KEY =
  "BLKCmrJMAWj-STyLNRj-K7gJGqCFaHjeVw-ULRCLUzua_A5Ptd0mIXSb0n8vr3cXzHbTzLRy46J80cSFBBe2NYg";

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(10),
        auth: z.string().min(4),
        userAgent: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery(
      `INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,user_agent,fail_count,created_at)
       VALUES (?,?,?,?,?,?,0,NOW())
       ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth), user_agent=VALUES(user_agent), fail_count=0`,
      [crypto.randomUUID(), context.userId, data.endpoint, data.p256dh, data.auth, data.userAgent ?? null],
    );
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ endpoint: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", [
      context.userId,
      data.endpoint,
    ]);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sendPushToUser } = await import("./web-push.server");
    const r = await sendPushToUser(context.userId, {
      title: "SiberLisans · Test",
      body: "Web push aktif. Bildirimler artık cihazına düşecek.",
      url: "/hesabim",
      tag: "test",
    });
    return r;
  });
