const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodedHeader(value: string) {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`;
}

export function createRawEmail(to: string, subject: string, text: string) {
  const message = [
    `To: ${to}`,
    `Subject: ${encodedHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");
  return base64(message).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!apiKey || !connectionKey) return false;

  const text = [
    "Siber Lisans hesabınız için şifre sıfırlama talebi aldık.",
    "",
    "Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı açın:",
    link,
    "",
    "Bu bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir.",
    "Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
  ].join("\n");

  const response = await fetch(`${GMAIL_GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: createRawEmail(to, "Siber Lisans şifre sıfırlama", text) }),
  });
  if (!response.ok) {
    console.error(`Password reset email failed [${response.status}]: ${await response.text()}`);
    return false;
  }
  return true;
}