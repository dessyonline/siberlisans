import { mysqlQuery } from "./src/lib/mysql.server.js"; // Note: this might need to run via vite-node or bun

async function main() {
  console.log("Adding warranty columns to products...");
  try {
    await mysqlQuery("ALTER TABLE products ADD COLUMN warranty_price_try DECIMAL(12,2) DEFAULT NULL");
    await mysqlQuery("ALTER TABLE products ADD COLUMN warranty_label VARCHAR(255) DEFAULT NULL");
    console.log("Successfully added to products");
  } catch(e) {
    console.error("Products error:", e.message);
  }
  
  console.log("Adding warranty columns to order_items...");
  try {
    await mysqlQuery("ALTER TABLE order_items ADD COLUMN warranty BOOLEAN NOT NULL DEFAULT FALSE");
    await mysqlQuery("ALTER TABLE order_items ADD COLUMN warranty_price_try DECIMAL(12,2) NOT NULL DEFAULT 0");
    await mysqlQuery("ALTER TABLE order_items ADD COLUMN warranty_label VARCHAR(255) DEFAULT NULL");
    console.log("Successfully added to order_items");
  } catch(e) {
    console.error("Order Items error:", e.message);
  }
}
main();
