import { timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";
import { clientIp, json } from "@/lib/license-api.server";
import { rateLimitShared } from "@/lib/license-feature.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";
import { sendTelegram } from "@/lib/telegram.server";

function matchesSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
        const providedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!expectedSecret) {
          console.error("[telegram-webhook] TELEGRAM_WEBHOOK_SECRET missing — request rejected");
          return json({ success: false, error: "Webhook yapılandırılmadı." }, 503);
        }
        if (!matchesSecret(providedSecret, expectedSecret)) {
          return json({ success: false, error: "Yetkisiz." }, 401);
        }
        if (!(await rateLimitShared(`telegram:webhook:${clientIp(request)}`, 30, 60_000))) {
          return json({ success: false, error: "Çok fazla istek." }, 429);
        }

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

        let code = "";
        if (text.startsWith("/start ")) {
          code = text.replace("/start ", "").trim();
        } else if (text.startsWith("start=")) {
          code = text.replace("start=", "").trim();
        } else if (text.length === 6 && !text.includes(" ")) {
          code = text.toUpperCase();
        } else if (text === "/start") {
          await sendTelegram({
            chatId,
            text: "👋 Merhaba! SiberLisans bildirim botuna hoş geldiniz.\n\nHesabınızı Telegram ile eşleştirmek için lütfen şu adımları izleyin:\n1. siberlisans.com adresinden hesabınıza giriş yapın.\n2. Menüden **Hesabım** sayfasına gidin.\n3. **Profil** sekmesini açıp sayfayı aşağı kaydırın.\n4. **Telegram Bildirimleri** alanındaki **> Eşleştirme Kodu Al** butonuna tıklayın.\n5. Ekranda beliren 6 haneli kodu (örneğin: `ABCDEF`) buraya yazıp gönderin.",
          });
          return json({ success: true }, 200);
        }

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
        } else {
           await sendTelegram({
             chatId,
             text: "Anlaşılmadı.\n\nHesabınızı eşleştirmek için SiberLisans panelinden (Hesabım > Profil > Telegram Bildirimleri) aldığınız 6 haneli kodu doğrudan bana gönderebilirsiniz.",
           });
        }

        return json({ success: true }, 200);
      },
    },
  },
});
