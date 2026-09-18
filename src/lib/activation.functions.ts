// Public server function powering the /aktivasyon/$token page.
// Ports the `claim_license_by_token` Postgres RPC to MySQL.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export type ClaimedLicense = {
  key_value: string;
  activation_token: string | null;
  claimed_at: string | null;
  product_name: string;
  delivery_type: string;
};

const inputSchema = z.object({ token: z.string().min(1) });

export const claimLicenseByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<ClaimedLicense | null> => {
    const token = data.token.trim();
    if (token.length < 8) return null;

    const row = await mysqlOne<{
      id: string;
      key_value: string;
      activation_token: string | null;
      claimed_at: string | null;
      product_name: string;
      delivery_type: string;
    }>(
      `SELECT lk.id, lk.key_value, lk.activation_token, lk.claimed_at, p.name AS product_name, p.delivery_type
         FROM license_keys lk
         JOIN products p ON p.id = lk.product_id
        WHERE lk.activation_token = ?
        LIMIT 1`,
      [token],
    );
    if (!row) return null;

    let claimedAt = row.claimed_at;
    if (!claimedAt) {
      const now = ts();
      await mysqlQuery("UPDATE license_keys SET claimed_at=? WHERE id=? AND claimed_at IS NULL", [now, row.id]);
      const check = await mysqlOne<{ claimed_at: string | null }>(
        "SELECT claimed_at FROM license_keys WHERE id=?",
        [row.id],
      );
      claimedAt = check?.claimed_at ?? now;
    }

    return {
      key_value: row.key_value,
      activation_token: row.activation_token,
      claimed_at: claimedAt,
      product_name: row.product_name,
      delivery_type: row.delivery_type,
    };
  });
