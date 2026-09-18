import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware.server";

const SHOPIER_API = "https://api.shopier.com/v1";

/**
 * Registers a Shopier webhook subscription pointing at our public receiver.
 * Returns the token — the caller MUST save it as SHOPIER_WEBHOOK_TOKEN.
 * Admin-only.
 */
export const registerShopierWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { url: string; event?: string }) => ({
    url: input.url,
    event: input.event ?? "order.created",
  }))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");

    const pat = process.env.SHOPIER_ACCESS_TOKEN;
    if (!pat) throw new Error("SHOPIER_ACCESS_TOKEN eksik");

    const res = await fetch(`${SHOPIER_API}/webhooks`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: data.event, url: data.url }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Shopier ${res.status}: ${body}`);
    return JSON.parse(body) as { id: string; event: string; url: string; token?: string };
  });

export const listShopierWebhooks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const pat = process.env.SHOPIER_ACCESS_TOKEN;
    if (!pat) throw new Error("SHOPIER_ACCESS_TOKEN eksik");
    const res = await fetch(`${SHOPIER_API}/webhooks`, {
      headers: { "Authorization": `Bearer ${pat}` },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Shopier ${res.status}: ${body}`);
    return JSON.parse(body) as Array<{ id: string; event: string; url: string; token?: string }>;
  });
