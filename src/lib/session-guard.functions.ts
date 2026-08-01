import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/start-server-core";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Kullanıcının mevcut IP adresini profile'a kaydeder ve önceki IP ile karşılaştırır.
 * IP değiştiyse client tarafı 2FA step-up isteyebilir.
 */
export const touchSessionIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { deviceId?: string | null } | undefined) => ({
    deviceId: data?.deviceId ?? null,
  }))
  .handler(async ({ context, data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;

    const { data: res, error } = await context.supabase.rpc(
      "touch_session_device" as never,
      { _ip: ip, _device_id: data.deviceId } as never
    );
    if (error) {
      return {
        ipChanged: false,
        currentIp: ip,
        previousIp: null as string | null,
        deviceKnown: true,
        deviceCount: 0,
      };
    }
    const row = Array.isArray(res)
      ? (res[0] as {
          ip_changed: boolean;
          previous_ip: string | null;
          device_known: boolean;
          device_count: number;
        })
      : null;
    return {
      ipChanged: Boolean(row?.ip_changed),
      previousIp: row?.previous_ip ?? null,
      currentIp: ip,
      deviceKnown: Boolean(row?.device_known),
      deviceCount: Number(row?.device_count ?? 0),
    };
  });
