import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export const transferOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((v: unknown) => z.object({ orderId: z.string().uuid(), toEmail: z.string().email() }).parse(v))
  .handler(async ({ data, context }) => {
    const order = await mysqlOne<{ id: string; user_id: string; status: string }>(
      "SELECT id, user_id, status FROM orders WHERE id=? LIMIT 1",
      [data.orderId],
    );
    if (!order || order.user_id !== context.userId) throw new Error("Sipariş bulunamadı.");
    if (order.status !== "approved") throw new Error("Sadece onaylanmış siparişler devredilebilir.");

    const target = await mysqlOne<{ id: string }>("SELECT id FROM profiles WHERE email=? LIMIT 1", [
      data.toEmail.trim().toLowerCase(),
    ]);
    if (!target) throw new Error("Bu e-posta ile kayıtlı kullanıcı bulunamadı.");
    if (target.id === context.userId) throw new Error("Kendi hesabına devredemezsin.");

    await mysqlQuery("UPDATE orders SET user_id=?, updated_at=? WHERE id=?", [target.id, ts(), data.orderId]);
    await mysqlQuery(
      `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        target.id,
        "license_transfer",
        "Sana bir lisans devredildi",
        "Hesabına yeni bir lisans eklendi.",
        "/hesabim",
        ts(),
      ],
    ).catch(() => undefined);

    return { id: data.orderId };
  });
