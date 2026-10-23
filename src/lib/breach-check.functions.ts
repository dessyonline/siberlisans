import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware.server";

export type EmailBreachResult =
  | { status: "found"; breaches: string[] }
  | { status: "clear"; breaches: [] }
  | { status: "unavailable"; breaches: []; message: string };

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** HIBP'nin e-posta k-anonim araması: ham e-posta adresi servise gönderilmez. */
export const checkMyEmailBreach = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<EmailBreachResult> => {
    const apiKey = process.env.HIBP_API_KEY?.trim();
    const email = context.user.email?.trim().toLowerCase();
    if (!apiKey || !email) {
      return { status: "unavailable", breaches: [], message: "E-posta ihlal kontrolü henüz yapılandırılmadı." };
    }

    try {
      const hash = toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(email))).toUpperCase();
      const prefix = hash.slice(0, 6);
      const suffix = hash.slice(6);
      const response = await fetch(`https://haveibeenpwned.com/api/v3/breachedaccount/range/${prefix}`, {
        headers: {
          "hibp-api-key": apiKey,
          "user-agent": "SiberLisans-Security-Check/1.0",
        },
      });

      if (response.status === 404) return { status: "clear", breaches: [] };
      if (!response.ok) {
        return { status: "unavailable", breaches: [], message: "İhlal servisine şu anda ulaşılamıyor." };
      }

      const rows = (await response.json()) as Array<{ hashSuffix?: string; websites?: string[] }>;
      const match = rows.find((row) => row.hashSuffix?.toUpperCase() === suffix);
      const breaches = Array.from(new Set(match?.websites?.filter((name): name is string => typeof name === "string") ?? []));
      return breaches.length ? { status: "found", breaches } : { status: "clear", breaches: [] };
    } catch (error) {
      console.error("email breach check unavailable", error instanceof Error ? error.message : String(error));
      return { status: "unavailable", breaches: [], message: "İhlal servisine şu anda ulaşılamıyor." };
    }
  });
