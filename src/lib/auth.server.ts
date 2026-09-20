import { mysqlQuery, mysqlOne } from "./mysql.server";
import bcrypt from "bcryptjs";

const ITER = 100_000;

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2(password: string, saltHex: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltParts = saltHex.match(/.{2}/g);
  if (!saltParts) return "";
  const salt = Uint8Array.from(saltParts.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string) {
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${ITER}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  // Eski sistemden taşınan bcrypt ($2a/$2b/$2y) hash'leri
  if (/^\$2[aby]?\$/.test(stored)) {
    return bcrypt.compare(password, stored.replace(/^\$2y\$/, "$2a$"));
  }
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const calc = await pbkdf2(password, parts[2]);
  // constant-time-ish compare
  if (calc.length !== parts[3].length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0;
}

/** Giriş başarılıysa eski hash'i güncel formata yükseltir. */
export async function upgradePasswordHash(userId: string, password: string, stored: string | null) {
  if (!stored || !/^\$2[aby]?\$/.test(stored)) return;
  const fresh = await hashPassword(password);
  await mysqlQuery("UPDATE auth_users SET password_hash=? WHERE id=?", [fresh, userId]);
}


export const SESSION_COOKIE = "siber_session";
const SESSION_DAYS = 30;

function mysqlDate(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function createSession(userId: string, ip?: string | null) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await mysqlQuery(
    "INSERT INTO auth_sessions (token,user_id,created_at,expires_at,ip) VALUES (?,?,?,?,?)",
    [token, userId, mysqlDate(new Date()), mysqlDate(expires), ip ?? null],
  );
  return { token, expires };
}

export async function destroySession(token: string) {
  await mysqlQuery("DELETE FROM auth_sessions WHERE token=?", [token]);
}

export type SessionUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  telegram_handle: string | null;
  roles: string[];
};

export async function getUserByToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await mysqlOne<{ id: string; email: string | null; display_name: string | null; telegram_handle: string | null }>(
    `SELECT u.id, u.email, p.display_name, NULL AS telegram_handle
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token = ? AND s.expires_at > NOW()`,
    [token],
  );
  if (!row) return null;
  const roles = await mysqlQuery<{ role: string }>("SELECT role FROM user_roles WHERE user_id=?", [row.id]);
  return { ...row, roles: roles.map((r) => r.role) };
}

export async function findUserByEmail(email: string) {
  return mysqlOne<{
    id: string;
    email: string;
    password_hash: string | null;
    display_name: string | null;
    roles_csv: string | null;
  }>(
    `SELECT u.id, u.email, u.password_hash, p.display_name,
            (SELECT GROUP_CONCAT(ur.role) FROM user_roles ur WHERE ur.user_id = u.id) AS roles_csv
       FROM auth_users u
       LEFT JOIN profiles p ON p.id = u.id
      WHERE LOWER(u.email)=LOWER(?) LIMIT 1`,
    [email],
  );
}
