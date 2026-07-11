import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getPartnerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("partner_stats", { _user_id: userId });
    if (error) throw new Error(error.message);
    const row = data?.[0] ?? {
      clicks_total: 0,
      clicks_30d: 0,
      conversions: 0,
      conversion_rate: 0,
      earnings_30d: 0,
      daily: [],
    };
    return {
      clicksTotal: Number(row.clicks_total) || 0,
      clicks30d: Number(row.clicks_30d) || 0,
      conversions: Number(row.conversions) || 0,
      conversionRate: Number(row.conversion_rate) || 0,
      earnings30d: Number(row.earnings_30d) || 0,
      daily: (row.daily as Array<{ d: string; clicks: number; earn: number }>) ?? [],
    };
  });

export const updatePartnerSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_-]{3,24}$/, "3-24 karakter · sadece harf, rakam, - _"),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ partner_slug: data.slug })
      .eq("id", userId);
    if (error) {
      if (error.code === "23505") throw new Error("Bu kullanıcı adı alınmış");
      throw new Error(error.message);
    }
    return { slug: data.slug };
  });

export const recordReferralClick = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        code: z.string().min(3).max(48),
        source: z.string().max(120).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: id } = await sb.rpc("record_referral_click", {
      _code: data.code,
      _source: data.source ?? "",
      _ua_hash: "",
    });
    return { id: id ?? null };
  });

export const getPartnerLanding = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ code: z.string().min(3).max(48) }).parse(v))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows } = await sb.rpc("get_partner_by_code", { _code: data.code.trim() });
    const p = (rows as Array<{ display_name: string | null; referral_code: string }> | null)?.[0];
    if (!p) return { found: false as const };
    return {
      found: true as const,
      partnerName: p.display_name ?? "SiberPHP Partner",
      code: p.referral_code,
    };
  });
