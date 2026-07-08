import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/start-server-core";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Kullanıcının mevcut IP adresini profile'a kaydeder ve önceki IP ile karşılaştırır.
 * IP değiştiyse client tarafı 2FA step-up isteyebilir.
 */
export const touchSessionIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;

    const { data, error } = await context.supabase.rpc(
      "touch_session_ip" as never,
      { _ip: ip } as never
    );
    if (error) {
      return { ipChanged: false, currentIp: ip, previousIp: null as string | null };
    }
    const row = Array.isArray(data)
      ? (data[0] as { ip_changed: boolean; previous_ip: string | null })
      : null;
    return {
      ipChanged: Boolean(row?.ip_changed),
      previousIp: row?.previous_ip ?? null,
      currentIp: ip,
    };
  });
