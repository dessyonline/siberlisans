// Server-only Telegram notifier. Never import from client code.

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

type InlineButton = { text: string; url: string };
type InlineKeyboard = InlineButton[][];

export type SendPayload = {
  chatId: string;
  text: string;
  photoUrl?: string | null;
  buttons?: InlineKeyboard;
};

export type SendResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
};

/** Low-level sender. Returns the Telegram result (message_id) on success. */
export async function sendTelegram(p: SendPayload): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN yok" };
  if (!p.chatId) return { ok: false, error: "chatId yok" };

  const reply_markup = p.buttons && p.buttons.length ? { inline_keyboard: p.buttons } : undefined;

  try {
    if (p.photoUrl) {
      const res = await fetch(API(token, "sendPhoto"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: p.chatId,
          photo: p.photoUrl,
          caption: p.text.slice(0, 1024),
          parse_mode: "HTML",
          reply_markup,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
      if (!res.ok || !j.ok) {
        // Fallback: some image URLs Telegram can't fetch — send as text
        if (p.photoUrl) {
          return sendTelegram({ ...p, photoUrl: null, text: p.text + `\n\n🖼 ${p.photoUrl}` });
        }
        return { ok: false, error: j.description ?? `HTTP ${res.status}` };
      }
      return { ok: true, messageId: j.result?.message_id };
    }

    const res = await fetch(API(token, "sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: p.chatId,
        text: p.text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_markup,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!res.ok || !j.ok) return { ok: false, error: j.description ?? `HTTP ${res.status}` };
    return { ok: true, messageId: j.result?.message_id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Admin notification chat (kişisel bildirim). Backward compatible. */
export async function notifyTelegram(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return;
  const r = await sendTelegram({ chatId, text });
  if (!r.ok) console.error("[telegram][admin]", r.error);
}

/** Public campaign channel. */
export async function postToChannel(p: Omit<SendPayload, "chatId">): Promise<SendResult> {
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!chatId) return { ok: false, error: "TELEGRAM_CHANNEL_ID yok" };
  const r = await sendTelegram({ ...p, chatId });
  if (!r.ok) return { ...r, error: `${r.error} (chat_id=${chatId})` };
  return r;
}

/* ============ helpers ============ */

const SITE_URL = "https://siberlisans.lovable.app";

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function productUrl(slug: string): string {
  return `${SITE_URL}/urun/${slug}`;
}

function miniAppButton(startParam?: string): InlineButton | null {
  const mini = process.env.TELEGRAM_MINIAPP_URL;
  if (!mini) return null;
  const url = startParam ? `${mini}?startapp=${encodeURIComponent(startParam)}` : mini;
  return { text: "🚀 Mini App'te Aç", url };
}

/** Buttons: Mini App (if configured) + site fallback. */
function productButtons(slug: string): InlineKeyboard {
  const rows: InlineButton[][] = [];
  const mini = miniAppButton(`urun-${slug}`);
  if (mini) rows.push([mini]);
  rows.push([{ text: "🛒 Siteden Satın Al", url: productUrl(slug) }]);
  return rows;
}

function siteButtons(startParam?: string): InlineKeyboard {
  const rows: InlineButton[][] = [];
  const mini = miniAppButton(startParam);
  if (mini) rows.push([mini]);
  rows.push([{ text: "🌐 Siteyi Aç", url: SITE_URL }]);
  return rows;
}

/* ============ Admin notifier messages (mevcut davranış) ============ */

export function orderCreatedMessage(o: {
  reference: string;
  productName: string;
  priceTry: number;
  userEmail?: string | null;
}): string {
  return [
    "🆕 <b>Yeni sipariş oluşturuldu</b>",
    `📦 Ürün: <b>${esc(o.productName)}</b>`,
    `💰 Tutar: ₺${esc(o.priceTry.toLocaleString("tr-TR"))}`,
    `🔖 Kod: <code>${esc(o.reference)}</code>`,
    o.userEmail ? `👤 Müşteri: ${esc(o.userEmail)}` : null,
    "⏳ Durum: <i>ödeme bekleniyor</i>",
    `🔗 ${SITE_URL}/admin/siparisler`,
  ].filter(Boolean).join("\n");
}

export function cartOrderCreatedMessage(o: {
  reference: string;
  itemsText: string;
  itemCount: number;
  totalTry: number;
  userEmail?: string | null;
  couponCode?: string | null;
}): string {
  return [
    "🛒 <b>Yeni sepet siparişi</b>",
    `🔖 Kod: <code>${esc(o.reference)}</code>`,
    `📦 Ürünler (${o.itemCount} adet):`,
    esc(o.itemsText),
    `💰 Toplam: <b>₺${esc(o.totalTry.toLocaleString("tr-TR"))}</b>`,
    o.couponCode ? `🎟 Kupon: <code>${esc(o.couponCode)}</code>` : null,
    o.userEmail ? `👤 Müşteri: ${esc(o.userEmail)}` : null,
    "⏳ Durum: <i>ödeme bekleniyor</i>",
    `🔗 ${SITE_URL}/admin/siparisler`,
  ].filter(Boolean).join("\n");
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
  ].filter(Boolean).join("\n");
}

export function outOfStockAlertMessage(o: {
  productName: string;
  userEmail?: string | null;
}): string {
  return [
    "⚠️ <b>STOK TÜKENDİ — alıcı bekliyor</b>",
    `📦 Ürün: <b>${esc(o.productName)}</b>`,
    o.userEmail ? `👤 Müşteri: ${esc(o.userEmail)}` : null,
    "🚨 Bu ürün için havuzda anahtar kalmadı. Lütfen en kısa sürede yeni key ekleyin.",
  ].filter(Boolean).join("\n");
}

export function lowStockAlertMessage(o: {
  productName: string;
  available: number;
  threshold: number;
}): string {
  const emoji = o.available === 0 ? "🚨" : "⚠️";
  const label = o.available === 0 ? "STOK TÜKENDİ" : "DÜŞÜK STOK UYARISI";
  return [
    `${emoji} <b>${label}</b>`,
    `📦 Ürün: <b>${esc(o.productName)}</b>`,
    `🔑 Kalan anahtar: <b>${o.available}</b> (eşik: ${o.threshold})`,
    o.available === 0
      ? "🛑 Havuzda anahtar kalmadı — yeni satışlar durabilir."
      : "🔔 Havuz azalıyor, yeni key eklemeyi unutmayın.",
  ].join("\n");
}

/* ============ Channel post builders ============ */

export function productAnnouncement(p: {
  name: string;
  slug: string;
  priceTry: number;
  description?: string | null;
  category?: string | null;
  imageUrl?: string | null;
}): Omit<SendPayload, "chatId"> {
  const lines = [
    "✨ <b>YENİ ÜRÜN</b> ✨",
    "",
    `📦 <b>${esc(p.name)}</b>`,
    p.category ? `🏷 ${esc(p.category)}` : null,
    `💰 <b>₺${esc(p.priceTry.toLocaleString("tr-TR"))}</b>`,
  ].filter(Boolean);
  if (p.description) {
    const short = p.description.length > 400 ? p.description.slice(0, 400) + "…" : p.description;
    lines.push("", esc(short));
  }
  lines.push("", "🔥 Havale/EFT ile anında teslim.");
  return {
    text: lines.join("\n"),
    photoUrl: p.imageUrl ?? null,
    buttons: productButtons(p.slug),
  };
}

export function promoAnnouncement(p: {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  productName?: string | null;
  productSlug?: string | null;
  minAmount?: number | null;
  expiresAt?: string | null;
  maxUses?: number | null;
}): Omit<SendPayload, "chatId"> {
  const disc = p.discountType === "percent" ? `%${p.discountValue}` : `₺${p.discountValue}`;
  const lines = [
    "🎁 <b>YENİ İNDİRİM KODU</b>",
    "",
    `🔖 Kod: <code>${esc(p.code)}</code>`,
    `💸 İndirim: <b>${esc(disc)}</b>`,
    p.productName ? `📦 Geçerli ürün: <b>${esc(p.productName)}</b>` : "📦 Tüm ürünlerde geçerli",
    p.minAmount && p.minAmount > 0 ? `🧾 Min. sepet: ₺${esc(p.minAmount)}` : null,
    p.maxUses ? `👥 Kullanım limiti: ${esc(p.maxUses)}` : null,
    p.expiresAt ? `⏰ Bitiş: ${esc(new Date(p.expiresAt).toLocaleString("tr-TR"))}` : null,
  ].filter(Boolean);
  return {
    text: lines.join("\n"),
    buttons: p.productSlug ? productButtons(p.productSlug) : siteButtons("indirim"),
  };
}

export function campaignPayload(c: {
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  productSlug?: string | null;
}): Omit<SendPayload, "chatId"> {
  const parts = [`📣 <b>${esc(c.title)}</b>`];
  if (c.body) parts.push("", esc(c.body));
  return {
    text: parts.join("\n"),
    photoUrl: c.imageUrl ?? null,
    buttons: c.productSlug ? productButtons(c.productSlug) : siteButtons("kampanya"),
  };
}
