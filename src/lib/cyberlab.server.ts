// CyberLab (harici Flask uygulaması) tek-tık giriş (SSO) yardımcıları — sunucu-only.
// Token durumsuzdur: HMAC-SHA256 ile imzalanır, CyberLab tarafı /api/public/cyberlab/verify
// uç noktasına gönderip doğrular. Böylece iki taraf arasında paylaşılan gizli anahtar gerekmez.

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function secret() {
  return (
    process.env["CYBERLAB_SSO_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    "siberlisans-cyberlab"
  );
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export type SsoClaims = {
  sub: string;
  email: string;
  name: string;
  plan: "lifetime" | "subscription";
  exp: number; // token son kullanma (saniye)
  access_expires_at: string | null;
};

/** Kısa ömürlü (5 dk) SSO tokenı üretir. */
export async function createSsoToken(claims: Omit<SsoClaims, "exp">) {
  const full: SsoClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + 300 };
  const body = b64url(enc.encode(JSON.stringify(full)));
  return `${body}.${await sign(body)}`;
}

/** Tokenı doğrular; geçersizse null döner. */
export async function verifySsoToken(token: string): Promise<SsoClaims | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await sign(body);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SsoClaims;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** CyberLab uygulamasının barındığı adres. */
export function cyberlabBaseUrl() {
  const envUrl = (process.env["CYBERLAB_BASE_URL"] ?? "").replace(/\/+$/, "");
  if (envUrl) return envUrl;
  
  // Yerel barındırma için SSO yönlendirme adresi
  return "/cyberlab";
}
