import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { mysqlOne, mysqlQuery } from "./mysql.server";

export const IP_BLOCKED_MESSAGE = "Bu IP adresi geçici olarak engellendi. Destek ile iletişime geçin.";
const MAX_ATTEMPTS = 7;
const BLOCK_DURATION_HOURS = 24;

/** Gerçek ziyaretçi IP'si (Cloudflare başlığı öncelikli). */
export function requestIp(): string | null {
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf) return cf.trim();
  return getRequestIP({ xForwardedFor: true }) ?? null;
}

export async function isIpBlocked(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  try {
    const row = await mysqlOne<{ ip: string }>(
      "SELECT ip FROM ip_blocks WHERE ip = ? AND blocked_until > NOW() LIMIT 1",
      [ip],
    );
    return !!row;
  } catch (e) {
    console.error("[ip-guard]", (e as Error).message);
    return false;
  }
}

export async function assertIpNotBlocked(ip: string | null) {
  if (await isIpBlocked(ip)) throw new Error(IP_BLOCKED_MESSAGE);
}

/** Başarısız giriş veya şüpheli işlem olduğunda IP'nin başarısız deneme sayısını artırır. */
export async function recordFailedAttempt(ip: string | null) {
  if (!ip) return;
  try {
    const row = await mysqlOne<{ attempts: number }>(
      "SELECT attempts FROM ip_rate_limits WHERE ip = ? LIMIT 1", [ip]
    );

    if (row) {
      const newAttempts = row.attempts + 1;
      await mysqlQuery("UPDATE ip_rate_limits SET attempts = ?, last_attempt_at = NOW() WHERE ip = ?", [newAttempts, ip]);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        // IP'yi kalıcı (veya 24 saatlik) bloğa al
        await mysqlQuery(
          "INSERT IGNORE INTO ip_blocks (ip, reason, blocked_until, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), NOW())",
          [ip, "Otomatik Sistem: Çok fazla hatalı deneme", BLOCK_DURATION_HOURS]
        );
        // Banlandığı için rate limit tablosunu temizle (bir dahaki sefere tekrar saysın)
        await mysqlQuery("DELETE FROM ip_rate_limits WHERE ip = ?", [ip]);
      }
    } else {
      await mysqlQuery("INSERT INTO ip_rate_limits (ip, attempts, last_attempt_at) VALUES (?, 1, NOW())", [ip]);
    }
  } catch (e) {
    console.error("[ip-guard] recordFailedAttempt error:", (e as Error).message);
  }
}

/** Başarılı giriş yapıldığında IP'nin başarısız denemelerini sıfırlar. */
export async function resetFailedAttempts(ip: string | null) {
  if (!ip) return;
  try {
    await mysqlQuery("DELETE FROM ip_rate_limits WHERE ip = ?", [ip]);
  } catch (e) {
    //
  }
}
