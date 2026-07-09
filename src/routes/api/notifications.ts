import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => json({ notifications: [] }),
      POST: async ({ request }) => {
        let payload: { license_key?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ notifications: [] });
        }
        const licenseKey = (payload?.license_key ?? "").toString().trim().toUpperCase();

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Resolve license -> user_id via order_keys -> orders
        let userId: string | null = null;
        if (licenseKey) {
          const { data: lk } = await supabase
            .from("license_keys")
            .select("id")
            .eq("key_value", licenseKey)
            .maybeSingle();
          if (lk?.id) {
            const { data: ok } = await supabase
              .from("order_keys")
              .select("order_id")
              .eq("license_key_id", lk.id)
              .limit(1)
              .maybeSingle();
            if (ok?.order_id) {
              const { data: ord } = await supabase
                .from("orders")
                .select("user_id")
                .eq("id", ok.order_id)
                .maybeSingle();
              userId = ord?.user_id ?? null;
            }
          }
        }

        // Global announcements: user_id IS NULL. Plus user's own if resolved.
        const filter = userId ? `user_id.is.null,user_id.eq.${userId}` : `user_id.is.null`;
        const { data: rows } = await supabase
          .from("notifications")
          .select("title,body,link,created_at")
          .or(filter)
          .order("created_at", { ascending: false })
          .limit(30);

        const notifications = (rows ?? []).map((r) => ({
          title: r.title,
          message: r.body,
          url: r.link ?? undefined,
          created_at: r.created_at,
        }));

        return json({ notifications });
      },
    },
  },
});
