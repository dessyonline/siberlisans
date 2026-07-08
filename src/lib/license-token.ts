import { createHmac } from "crypto";

/**
 * TTL for issued license tokens (30 minutes).
 */
export const LICENSE_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Sign an HMAC-SHA256 token binding hwid + license_key + expires timestamp.
 * Returns the base64url-encoded signature (short string).
 */
export function signLicenseToken(hwid: string, licenseKey: string, expiresMs: number): string {
  const secret = process.env.LICENSE_TOKEN_SECRET;
  if (!secret) {
    throw new Error("LICENSE_TOKEN_SECRET is not configured.");
  }
  const payload = `${hwid}|${licenseKey}|${expiresMs}`;
  const digest = createHmac("sha256", secret).update(payload).digest("base64");
  // base64url (URL-safe, no padding) — short, safe for headers/JSON
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Issue a { token, token_expires } pair for the given license/hwid.
 */
export function issueLicenseToken(hwid: string, licenseKey: string) {
  const token_expires = Date.now() + LICENSE_TOKEN_TTL_MS;
  const token = signLicenseToken(hwid, licenseKey, token_expires);
  return { token, token_expires };
}
