import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/license-api.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";
import { sendTelegram } from "@/lib/telegram.server";

export const Route = createFileRoute("/api/public/hooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return json({ success: false, error: "Geçersiz JSON." }, 400);
        }

        const message = payload?.message;
        if (!message || !message.text || !message.chat || !message.chat.id) {
          return json({ success: true }, 200); // Ignore non-text messages gracefully
        }

        const chatId = message.chat.id.toString();
        const text = message.text.trim();

        if (text.startsWith("/start ")) {
          const code = text.replace("/start ", "").trim();
          if (code.length > 0) {
            // Check if this code exists in profiles
            const profile = await mysqlOne<{ id: string }>(
              "SELECT id FROM profiles WHERE telegram_verify_code=? LIMIT 1",
              [code]
            );

            if (profile) {
              // Pair it!
              await mysqlQuery(
                "UPDATE profiles SET telegram_chat_id=?, telegram_verify_code=NULL WHERE id=?",
                [chatId, profile.id]
              );
              await sendTelegram({
                chatId,
                text: "✅ *SiberLisans* hesabınız başarıyla Telegram ile eşleştirildi! Artık şifre sıfırlama kodu ve sipariş bildirimleri gibi önemli bilgileri buradan alacaksınız.",
              });
            } else {
              await sendTelegram({
                chatId,
                text: "❌ Geçersiz veya süresi dolmuş eşleştirme kodu.",
              });
            }
          }
        }

        return json({ success: true }, 200);
      },
    },
  },
});
