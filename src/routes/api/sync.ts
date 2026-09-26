import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery } from "@/lib/mysql.server";

export const Route = createFileRoute("/api/sync")({
  server: {
    handlers: {
      GET: async () => {
    let log = "Sync started...\n";
    try {
      log += "Creating site_settings...\n";
      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS site_settings (
          id VARCHAR(255) PRIMARY KEY,
          settings_json JSON NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_by VARCHAR(255) NULL
        )
      `);
      log += "site_settings created.\n";

      log += "Adding duration_days to license_keys...\n";
      await mysqlQuery(`ALTER TABLE license_keys ADD COLUMN duration_days INT NULL`).catch(e => log += e.message + "\n");
      log += "Adding duration_minutes to license_keys...\n";
      await mysqlQuery(`ALTER TABLE license_keys ADD COLUMN duration_minutes INT NULL`).catch(e => log += e.message + "\n");
      log += "Adding last_validated_at to license_keys...\n";
      await mysqlQuery(`ALTER TABLE license_keys ADD COLUMN last_validated_at TIMESTAMP NULL`).catch(e => log += e.message + "\n");
      log += "Adding duration_label to products...\n";
      await mysqlQuery(`ALTER TABLE products ADD COLUMN duration_label VARCHAR(255) NULL`).catch(e => log += e.message + "\n");
      log += "Adding min_volume_try to dealer_tiers...\n";
      await mysqlQuery(`ALTER TABLE dealer_tiers ADD COLUMN min_volume_try DECIMAL(10,2) DEFAULT 0 NOT NULL`).catch(e => log += e.message + "\n");
      log += "Adding commission_percent to dealer_tiers...\n";
      await mysqlQuery(`ALTER TABLE dealer_tiers ADD COLUMN commission_percent DECIMAL(5,2) DEFAULT 0 NOT NULL`).catch(e => log += e.message + "\n");
      log += "Adding discount_percent to dealer_tiers...\n";
      await mysqlQuery(`ALTER TABLE dealer_tiers ADD COLUMN discount_percent DECIMAL(5,2) DEFAULT 0 NOT NULL`).catch(e => log += e.message + "\n");

      log += "Creating cyberlab tables...\n";
      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS cyberlab_user_progress (
          user_id VARCHAR(255) NOT NULL,
          lesson_key VARCHAR(255) NOT NULL,
          xp INT DEFAULT 0 NOT NULL,
          completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, lesson_key)
        )
      `).catch(e => log += e.message + "\n");

      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS cyberlab_quiz_attempts (
          user_id VARCHAR(255) NOT NULL,
          lesson_key VARCHAR(255) NOT NULL,
          attempts INT DEFAULT 1 NOT NULL,
          best_score INT DEFAULT 0 NOT NULL,
          passed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, lesson_key)
        )
      `).catch(e => log += e.message + "\n");

      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS cyberlab_user_flags (
          user_id VARCHAR(255) NOT NULL,
          lesson_key VARCHAR(255) NOT NULL,
          captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, lesson_key)
        )
      `).catch(e => log += e.message + "\n");

      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS cyberlab_user_badges (
          user_id VARCHAR(255) NOT NULL,
          badge_id VARCHAR(64) NOT NULL,
          earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, badge_id)
        )
      `).catch(e => log += e.message + "\n");

      log += "Sync complete!";
    } catch (err: any) {
      log += "Error: " + err.message;
    }
    return new Response(log, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
      },
    },
  },
});
