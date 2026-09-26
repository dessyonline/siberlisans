import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { mysqlQuery } from "../../../../lib/mysql.server";

export const APIRoute = createAPIFileRoute("/api/public/hooks/migrate")({
  GET: async ({ request }) => {
    try {
      await mysqlQuery("ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_price_try DECIMAL(12,2) DEFAULT NULL");
      await mysqlQuery("ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_label VARCHAR(255) DEFAULT NULL");
      
      await mysqlQuery("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warranty BOOLEAN NOT NULL DEFAULT FALSE");
      await mysqlQuery("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warranty_price_try DECIMAL(12,2) NOT NULL DEFAULT 0");
      await mysqlQuery("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warranty_label VARCHAR(255) DEFAULT NULL");
      
      return json({ success: true, message: "Migration completed." }, 200);
    } catch (err: any) {
      return json({ success: false, error: err.message }, 500);
    }
  },
});
