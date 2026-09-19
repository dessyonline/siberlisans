const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const SENDER_EMAIL = "siberlisans@gmail.com";
const SENDER_NAME = "Siber Lisans";

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodedHeader(value: string) {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createRawEmail(
  to: string,
  subject: string,
  text: string,
  from?: string,
  html?: string,
) {
  const sender = from ?? `${SENDER_NAME} <${SENDER_EMAIL}>`;
  const boundary = `sl_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const headers = [
    `From: ${sender}`,
    `To: ${to}`,
    `Reply-To: ${sender}`,
    `Date: ${new Date().toUTCString()}`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
  ];

  const message = html
    ? [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        text,
        "",
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        html,
        "",
        `--${boundary}--`,
        "",
      ].join("\r\n")
    : [
        ...headers,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        text,
      ].join("\r\n");

  return base64(message).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAIL_API_KEY_1"];
  if (!apiKey || !connectionKey) return false;

  const text = [
    "Merhaba,",
    "",
    "Siber Lisans hesabınız için şifre sıfırlama talebi aldık.",
    "Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı açın:",
    link,
    "",
    "Bu bağlantı 24 saat geçerlidir ve yalnızca bir kez kullanılabilir.",
    "Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
    "",
    "Siber Lisans — siberlisans.com",
  ].join("\n");

  const safeLink = escapeHtml(link);
  const html = [
    '<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">',
    '<h1 style="font-size:20px;margin:0 0 16px">Şifre sıfırlama</h1>',
    '<p style="font-size:14px;line-height:22px;margin:0 0 16px">Siber Lisans hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın.</p>',
    `<p style="margin:0 0 20px"><a href="${safeLink}" style="display:inline-block;background:#111;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px">Yeni şifre belirle</a></p>`,
    `<p style="font-size:12px;line-height:20px;color:#555;margin:0 0 12px;word-break:break-all">Buton çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>${safeLink}</p>`,
    '<p style="font-size:12px;line-height:20px;color:#555;margin:0">Bağlantı 24 saat geçerlidir ve yalnızca bir kez kullanılabilir. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>',
    "</div></body></html>",
  ].join("");

  const response = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: createRawEmail(
        to,
        "Siber Lisans şifre sıfırlama bağlantınız",
        text,
        `${SENDER_NAME} <${SENDER_EMAIL}>`,
        html,
      ),
    }),
  });
  if (!response.ok) {
    console.error(`Password reset email failed [${response.status}]: ${await response.text()}`);
    return false;
  }
  return true;
}
