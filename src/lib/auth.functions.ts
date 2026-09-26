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
      const ipGuard = await import("./ip-guard.server");
      if (await ipGuard.isIpBlocked(ipGuard.requestIp())) return { ok: false, error: ipGuard.IP_BLOCKED_MESSAGE };
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
      `INSERT INTO profiles (id,email,display_name,created_at,updated_at,referral_code,referred_by)
       VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        data.email,
        data.displayName ?? data.email.split("@")[0],
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

    const { token, expires } = await auth.createSession(id, getRequestIP() ?? null);
    setCookie(auth.SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires,
    });
    const me = await auth.getUserByToken(token);
    if (!me) {
      await auth.destroySession(token);
      return { ok: false, error: "Oturum oluşturulamadı. Lütfen tekrar deneyin." };
    }
    return { ok: true, user: me };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { destroySession, SESSION_COOKIE } = await import("./auth.server");
  const token = getCookie(SESSION_COOKIE);
  if (token) await destroySession(token);
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { ok: true };
});
