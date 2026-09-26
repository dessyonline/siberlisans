import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery } from "@/lib/mysql.server";

const sendSchema = z.object({
  target: z.enum(["all", "user", "email"]),
  userId: z.string().uuid().optional().nullable(),
  email: z.string().email().optional().nullable(),
  type: z.string().min(1).max(50).default("admin"),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
});

export const sendAdminNotification = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    let targetIds: string[] = [];
    if (data.target === "all") {
      const profs = await mysqlQuery<{ id: string }>("SELECT id FROM profiles");
      targetIds = profs.map((p) => p.id);
    } else if (data.target === "user") {
      if (!data.userId) throw new Error("Kullanıcı seçilmedi");
      targetIds = [data.userId];
    } else if (data.target === "email") {
      if (!data.email) throw new Error("E-posta boş");
      const profs = await mysqlQuery<{ id: string }>(
        "SELECT id FROM profiles WHERE email LIKE ? LIMIT 1",
        [data.email.trim()],
      );
      if (!profs || profs.length === 0) throw new Error("Bu e-postaya ait kullanıcı yok");
      targetIds = profs.map((p) => p.id);
    }

    if (targetIds.length === 0) throw new Error("Hedef kullanıcı yok");

    const { sendTelegram } = await import("./telegram.server");
    let inserted = 0;
    
    // Fetch telegram chat ids in bulk to avoid too many small queries
    const placeholders = targetIds.map(() => "?").join(",");
    const profiles = await mysqlQuery<{ id: string; telegram_chat_id: string | null }>(
      `SELECT id, telegram_chat_id FROM profiles WHERE id IN (${placeholders})`,
      targetIds
    );
    const tgMap = new Map(profiles.map(p => [p.id, p.telegram_chat_id]));

    for (const uid of targetIds) {
      await mysqlQuery(
        "INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?,NOW())",
        [crypto.randomUUID(), uid, data.type, data.title, data.body || null, data.link || null],
      );
      
      const chatId = tgMap.get(uid);
      if (chatId) {
        let tgText = `📢 *${data.title}*\n\n${data.body || ""}`;
        if (data.link) {
          tgText += `\n\n🔗 [Detayları Gör](https://siberlisans.com${data.link.startsWith("/") ? data.link : "/" + data.link})`;
        }
        await sendTelegram({ chatId, text: tgText.trim() });
      }
      
      inserted += 1;
    }
    return { ok: true, count: inserted };
  });

export type AdminNotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
};

export const listRecentAdminNotifications = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminNotificationRow[]> => {
    return mysqlQuery<AdminNotificationRow>(
      "SELECT id, user_id, type, title, body, link, created_at FROM notifications ORDER BY created_at DESC LIMIT 50",
    );
  });
