/**
 * Kendi Apple OAuth istemcimizle (Lovable'dan bağımsız) sunucu tarafı giriş akışı.
 * Yalnızca sunucuda çalışır.
 *
 * Gerekli gizli değişkenler:
 * - APPLE_CLIENT_ID       → Services ID (örn: com.siberlisans.web)
 * - APPLE_TEAM_ID         → Apple Developer Team ID
 * - APPLE_KEY_ID          → Sign In with Apple anahtarının Key ID'si
 * - APPLE_PRIVATE_KEY     → .p8 dosyasının içeriği (-----BEGIN PRIVATE KEY----- ...)
 */
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { sessionCookieForIdentity, cookieHeader } from "./google-oauth.server";

export const APPLE_STATE_COOKIE = "siber_apoauth";
export const APPLE_CALLBACK_PATH = "/api/public/auth/apple/callback";

export function appleConfig() {
  const clientId = process.env["APPLE_CLIENT_ID"];
  const teamId = process.env["APPLE_TEAM_ID"];
  const keyId = process.env["APPLE_KEY_ID"];
  const privateKey = process.env["APPLE_PRIVATE_KEY"];
  if (!clientId || !teamId || !keyId || !privateKey) return null;
  return { clientId, teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newAppleState() {
  return randomHex(16);
}

export function buildAppleAuthUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Apple client_secret: ES256 ile imzalanmış kısa ömürlü JWT. */
async function appleClientSecret(cfg: NonNullable<ReturnType<typeof appleConfig>>) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(cfg.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: cfg.keyId, typ: "JWT" })
    .setIssuer(cfg.teamId)
    .setAudience("https://appleid.apple.com")
    .setSubject(cfg.clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

function pemToBytes(pem: string) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

type AppleIdentity = { email: string; name: string | null; verified: boolean };

/** Apple callback'ten gelen code'u doğrular, e-posta kimliğini döndürür. */
export async function exchangeAppleCodeForIdentity(
  code: string,
  redirectUri: string,
  userJson?: string | null,
): Promise<AppleIdentity | null> {
  const cfg = appleConfig();
  if (!cfg) return null;

  const clientSecret = await appleClientSecret(cfg);
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return null;

  const { payload } = await jwtVerify(tokens.id_token, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: cfg.clientId,
  });

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  // İsim yalnızca ilk girişte, ayrı "user" form alanında gelir.
  let name: string | null = null;
  if (userJson) {
    try {
      const u = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
      const full = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" ").trim();
      if (full) name = full.slice(0, 120);
    } catch {
      /* yoksay */
    }
  }

  const verified = payload.email_verified === true || payload.email_verified === "true";
  return { email, name, verified };
}

export { sessionCookieForIdentity, cookieHeader };
