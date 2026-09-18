// Kullanıcının bu tarayıcıyı "güvenilir cihaz" olarak işaretlemesini yönetir.
// Süre boyunca (varsayılan 30 gün) 2FA step-up modalları atlanır.
// Not: Bu sadece UX kolaylığı için istemci-tarafı bir hatırlama; sunucu tarafında
// gerçek doğrulama seviyesi MySQL tabanlı TOTP üzerinden yapılır. Bu yüzden
// güvenilir cihaz sadece "aynı tarayıcıda ek kod isteme" davranışını azaltır,
// server-side aal2 zorunlu olan yerlerde (admin paneli) bir etkisi yoktur.

const KEY_PREFIX = "mfa-trust:";
const DEVICE_ID_KEY = "mfa-device-id";
export const TRUSTED_DEVICE_TTL_DAYS = 30;
export const MAX_TRUSTED_DEVICES = 2;

/** Bu tarayıcıya özel kalıcı cihaz kimliği (sunucudaki güvenilir cihaz kaydı için). */
export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** İnsan tarafından okunabilir cihaz etiketi (ör. "Chrome · Windows"). */
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Bilinmeyen cihaz";
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Tarayıcı";
  const os =
    /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return os ? `${browser} · ${os}` : browser;
}

function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

export function isDeviceTrusted(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return false;
    const exp = Number(raw);
    if (!Number.isFinite(exp)) return false;
    if (exp < Date.now()) {
      window.localStorage.removeItem(key(userId));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function trustDevice(
  userId: string | null | undefined,
  days = TRUSTED_DEVICE_TTL_DAYS,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const exp = Date.now() + days * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(key(userId), String(exp));
  } catch {
    /* noop */
  }
}

/**
 * Cihazı hem yerelde hem sunucuda güvenilir olarak kaydeder.
 * Sunucuda kullanıcı başına en fazla 2 cihaz tutulur (en eskisi düşer).
 */
export async function trustDeviceRemote(
  userId: string | null | undefined,
  days = TRUSTED_DEVICE_TTL_DAYS,
): Promise<void> {
  trustDevice(userId, days);
  const deviceId = getDeviceId();
  if (!deviceId) return;
  try {
    const { trustCurrentDevice } = await import("@/lib/trusted-device.functions");
    await trustCurrentDevice({ data: { deviceId, label: getDeviceLabel(), days } });
  } catch {
    /* noop */
  }
}

export type TrustedDeviceRow = {
  id: string;
  device_id: string;
  label: string | null;
  last_ip: string | null;
  trusted_until: string | null;
  last_seen_at: string;
};

export async function listTrustedDevices(): Promise<TrustedDeviceRow[]> {
  try {
    const { listMyTrustedDevices } = await import("@/lib/trusted-device.functions");
    return await listMyTrustedDevices();
  } catch {
    return [];
  }
}

export async function removeTrustedDevice(id: string): Promise<void> {
  const { removeMyTrustedDevice } = await import("@/lib/trusted-device.functions");
  await removeMyTrustedDevice({ data: { id } });
}

export function untrustDevice(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    /* noop */
  }
}

export function trustedDeviceExpiry(userId: string | null | undefined): Date | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return null;
    const exp = Number(raw);
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    return new Date(exp);
  } catch {
    return null;
  }
}
