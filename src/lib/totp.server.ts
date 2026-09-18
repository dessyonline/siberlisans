// RFC 6238 TOTP (HMAC-SHA1) — MySQL tabanlı 2FA için sunucu yardımcıları.
// Supabase MFA'nın doğrudan bir karşılığı yok; bu modül kendi TOTP uygulamamızdır.
import { mysqlQuery, mysqlOne } from "./mysql.server";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function randomBase32Secret(bytes = 20): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let bits = "";
  for (const b of arr) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32ToBytes(b32: string): Uint8Array {
  const clean = b32.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

async function hmacSha1(keyBytes: Uint8Array, msgBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, toArrayBuffer(msgBytes));
  return new Uint8Array(sig);
}

function intToBytes(num: number): Uint8Array {
  const buf = new Uint8Array(8);
  let n = num;
  for (let i = 7; i >= 0; i--) {
    buf[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return buf;
}

async function totpAt(secretBase32: string, counter: number, digits = 6): Promise<string> {
  const key = base32ToBytes(secretBase32);
  const msg = intToBytes(counter);
  const hmac = await hmacSha1(key, msg);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = String(binCode % 10 ** digits).padStart(digits, "0");
  return str;
}

/** Kod doğrular; saat kaymasını tolere etmek için ±1 zaman adımı (30s) kabul eder. */
export async function verifyTotpCode(
  secretBase32: string,
  code: string,
  window = 1,
  stepSeconds = 30,
): Promise<boolean> {
  const cleaned = (code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let w = -window; w <= window; w++) {
    const expected = await totpAt(secretBase32, counter + w);
    if (expected === cleaned) return true;
  }
  return false;
}

export function buildOtpAuthUri(secretBase32: string, email: string, issuer = "SiberPHP"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

let tablesReady = false;
export async function ensureMfaTables(): Promise<void> {
  if (tablesReady) return;
  await mysqlQuery(`CREATE TABLE IF NOT EXISTS user_mfa_totp (
    user_id CHAR(36) PRIMARY KEY,
    secret VARCHAR(64) NOT NULL,
    verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    verified_at DATETIME NULL
  )`);
  try {
    await mysqlQuery(`ALTER TABLE auth_sessions ADD COLUMN mfa_verified_at DATETIME NULL`);
  } catch {
    // sütun zaten varsa hata yutulur
  }
  tablesReady = true;
}

export type MfaRow = { user_id: string; secret: string; verified: number; created_at: string; verified_at: string | null };

export async function getMfaRow(userId: string): Promise<MfaRow | null> {
  await ensureMfaTables();
  return mysqlOne<MfaRow>("SELECT * FROM user_mfa_totp WHERE user_id=?", [userId]);
}
