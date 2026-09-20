/**
 * Kendi Google OAuth istemcimizle (Lovable'dan bağımsız) sunucu tarafı giriş akışı.
 * Yalnızca sunucuda çalışır.
 */
import { mysqlQuery } from "./mysql.server";
import { createSession, findUserByEmail, SESSION_COOKIE } from "./auth.server";

export const GOOGLE_STATE_COOKIE = "siber_goauth";
export const GOOGLE_CALLBACK_PATH = "/api/public/auth/google/callback";

export function googleConfig() {
  const clientId = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildAuthUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function newState() {
  return randomHex(16);
}

type GoogleIdentity = { email: string; name: string | null; verified: boolean };

export async function exchangeCodeForIdentity(
  code: string,
  redirectUri: string,
): Promise<GoogleIdentity | null> {
  const cfg = googleConfig();
  if (!cfg) return null;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return null;

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as {
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
  };
  const email = typeof info.email === "string" ? info.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return {
    email,
    name: typeof info.name === "string" && info.name.trim() ? info.name.trim().slice(0, 120) : null,
    verified: info.email_verified === true || info.email_verified === "true",
  };
}

/** Google kimliğini yerel MySQL hesabına bağlar ve oturum çerezi değeri döndürür. */
export async function sessionCookieForIdentity(
  identity: GoogleIdentity,
  ip: string | null,
): Promise<{ token: string; expires: Date }> {
  let user = await findUserByEmail(identity.email);
  if (!user) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const displayName = identity.name ?? identity.email.split("@")[0];
    const referralCode = `SP${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    await mysqlQuery("INSERT INTO auth_users (id,email,password_hash,created_at) VALUES (?,?,NULL,?)", [
      id,
      identity.email,
      now,
    ]);
    await mysqlQuery(
      `INSERT INTO profiles (id,email,display_name,created_at,updated_at,referral_code)
       VALUES (?,?,?,?,?,?)`,
      [id, identity.email, displayName, now, now, referralCode],
    );
    await mysqlQuery("INSERT IGNORE INTO user_roles (id,user_id,role) VALUES (?,?,?)", [
      crypto.randomUUID(),
      id,
      "user",
    ]);
    await mysqlQuery(
      "INSERT IGNORE INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)",
      [id, 0, now],
    );
    user = await findUserByEmail(identity.email);
  }
  if (!user) throw new Error("Yerel hesap oluşturulamadı");
  return createSession(user.id, ip);
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export { SESSION_COOKIE };
