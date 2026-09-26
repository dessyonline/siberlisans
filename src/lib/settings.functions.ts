import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./auth-middleware.server";
import { mysqlOne, mysqlQuery } from "./mysql.server";
import { z } from "zod";

export type SiteSettings = {
  id: string;
  site_name: string | null;
  site_description: string | null;
  seo_keywords: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  maintenance_mode: boolean;
  whatsapp_number: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  contact_email: string | null;
  announcement_text: string | null;
  announcement_active: boolean;
  live_support_script: string | null;
  tos_content: string | null;
  privacy_policy_content: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string | null;
  updated_at: string;
};

const settingsSchema = z.object({
  site_name: z.string().nullable().optional(),
  site_description: z.string().nullable().optional(),
  seo_keywords: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  favicon_url: z.string().nullable().optional(),
  maintenance_mode: z.boolean().optional(),
  whatsapp_number: z.string().nullable().optional(),
  telegram_url: z.string().nullable().optional(),
  instagram_url: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  announcement_text: z.string().nullable().optional(),
  announcement_active: z.boolean().optional(),
  live_support_script: z.string().nullable().optional(),
  tos_content: z.string().nullable().optional(),
  privacy_policy_content: z.string().nullable().optional(),
  smtp_host: z.string().nullable().optional(),
  smtp_port: z.number().nullable().optional(),
  smtp_user: z.string().nullable().optional(),
  smtp_pass: z.string().nullable().optional(),
  smtp_from: z.string().nullable().optional(),
});

export const getSiteSettings = createServerFn({ method: "GET" })
  .handler(async (): Promise<SiteSettings> => {
    let settings = await mysqlOne<SiteSettings>(
      "SELECT * FROM site_settings WHERE id = 'global' LIMIT 1",
      []
    );
    if (!settings) {
      await mysqlQuery("INSERT IGNORE INTO site_settings (id, site_name, updated_at) VALUES ('global', 'SiberLisans', NOW())");
      settings = await mysqlOne<SiteSettings>("SELECT * FROM site_settings WHERE id = 'global' LIMIT 1", []) as SiteSettings;
    }
    
    return {
      ...settings,
      maintenance_mode: Boolean(settings.maintenance_mode),
      announcement_active: Boolean(settings.announcement_active),
    };
  });

export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    // If the field is not undefined, we update it to the value (even if null).
    // If it is undefined, we keep the existing value.
    const fields = [];
    const values = [];
    
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      await mysqlQuery(
        `UPDATE site_settings SET ${fields.join(", ")} WHERE id = 'global'`,
        values
      );
    }

    return { ok: true };
  });
