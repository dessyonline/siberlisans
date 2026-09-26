import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./auth-middleware.server";
import { mysqlOne, mysqlQuery } from "./mysql.server";
import { z } from "zod";

export type SiteSettings = {
  id: string;
  site_name: string | null;
  site_description: string | null;
  maintenance_mode: boolean;
  whatsapp_number: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  announcement_text: string | null;
  announcement_active: boolean;
  updated_at: string;
};

const settingsSchema = z.object({
  site_name: z.string().nullable().optional(),
  site_description: z.string().nullable().optional(),
  maintenance_mode: z.boolean().optional(),
  whatsapp_number: z.string().nullable().optional(),
  telegram_url: z.string().nullable().optional(),
  instagram_url: z.string().nullable().optional(),
  announcement_text: z.string().nullable().optional(),
  announcement_active: z.boolean().optional(),
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
    
    await mysqlQuery(
      `UPDATE site_settings SET 
        site_name = COALESCE(?, site_name),
        site_description = COALESCE(?, site_description),
        maintenance_mode = COALESCE(?, maintenance_mode),
        whatsapp_number = COALESCE(?, whatsapp_number),
        telegram_url = COALESCE(?, telegram_url),
        instagram_url = COALESCE(?, instagram_url),
        announcement_text = COALESCE(?, announcement_text),
        announcement_active = COALESCE(?, announcement_active),
        updated_at = NOW()
       WHERE id = 'global'`,
      [
        data.site_name ?? null,
        data.site_description ?? null,
        data.maintenance_mode ?? null,
        data.whatsapp_number ?? null,
        data.telegram_url ?? null,
        data.instagram_url ?? null,
        data.announcement_text ?? null,
        data.announcement_active ?? null,
      ]
    );

    return { ok: true };
  });
