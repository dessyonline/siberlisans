import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const APP_SLUG = "cyberlab";

export type CyberlabAccess = {
  active: boolean;
  lifetime: boolean;
  expiresAt: string | null;
  configured: boolean;
  launchUrl: string | null;
};

/** Kullanıcının CyberLab erişim durumunu döner ve varsa tek-tık giriş linki üretir. */
export const getCyberlabAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CyberlabAccess> => {
    const { supabase, userId, claims } = context;
    const { cyberlabBaseUrl, createSsoToken } = await import("@/lib/cyberlab.server");

    const { data } = await supabase
      .from("app_access")
      .select("expires_at")
      .eq("user_id", userId)
      .eq("app_slug", APP_SLUG)
      .maybeSingle();

    const base = cyberlabBaseUrl();
    if (!data) {
      return { active: false, lifetime: false, expiresAt: null, configured: !!base, launchUrl: null };
    }

    const lifetime = !data.expires_at;
    const active = lifetime || new Date(data.expires_at as string).getTime() > Date.now();
    if (!active || !base) {
      return {
        active,
        lifetime,
        expiresAt: (data.expires_at as string | null) ?? null,
        configured: !!base,
        launchUrl: null,
      };
    }

    const email = (claims as { email?: string } | null)?.email ?? "";
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    const token = await createSsoToken({
      sub: userId,
      email,
      name: (profile?.display_name as string | null) ?? email.split("@")[0] ?? "kullanici",
      plan: lifetime ? "lifetime" : "subscription",
      access_expires_at: (data.expires_at as string | null) ?? null,
    });

    return {
      active: true,
      lifetime,
      expiresAt: (data.expires_at as string | null) ?? null,
      configured: true,
      launchUrl: `/cyberlab/sso?token=${encodeURIComponent(token)}`,
    };
  });
