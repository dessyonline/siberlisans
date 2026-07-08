import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const contactInput = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  subject: z.string().min(2).max(120),
  message: z.string().min(10).max(2000),
  // honeypot
  website: z.string().max(0).optional(),
});

function esc(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

export const sendContactMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data }) => {
    if (data.website && data.website.length > 0) {
      // Bot — sessizce geç
      return { ok: true as const };
    }
    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const msg = [
        "📩 <b>Yeni iletişim mesajı</b>",
        `👤 <b>${esc(data.name)}</b> — ${esc(data.email)}`,
        `📌 Konu: <b>${esc(data.subject)}</b>`,
        "",
        esc(data.message).slice(0, 1800),
      ].join("\n");
      await notifyTelegram(msg);
    } catch (e) {
      console.error("[contact] telegram", (e as Error).message);
      // Kullanıcıya sızdırma — logladık, sessizce ok dön
    }
    return { ok: true as const };
  });
