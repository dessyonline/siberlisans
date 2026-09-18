// Paylaşılan MySQL tabanlı lisans olay/nonce yardımcıları (license-api.server.ts'nin mysql eşleniği).
import { json } from "@/lib/license-api.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export async function guardReplayMysql(
  license_key: string,
  tsVal: unknown,
  nonce: unknown,
): Promise<Response | null> {
  const tsNum = Number(tsVal);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > REPLAY_WINDOW_MS) {
    return json({ ok: false, error: "Geçersiz istek." }, 400);
  }
  const n = (nonce ?? "").toString().trim();
  if (!n || n.length < 6 || n.length > 128) {
    return json({ ok: false, error: "Geçersiz istek." }, 400);
  }
  const dup = await mysqlOne<{ id: string }>("SELECT id FROM license_nonces WHERE nonce=?", [n]);
  if (dup) {
    return json({ ok: false, error: "Geçersiz istek." }, 409);
  }
  try {
    await mysqlQuery("INSERT INTO license_nonces (id,nonce,license_key,created_at) VALUES (?,?,?,?)", [
      uid(),
      n,
      license_key,
      ts(),
    ]);
  } catch (e) {
    console.error("[license-api] nonce insert failed", (e as Error).message);
  }
  return null;
}

export async function logEventMysql(entry: {
  license_key: string;
  event: "activate" | "validate" | "revoke" | "fail" | "admin_create" | "admin_revoke" | "unlock" | "tampering";
  hwid?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await mysqlQuery(
      "INSERT INTO license_events (id,license_key,event,hwid,ip,user_agent,detail,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), entry.license_key, entry.event, entry.hwid ?? null, entry.ip ?? null, entry.user_agent ?? null, entry.detail ?? null, ts()],
    );
  } catch (e) {
    console.error("[license-api] event log failed", (e as Error).message);
  }
}
