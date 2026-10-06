import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

const catInput = z.object({ category: z.string().trim().min(1).max(80) });

export const isFollowingCategory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => catInput.parse(i))
  .handler(async ({ data, context }) => {
    const { mysqlOne } = await import("./mysql.server");
    const row = await mysqlOne<{ id: string }>(
      "SELECT id FROM category_follows WHERE user_id=? AND category=? LIMIT 1",
      [context.userId, data.category],
    );
    return { following: !!row };
  });

export const followCategory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => catInput.parse(i))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery(
      "INSERT INTO category_follows (id,user_id,category,created_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE category=VALUES(category)",
      [crypto.randomUUID(), context.userId, data.category],
    );
    return { ok: true as const };
  });

export const unfollowCategory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: unknown) => catInput.parse(i))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("DELETE FROM category_follows WHERE user_id=? AND category=?", [context.userId, data.category]);
    return { ok: true as const };
  });
