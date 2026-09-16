import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery } from "./mysql.server";

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AppNotification[]> => {
    const rows = await mysqlQuery<AppNotification>(
      `SELECT id, type, title, body, link, read_at, created_at
         FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30`,
      [context.userId],
    );
    return rows;
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ id: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await mysqlQuery("UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL", [
      ts(),
      data.id,
      context.userId,
    ]);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await mysqlQuery("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL", [
      ts(),
      context.userId,
    ]);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ id: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    await mysqlQuery("DELETE FROM notifications WHERE id=? AND user_id=?", [data.id, context.userId]);
    return { ok: true };
  });

export const deleteAllNotifications = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await mysqlQuery("DELETE FROM notifications WHERE user_id=?", [context.userId]);
    return { ok: true };
  });
