import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCookie } from "@tanstack/react-start/server";
import { requireAuth } from "@/lib/auth-middleware.server";
import { mysqlQuery } from "@/lib/mysql.server";

function mysqlDate(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export type MfaStatus = {
  enrolled: boolean;
  createdAt: string | null;
  aal: "aal1" | "aal2";
};

/** Mevcut kullanıcının 2FA durumu ve bu oturumun doğrulanma seviyesi (aal1/aal2). */
export const getMfaStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MfaStatus> => {
    const { getMfaRow, ensureMfaTables } = await import("@/lib/totp.server");
    const { SESSION_COOKIE } = await import("@/lib/auth.server");
    await ensureMfaTables();
    const row = await getMfaRow(context.userId);
    const enrolled = !!row && row.verified === 1;

    let aal: "aal1" | "aal2" = "aal1";
    const token = getCookie(SESSION_COOKIE);
    if (enrolled && token) {
      const sess = await mysqlQuery<{ mfa_verified_at: string | null }>(
        "SELECT mfa_verified_at FROM auth_sessions WHERE token=? AND user_id=?",
        [token, context.userId],
      );
      if (sess[0]?.mfa_verified_at) aal = "aal2";
    } else if (!enrolled) {
      aal = "aal1";
    }
    return {
      enrolled,
      createdAt: row?.verified_at ?? row?.created_at ?? null,
      aal,
    };
  });

/** Enroll adım 1: yeni bir TOTP secret üretir (henüz doğrulanmamış). */
export const mfaEnrollStart = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ secret: string; uri: string; qrSvg: string }> => {
    const { ensureMfaTables, randomBase32Secret, buildOtpAuthUri } = await import("@/lib/totp.server");
    const QRCode = (await import("qrcode")).default;
    await ensureMfaTables();

    const secret = randomBase32Secret();
    const email = context.user.email ?? context.userId;
    const uri = buildOtpAuthUri(secret, email);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 220 });

    await mysqlQuery(
      `INSERT INTO user_mfa_totp (user_id, secret, verified, created_at)
       VALUES (?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE secret=VALUES(secret), verified=0, created_at=VALUES(created_at), verified_at=NULL`,
      [context.userId, secret, mysqlDate(new Date())],
    );

    return { secret, uri, qrSvg };
  });

const codeInput = z.object({ code: z.string().min(6).max(6) });

/** Enroll adım 2: kullanıcının girdiği kodu doğrular, factor'ü aktifleştirir. */
export const mfaEnrollVerify = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => codeInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getMfaRow, verifyTotpCode } = await import("@/lib/totp.server");
    const { SESSION_COOKIE } = await import("@/lib/auth.server");
    const row = await getMfaRow(context.userId);
    if (!row) throw new Error("Önce 2FA kurulumunu başlat.");
    const ok = await verifyTotpCode(row.secret, data.code);
    if (!ok) throw new Error("Kod hatalı veya süresi dolmuş.");

    const now = mysqlDate(new Date());
    await mysqlQuery("UPDATE user_mfa_totp SET verified=1, verified_at=? WHERE user_id=?", [now, context.userId]);

    const token = getCookie(SESSION_COOKIE);
    if (token) {
      await mysqlQuery("UPDATE auth_sessions SET mfa_verified_at=? WHERE token=?", [now, token]);
    }
    return { ok: true };
  });

/** Step-up doğrulama / kaldırma öncesi kod doğrulaması. Başarılıysa bu oturumu aal2 yapar. */
export const mfaVerifyCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => codeInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getMfaRow, verifyTotpCode } = await import("@/lib/totp.server");
    const { SESSION_COOKIE } = await import("@/lib/auth.server");
    const row = await getMfaRow(context.userId);
    if (!row || row.verified !== 1) throw new Error("Doğrulanmış bir 2FA bulunamadı.");
    const ok = await verifyTotpCode(row.secret, data.code);
    if (!ok) throw new Error("Kod hatalı veya süresi dolmuş.");

    const token = getCookie(SESSION_COOKIE);
    if (token) {
      await mysqlQuery("UPDATE auth_sessions SET mfa_verified_at=? WHERE token=?", [mysqlDate(new Date()), token]);
    }
    return { ok: true };
  });

/** 2FA'yı kaldırır (önce güncel kod ile doğrulanmış olmalı). */
export const mfaDisable = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => codeInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getMfaRow, verifyTotpCode } = await import("@/lib/totp.server");
    const row = await getMfaRow(context.userId);
    if (!row || row.verified !== 1) throw new Error("Doğrulanmış bir 2FA bulunamadı.");
    const ok = await verifyTotpCode(row.secret, data.code);
    if (!ok) throw new Error("Kod hatalı veya süresi dolmuş.");

    await mysqlQuery("DELETE FROM user_mfa_totp WHERE user_id=?", [context.userId]);
    await mysqlQuery("UPDATE auth_sessions SET mfa_verified_at=NULL WHERE user_id=?", [context.userId]);
    return { ok: true };
  });

/** Bu oturum dışındaki tüm oturumları sonlandırır. */
export const signOutOtherSessions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { SESSION_COOKIE } = await import("@/lib/auth.server");
    const token = getCookie(SESSION_COOKIE);
    if (token) {
      await mysqlQuery("DELETE FROM auth_sessions WHERE user_id=? AND token<>?", [context.userId, token]);
    } else {
      await mysqlQuery("DELETE FROM auth_sessions WHERE user_id=?", [context.userId]);
    }
    return { ok: true };
  });
