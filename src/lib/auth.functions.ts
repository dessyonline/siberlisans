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

const oauthTokens = z.object({
  accessToken: z.string().min(20).max(10_000),
});

export type AuthUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  telegram_handle: string | null;
  roles: string[];
};

/** Aktif oturumdaki kullanıcı (yoksa null). */
export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<AuthUser | null> => {
  const { getUserByToken, SESSION_COOKIE } = await import("./auth.server");
  return getUserByToken(getCookie(SESSION_COOKIE));
});

export const signIn = createServerFn({ method: "POST" })
  .validator((d: unknown) => credentials.pick({ email: true, password: true }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> => {
    const auth = await import("./auth.server");
    const user = await auth.findUserByEmail(data.email);
    if (!user) return { ok: false, error: "E-posta veya şifre hatalı." };
    if (!user.password_hash) {
      return {
        ok: false,
        error: "Bu hesap için henüz şifre belirlenmemiş. 'Şifremi unuttum' ile yeni şifre oluşturun.",
      };
    }
    if (!(await auth.verifyPassword(data.password, user.password_hash))) {
      return { ok: false, error: "E-posta veya şifre hatalı." };
    }
    const { token, expires } = await auth.createSession(user.id, getRequestIP() ?? null);
    setCookie(auth.SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires,
    });
    const me = await auth.getUserByToken(token);
    return { ok: true, user: me! };
  });

export const signUp = createServerFn({ method: "POST" })
  .validator((d: unknown) => credentials.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> => {
    const auth = await import("./auth.server");
    const { mysqlQuery } = await import("./mysql.server");

    if (await auth.findUserByEmail(data.email)) {
      return { ok: false, error: "Bu e-posta ile kayıtlı bir hesap zaten var." };
    }

    const id = crypto.randomUUID();
    const hash = await auth.hashPassword(data.password);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    await mysqlQuery("INSERT INTO auth_users (id,email,password_hash,created_at) VALUES (?,?,?,?)", [
      id,
      data.email,
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
      `INSERT INTO profiles (id,email,display_name,created_at,updated_at,referral_code,referred_by,telegram_username)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        data.email,
        data.displayName ?? data.email.split("@")[0],
        now,
        now,
        refCode,
        referredBy,
        data.telegramUsername ?? null,
      ],
    );
    await mysqlQuery("INSERT IGNORE INTO user_roles (id,user_id,role) VALUES (?,?,?)", [
      crypto.randomUUID(),
      id,
      "user",
    ]);
    await mysqlQuery("INSERT IGNORE INTO wallets (id,user_id,balance_try,created_at,updated_at) VALUES (?,?,?,?,?)", [
      crypto.randomUUID(),
      id,
      0,
      now,
      now,
    ]);

    const { token, expires } = await auth.createSession(id, getRequestIP() ?? null);
    setCookie(auth.SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires,
    });
    const me = await auth.getUserByToken(token);
    return { ok: true, user: me! };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession, SESSION_COOKIE } = await import("./auth.server");
  const token = getCookie(SESSION_COOKIE);
  if (token) await destroySession(token);
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});

/** Doğrulanmış sosyal giriş kimliğini yerel MySQL hesabı ve oturumuna dönüştürür. */
export const completeOAuthSignIn = createServerFn({ method: "POST" })
  .validator((d: unknown) => oauthTokens.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> => {
    const authUrl = process.env['VITE_SUPABASE_URL'];
    const publishableKey = process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
    if (!authUrl || !publishableKey) {
      return { ok: false, error: "Google girişi şu anda kullanılamıyor." };
    }

    const response = await fetch(`${authUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${data.accessToken}`,
      },
    });
    if (!response.ok) return { ok: false, error: "Google kimliği doğrulanamadı." };

    const identity = (await response.json()) as {
      id?: unknown;
      email?: unknown;
      user_metadata?: { full_name?: unknown; name?: unknown };
    };
    const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : "";
    if (!email || !z.string().email().safeParse(email).success) {
      return { ok: false, error: "Google hesabında doğrulanmış e-posta bulunamadı." };
    }

    const auth = await import("./auth.server");
    const { mysqlQuery } = await import("./mysql.server");
    let localUser = await auth.findUserByEmail(email);
    if (!localUser) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const rawName = identity.user_metadata?.full_name ?? identity.user_metadata?.name;
      const displayName = typeof rawName === "string" && rawName.trim()
        ? rawName.trim().slice(0, 120)
        : email.split("@")[0];
      const referralCode = `SP${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      await mysqlQuery("INSERT INTO auth_users (id,email,password_hash,created_at) VALUES (?,?,NULL,?)", [
        id,
        email,
        now,
      ]);
      await mysqlQuery(
        `INSERT INTO profiles (id,email,display_name,created_at,updated_at,referral_code)
         VALUES (?,?,?,?,?,?)`,
        [id, email, displayName, now, now, referralCode],
      );
      await mysqlQuery("INSERT IGNORE INTO user_roles (id,user_id,role) VALUES (?,?,?)", [
        crypto.randomUUID(),
        id,
        "user",
      ]);
      await mysqlQuery("INSERT IGNORE INTO wallets (id,user_id,balance_try,created_at,updated_at) VALUES (?,?,?,?,?)", [
        crypto.randomUUID(),
        id,
        0,
        now,
        now,
      ]);
      localUser = await auth.findUserByEmail(email);
    }
    if (!localUser) return { ok: false, error: "Yerel hesap oluşturulamadı." };

    const { token, expires } = await auth.createSession(localUser.id, getRequestIP() ?? null);
    setCookie(auth.SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires,
    });
    const user = await auth.getUserByToken(token);
    if (!user) return { ok: false, error: "Oturum oluşturulamadı." };
    return { ok: true, user };
  });
