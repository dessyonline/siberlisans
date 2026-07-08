// Server-only Telegram notifier. Never import from client code.
// Silently swallows errors so notification failures never break the order flow.

export async function notifyTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[telegram] send failed", res.status, body.slice(0, 300));
    }
  } catch (e) {
    console.error("[telegram] send error", (e as Error).message);
  }
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function orderCreatedMessage(o: {
  reference: string;
  productName: string;
  priceTry: number;
  userEmail?: string | null;
}): string {
  return [
    "🆕 <b>Yeni sipariş</b>",
    `📦 Ürün: <b>${esc(o.productName)}</b>`,
    `💰 Fiyat: ₺${esc(o.priceTry.toLocaleString("tr-TR"))}`,
    `🔖 Kod: <code>${esc(o.reference)}</code>`,
    o.userEmail ? `👤 Müşteri: ${esc(o.userEmail)}` : null,
    "⏳ Durum: <i>ödeme bekleniyor</i>",
  ]
    .filter(Boolean)
    .join("\n");
}

export function receiptUploadedMessage(o: {
  reference: string;
  productName: string;
  priceTry: number;
  userEmail?: string | null;
}): string {
  return [
    "💳 <b>Dekont yüklendi — onay bekliyor</b>",
    `📦 Ürün: <b>${esc(o.productName)}</b>`,
    `💰 Fiyat: ₺${esc(o.priceTry.toLocaleString("tr-TR"))}`,
    `🔖 Kod: <code>${esc(o.reference)}</code>`,
    o.userEmail ? `👤 Müşteri: ${esc(o.userEmail)}` : null,
    "👉 Admin panelinden inceleyip onaylayın.",
  ]
    .filter(Boolean)
    .join("\n");
}
