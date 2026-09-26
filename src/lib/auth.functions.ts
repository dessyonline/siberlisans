import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  displayName: z.string().max(120).optional(),
  telegramUsername: z.string().max(120).optional(),
  referralCode: z.string().max(60).optional(),
});
const verificationCode = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) });

export type AuthUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  telegram_handle: string | null;
  roles: string[];
};

export type SessionResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" };

/** Geçici servis hatalarını yutmadan aktif oturumu sınıflandırır. */
export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<SessionResult> => {
  const { getUserByToken, SESSION_COOKIE } = await import("./auth.server");
  const user = await getUserByToken(getCookie(SESSION_COOKIE));
  return user ? { status: "authenticated", user } : { status: "unauthenticated" };
});

export const signIn = createServerFn({ method: "POST" })
  .validator((d: unknown) => credentials.pick({ email: true, password: true }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> => {
    try {
      const auth = await import("./auth.server");
      const user = await auth.findUserByEmail(data.email);
      if (!user) return { ok: false, error: "E-posta veya şifre hatalı." };
      if (!user.password_hash) {
        return {
          ok: false,
          error: "Bu hesap için henüz şifre belirlenmemiş. 'Şifremi unuttum' ile yeni şifre oluşturun.",
        };
      }
      if (!user.email_confirmed_at) {
        return { ok: false, error: "E-posta adresinizi doğrulamanız gerekiyor. Kodu yeniden göndermek için kayıt ekranını kullanın." };
      }
      if (!(await auth.verifyPassword(data.password, user.password_hash))) {
        return { ok: false, error: "E-posta veya şifre hatalı." };
      }
      const { token, expires } = await auth.createSession(user.id, getRequestIP() ?? null);

      const isProd = process.env.NODE_ENV === "production";
      setCookie(auth.SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
        expires,
      });
      const me: AuthUser = {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        telegram_handle: null,
        roles: user.roles_csv ? user.roles_csv.split(",").filter(Boolean) : [],
      };
      return { ok: true, user: me };
    } catch (error) {
      console.error("signIn failed", error instanceof Error ? error.message : String(error));
      return { ok: false, error: "Giriş servisine şu anda ulaşılamıyor. Lütfen tekrar deneyin." };
    }
  });

function mysqlDate(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function issueVerificationCode(userId: string, email: string) {
  const { mysqlQuery } = await import("./mysql.server");
  const { sendEmailVerificationCode } = await import("./gmail.server");
  const code = randomCode();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  await mysqlQuery("DELETE FROM auth_email_verifications WHERE user_id=?", [userId]);
  await mysqlQuery(
    "INSERT INTO auth_email_verifications (id,user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,0,?)",
    [crypto.randomUUID(), userId, codeHash, mysqlDate(new Date(Date.now() + 15 * 60 * 1000)), mysqlDate()],
  );
  const sent = await sendEmailVerificationCode(email, code);
  if (!sent) {
    await mysqlQuery("DELETE FROM auth_email_verifications WHERE user_id=?", [userId]);
    return false;
  }
  return true;
}

export const signUp = createServerFn({ method: "POST" })
  .validator((d: unknown) => credentials.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; verificationRequired: true } | { ok: false; error: string }> => {
    const auth = await import("./auth.server");
    const { mysqlQuery } = await import("./mysql.server");

    const email = data.email.trim().toLowerCase();
    const existing = await auth.findUserByEmail(email);
    if (existing) {
      if (existing.email_confirmed_at) return { ok: false, error: "Bu e-posta ile kayıtlı bir hesap zaten var." };
      const sent = await issueVerificationCode(existing.id, email);
      return sent
        ? { ok: true, verificationRequired: true }
        : { ok: false, error: "Doğrulama e-postası gönderilemedi. Gmail bağlantısını kontrol edin." };
    }

    const id = crypto.randomUUID();
    const hash = await auth.hashPassword(data.password);
    const now = mysqlDate();

    await mysqlQuery("INSERT INTO auth_users (id,email,password_hash,email_confirmed_at,created_at) VALUES (?,?,?,NULL,?)", [
      id,
      email,
      hash,
      now,
    ]);

    let referredBy: string | null = null;
    if (data.referralCode) {
      const ref = await mysqlQuery<{ id: string }>(
        "SELECT id FROM profiles WHERE referral_code=? LIMIT 1",
        [data.referralCode.trim()],
      );
      referredBy = ref[0]?.id ?? null;
    }

    const refCode = `SP${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    await mysqlQuery(
      `INSERT INTO profiles (id,email,display_name,created_at,updated_at,referral_code,referred_by)
       VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        email,
        data.displayName ?? email.split("@")[0],
        now,
        now,
        refCode,
        referredBy,
      ],
    );
    await mysqlQuery("INSERT IGNORE INTO user_roles (id,user_id,role) VALUES (?,?,?)", [
      crypto.randomUUID(),
      id,
      "user",
    ]);
    await mysqlQuery("INSERT IGNORE INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)", [
      id,
      0,
      now,
    ]);

    const sent = await issueVerificationCode(id, email);
    return sent
      ? { ok: true, verificationRequired: true }
      : { ok: false, error: "Doğrulama e-postası gönderilemedi. Gmail bağlantısını kontrol edin." };
  });

export const verifyEmailCode = createServerFn({ method: "POST" })
  .validator((d: unknown) => verificationCode.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { mysqlOne, mysqlQuery } = await import("./mysql.server");
    const email = data.email.trim().toLowerCase();
    const user = await mysqlOne<{ id: string; email_confirmed_at: string | null }>(
      "SELECT id,email_confirmed_at FROM auth_users WHERE LOWER(email)=? LIMIT 1", [email],
    );
    if (!user) return { ok: false, error: "Doğrulama isteği bulunamadı." };
    if (user.email_confirmed_at) return { ok: true };
    const record = await mysqlOne<{ code_hash: string; attempts: number }>(
      "SELECT code_hash,attempts FROM auth_email_verifications WHERE user_id=? AND expires_at>NOW() LIMIT 1", [user.id],
    );
    if (!record || Number(record.attempts) >= 5) return { ok: false, error: "Kod geçersiz veya süresi dolmuş. Yeni kod isteyin." };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.code));
    const actual = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    if (actual !== record.code_hash) {
      await mysqlQuery("UPDATE auth_email_verifications SET attempts=attempts+1 WHERE user_id=?", [user.id]);
      return { ok: false, error: "Doğrulama kodu hatalı." };
    }
    await mysqlQuery("UPDATE auth_users SET email_confirmed_at=? WHERE id=?", [mysqlDate(), user.id]);
    await mysqlQuery("DELETE FROM auth_email_verifications WHERE user_id=?", [user.id]);
    return { ok: true };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession, SESSION_COOKIE } = await import("./auth.server");
  const token = getCookie(SESSION_COOKIE);
  if (token) await destroySession(token);
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});
