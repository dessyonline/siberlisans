import { timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";
import { clientIp, json } from "@/lib/license-api.server";
import { rateLimitShared } from "@/lib/license-feature.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";
import { postToChannel, sendTelegram } from "@/lib/telegram.server";
import {
  approveUniquelisansPrice,
} from "@/lib/uniquelisans-price-approval.server";

type TelegramUpdate = {
  message?: {
    text?: unknown;
    chat?: { id?: string | number };
  };
};

function escapeTelegramHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ success: false, error: "Geçersiz JSON." }, 400);
        }

        const message = (payload as TelegramUpdate).message;
        if (!message || typeof message.text !== "string" || !message.chat || !message.chat.id) {
          return json({ success: true }, 200); // Ignore non-text messages gracefully
        }

        const chatId = message.chat.id.toString();
        const text = message.text.trim();

        // Fiyat onayı sadece tanımlı admin sohbetinden kabul edilir. Böylece
        // botu kullanan sıradan bir kullanıcı ürün fiyatını değiştiremez.
        const approvalCommand = /^onay(?:\s+([a-z0-9-]+))?$/i.exec(text);
        const adminChatId = (process.env.TELEGRAM_ADMIN_CHAT_ID ?? "").trim();
        if (approvalCommand && adminChatId && chatId === adminChatId) {
          const selector = approvalCommand[1]?.toUpperCase();
          const result = await approveUniquelisansPrice(selector);
          let reply = "";

          if (result.kind === "none") {
            reply = "ℹ️ Bekleyen UniQLisans fiyat indirimi onayı yok.";
          } else if (result.kind === "multiple") {
            const lines = result.approvals.slice(0, 12).map((item) =>
              `• ${escapeTelegramHtml(item.product_name)} — ₺${item.current_price} → ₺${item.proposed_price} — <code>onay ${item.approval_code}</code>`,
            );
            reply = `📋 <b>Birden fazla bekleyen onay var</b>\n${lines.join("\n")}\n\nBelirli ürünü onaylamak için kodu yaz.`;
          } else if (result.kind === "not_found") {
            reply = `❌ <code>${escapeTelegramHtml(result.code)}</code> kodlu bekleyen onay bulunamadı.`;
          } else if (result.kind === "approved") {
            const item = result.approval;
            reply = `✅ <b>Fiyat indirimi onaylandı</b>\n${escapeTelegramHtml(item.product_name)}\nUniQLisans alış: ₺${item.supplier_new_price}\nYeni satış fiyatı: <b>₺${result.new_price}</b>`;
            const channelResult = await postToChannel({
              text: `📉 <b>Fiyat indirimi</b>\n📦 ${escapeTelegramHtml(item.product_name)}\n💰 Yeni fiyat: <b>₺${result.new_price}</b>`,
            });
            if (!channelResult.ok && channelResult.error !== "TELEGRAM_CHANNEL_ID yok") {
              console.error("[telegram][channel][price-approval]", channelResult.error);
            }
          } else if (result.kind === "already") {
            reply = `ℹ️ ${escapeTelegramHtml(result.approval.product_name)} zaten ₺${result.new_price} veya daha düşük fiyatta.`;
          } else if (result.kind === "locked") {
            reply = `🔒 ${escapeTelegramHtml(result.approval.product_name)} fiyat kilitli olduğu için değiştirilmedi.`;
          } else {
            reply = `⚠️ ${escapeTelegramHtml(result.approval.product_name)} için fiyat onayı geçersiz oldu; ürün fiyatı bu mesajdan sonra değişmiş.`;
          }

          await sendTelegram({ chatId, text: reply });
          return json({ success: true }, 200);
        }

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
