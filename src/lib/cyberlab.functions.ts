import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware.server";
import { mysqlOne } from "./mysql.server";

export const APP_SLUG = "cyberlab";

export type CyberlabAccess = {
  active: boolean;
  lifetime: boolean;
  expiresAt: string | null;
  configured: boolean;
  launchUrl: string | null;
};

export const getCyberlabAccess = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<CyberlabAccess> => {
    const { cyberlabBaseUrl, createSsoToken } = await import("@/lib/cyberlab.server");

    const row = await mysqlOne<{ expires_at: string | null }>(
      "SELECT expires_at FROM app_access WHERE user_id=? AND app_slug=?",
      [context.userId, APP_SLUG],
    );

    const base = cyberlabBaseUrl();
    if (!row) {
      return { active: false, lifetime: false, expiresAt: null, configured: !!base, launchUrl: null };
    }

    const lifetime = !row.expires_at;
    const active = lifetime || new Date(row.expires_at as string).getTime() > Date.now();
    if (!active || !base) {
      return { active, lifetime, expiresAt: row.expires_at ?? null, configured: !!base, launchUrl: null };
    }

    const email = context.user?.email ?? "";
    const profile = await mysqlOne<{ display_name: string | null }>(
      "SELECT display_name FROM profiles WHERE id=?",
      [context.userId],
    );

    const token = await createSsoToken({
      sub: context.userId,
      email,
      name: profile?.display_name ?? email.split("@")[0] ?? "kullanici",
      plan: lifetime ? "lifetime" : "subscription",
      access_expires_at: row.expires_at ?? null,
    });

    return {
      active: true,
      lifetime,
      expiresAt: row.expires_at ?? null,
      configured: true,
      launchUrl: `/cyberlab/sso?token=${encodeURIComponent(token)}`,
    };
  });
