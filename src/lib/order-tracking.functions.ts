import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type PublicOrderTrack = {
  order_id: string;
  status: string;
  reference_code: string;
  price_try: number;
  created_at: string;
  approved_at: string | null;
  external_status: string | null;
  admin_note: string | null;
} | null;

export const trackOrderByRef = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ ref: z.string().trim().min(4).max(64) }).parse(d))
  .handler(async ({ data }): Promise<PublicOrderTrack> => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("supabase env eksik");
    const sb = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await sb.rpc("get_order_by_reference" as never, { _ref: data.ref } as never);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      order_id: string;
      status: string;
      reference_code: string;
      price_try: number;
      created_at: string;
      approved_at: string | null;
      external_status: string | null;
      admin_note: string | null;
    }>;
    return list[0] ?? null;
  });
