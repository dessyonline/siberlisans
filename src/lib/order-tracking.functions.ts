import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
    const { mysqlOne } = await import("./mysql.server");
    const row = await mysqlOne<NonNullable<PublicOrderTrack>>(
      `SELECT id AS order_id, status, reference_code, price_try, created_at,
              approved_at, external_status, NULL AS admin_note
         FROM orders WHERE reference_code = ? LIMIT 1`,
      [data.ref],
    );
    return row ? { ...row, price_try: Number(row.price_try) } : null;
  });
