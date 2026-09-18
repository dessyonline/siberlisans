/**
 * Web Push (RFC 8291 aes128gcm + VAPID) — WebCrypto-only, Worker-safe.
 * Zero deps. Server-only.
 */

const enc = new TextEncoder();

function b64uToBytes(s: string): Uint8Array {
  const pad = 4 - (s.length % 4 || 4);
  const norm = s.replace(/-/g, "+").replace(/_/g, "/") + (pad < 4 ? "=".repeat(pad) : "");
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(b: Uint8Array | ArrayBuffer): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as unknown as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as unknown as BufferSource, info: info as unknown as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Import a raw P-256 public key (65 bytes) for ECDH. */
async function importUaPublic(rawPub: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawPub as unknown as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

/** Import VAPID private (32-byte scalar) as JWK for ES256 signing. */
async function importVapidPrivate(d32: Uint8Array, pubRaw: Uint8Array): Promise<CryptoKey> {
  const x = pubRaw.slice(1, 33);
  const y = pubRaw.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: bytesToB64u(d32),
    x: bytesToB64u(x),
    y: bytesToB64u(y),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function signVapidJwt(endpoint: string): Promise<{ token: string; publicKey: string }> {
  const publicKey = process.env.VAPID_PUBLIC_KEY!;
  const privateKey = process.env.VAPID_PRIVATE_KEY!;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const h = bytesToB64u(enc.encode(JSON.stringify(header)));
  const p = bytesToB64u(enc.encode(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const key = await importVapidPrivate(b64uToBytes(privateKey), b64uToBytes(publicKey));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput) as unknown as BufferSource,
  );
  return { token: `${signingInput}.${bytesToB64u(sig)}`, publicKey };
}

/** Encrypt payload for a subscription using aes128gcm. */
async function encryptPayload(
  payload: Uint8Array,
  p256dh: Uint8Array,
  auth: Uint8Array,
): Promise<{ body: Uint8Array }> {
  // Ephemeral keypair
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const uaPublicKey = await importUaPublic(p256dh);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey },
    ephemeral.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(sharedBits);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // key_info = "WebPush: info\0" || ua_public || as_public
  const keyInfo = concat(enc.encode("WebPush: info\0"), p256dh, asPublicRaw);
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);

  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // Pad: append 0x02 (last record delimiter)
  const padded = concat(payload, new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey("raw", cek as unknown as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as unknown as BufferSource },
      aesKey,
      padded as unknown as BufferSource,
    ),
  );

  // Header: salt(16) || rs(4, big-endian, 4096) || idlen(1, 65) || keyid(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const idlen = new Uint8Array([65]);
  const body = concat(salt, rs, idlen, asPublicRaw, ciphertext);
  return { body };
}

export type WebPushSubscription = {
  endpoint: string;
  p256dh: string; // base64url
  auth: string; // base64url
};

export type WebPushPayload = {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  tag?: string;
};

export type WebPushResult = { ok: true } | { ok: false; status: number; expired: boolean; error?: string };

/** Send a Web Push notification. */
export async function sendWebPush(sub: WebPushSubscription, payload: WebPushPayload): Promise<WebPushResult> {
  try {
    const { token, publicKey } = await signVapidJwt(sub.endpoint);
    const { body } = await encryptPayload(
      enc.encode(JSON.stringify(payload)),
      b64uToBytes(sub.p256dh),
      b64uToBytes(sub.auth),
    );

    const resp = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
        Authorization: `vapid t=${token}, k=${publicKey}`,
      },
      body: body as unknown as BodyInit,
    });

    if (resp.ok || resp.status === 201 || resp.status === 202) return { ok: true };
    // 404/410: subscription expired — caller should delete it
    const expired = resp.status === 404 || resp.status === 410;
    const text = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, expired, error: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, expired: false, error: (e as Error).message };
  }
}

/** Send push to all subscriptions of a user; auto-clean expired. */
export async function sendPushToUser(userId: string, payload: WebPushPayload): Promise<{ sent: number; removed: number }> {
  const { mysqlQuery, mysqlOne, bool } = await import("./mysql.server");

  const prefs = await mysqlOne<{ web_push: unknown }>(
    "SELECT web_push FROM notification_preferences WHERE user_id=? LIMIT 1",
    [userId],
  );
  if (prefs && !bool(prefs.web_push)) return { sent: 0, removed: 0 };

  const subs = await mysqlQuery<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?",
    [userId],
  );
  if (subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendWebPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload,
      );
      if (r.ok) {
        sent++;
        await mysqlQuery("UPDATE push_subscriptions SET last_success_at=?, fail_count=0 WHERE id=?", [
          now(),
          s.id,
        ]);
      } else if (r.expired) {
        removed++;
        await mysqlQuery("DELETE FROM push_subscriptions WHERE id=?", [s.id]);
      } else {
        await mysqlQuery("UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=?", [s.id]);
      }
    }),
  );
  return { sent, removed };
}
