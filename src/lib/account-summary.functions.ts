import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware.server";

export const getAccountSummary = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { mysqlOne, num } = await import("./mysql.server");
    const [profile, wallet] = await Promise.all([
      mysqlOne<{ avatar_id: string | null; display_name: string | null }>(
        "SELECT avatar_id, display_name FROM profiles WHERE id = ?", [context.userId]),
      mysqlOne<{ balance_try: unknown }>(
        "SELECT balance_try FROM wallets WHERE user_id = ?", [context.userId]),
    ]);
    return {
      avatar_id: profile?.avatar_id ?? null,
      display_name: profile?.display_name ?? null,
      balance_try: num(wallet?.balance_try) ?? 0,
    };
  });
