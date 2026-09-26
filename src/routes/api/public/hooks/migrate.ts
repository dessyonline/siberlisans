import { createFileRoute } from "@tanstack/react-router";

import { mysqlQuery } from "../../../../lib/mysql.server";

export const Route = createFileRoute("/api/public/hooks/migrate")({
  server: {
    handlers: {
      GET: async ({ request }) => {
    try {
      await mysqlQuery("ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_price_try DECIMAL(12,2) DEFAULT NULL");
      await mysqlQuery("ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_label VARCHAR(255) DEFAULT NULL");
      
      await mysqlQuery("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warranty BOOLEAN NOT NULL DEFAULT FALSE");
      await mysqlQuery("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warranty_price_try DECIMAL(12,2) NOT NULL DEFAULT 0");
      await mysqlQuery("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warranty_label VARCHAR(255) DEFAULT NULL");
      
      await mysqlQuery("ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL");
      
      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS site_settings (
          id VARCHAR(50) PRIMARY KEY,
          site_name VARCHAR(255) DEFAULT 'SiberLisans',
          site_description TEXT,
          maintenance_mode BOOLEAN DEFAULT FALSE,
          whatsapp_number VARCHAR(50),
          telegram_url VARCHAR(255),
          instagram_url VARCHAR(255),
          announcement_text TEXT,
          announcement_active BOOLEAN DEFAULT FALSE,
          updated_at DATETIME
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      await mysqlQuery(`
        INSERT IGNORE INTO site_settings (id, site_name, updated_at) 
        VALUES ('global', 'SiberLisans', NOW())
      `);

      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS ip_rate_limits (
          ip VARCHAR(50) PRIMARY KEY,
          attempts INT DEFAULT 1,
          last_attempt_at DATETIME
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      return new Response(JSON.stringify({ success: true, message: "Migration completed." }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  }
  }
});
