// Kullanıcının bu tarayıcıyı "güvenilir cihaz" olarak işaretlemesini yönetir.
// Süre boyunca (varsayılan 30 gün) 2FA step-up modalları atlanır.
// Not: Bu sadece UX kolaylığı için istemci-tarafı bir hatırlama; sunucu tarafında
// gerçek AAL kontrolü hâlâ Supabase MFA üzerinden yapılır. Bu yüzden
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
