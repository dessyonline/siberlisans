import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { mysqlOne } from "./mysql.server";

export const IP_BLOCKED_MESSAGE = "Bu IP adresi geçici olarak engellendi. Destek ile iletişime geçin.";

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
