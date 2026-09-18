import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/start-server-core";
import { requireAuth } from "@/lib/auth-middleware.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

function mysqlDate(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export type TouchSessionResult = {
  ipChanged: boolean;
  currentIp: string | null;
  previousIp: string | null;
  deviceKnown: boolean;
  deviceCount: number;
};

/**
 * Kullanıcının mevcut IP adresini profile'a kaydeder ve önceki IP ile karşılaştırır.
 * IP değiştiyse client tarafı 2FA step-up isteyebilir.
 */
export const touchSessionIp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { deviceId?: string | null } | undefined) => ({
    deviceId: data?.deviceId ?? null,
  }))
  .handler(async ({ context, data }): Promise<TouchSessionResult> => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const userId = context.userId;

    try {
      const profile = await mysqlOne<{ last_seen_ip: string | null }>(
        "SELECT last_seen_ip FROM profiles WHERE id=?",
        [userId],
      );
      const prevIp = profile?.last_seen_ip ?? null;

      const countRow = await mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM user_trusted_devices WHERE user_id=?",
        [userId],
      );
      const deviceCount = Number(countRow?.c ?? 0);

      let deviceKnown = false;
      if (data.deviceId) {
        const known = await mysqlOne<{ id: string }>(
          "SELECT id FROM user_trusted_devices WHERE user_id=? AND device_id=? AND (trusted_until IS NULL OR trusted_until > NOW())",
          [userId, data.deviceId],
        );
        deviceKnown = !!known;
        await mysqlQuery(
          "UPDATE user_trusted_devices SET last_seen_at=?, last_ip=COALESCE(?, last_ip) WHERE user_id=? AND device_id=?",
          [mysqlDate(new Date()), ip, userId, data.deviceId],
        );
      }

      await mysqlQuery(
        "UPDATE profiles SET last_seen_ip=COALESCE(?, last_seen_ip), last_seen_at=? WHERE id=?",
        [ip, mysqlDate(new Date()), userId],
      );

      const ipChanged = !!prevIp && !!ip && prevIp !== ip;

      return {
        ipChanged,
        currentIp: ip,
        previousIp: prevIp,
        deviceKnown,
        deviceCount,
      };
    } catch {
      return {
        ipChanged: false,
        currentIp: ip,
        previousIp: null,
        deviceKnown: true,
        deviceCount: 0,
      };
    }
  });
