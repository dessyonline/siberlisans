import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const publicClient = () =>
  createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

export const listBundles = createServerFn({ method: "GET" }).handler(async () => {
  const s = publicClient();
  const { data, error } = await s
    .from("product_bundles")
    .select(
      "id, slug, name, description, price_try, discount_percent, active, items:product_bundle_items(quantity, product:products(id, name, slug, price_try, image_url))",
    )
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getBundleBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const o = d as { slug?: string };
    if (!o?.slug) throw new Error("slug required");
    return { slug: String(o.slug) };
  })
  .handler(async ({ data }) => {
    const s = publicClient();
    const { data: row, error } = await s
      .from("product_bundles")
      .select(
        "id, slug, name, description, price_try, discount_percent, active, items:product_bundle_items(quantity, product:products(id, name, slug, price_try, image_url, short_description))",
      )
      .eq("slug", data.slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
