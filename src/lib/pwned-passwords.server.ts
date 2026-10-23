type PwnedPasswordCheck = {
  exposed: boolean;
  count: number;
};

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Şifrenin tamamını hiçbir servise göndermez; yalnızca SHA-1 prefix'i gider.
 * HIBP erişilemezse kayıt/şifre değişimi kesilmez, çünkü bu yardımcı kontroldür.
 */
export async function checkPwnedPassword(password: string): Promise<PwnedPasswordCheck> {
  const hash = toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password))).toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: {
      "Add-Padding": "true",
      "User-Agent": "SiberLisans-Security-Check/1.0",
    },
  });

  if (!response.ok) throw new Error(`Pwned Passwords HTTP ${response.status}`);
  const body = await response.text();
  for (const line of body.split("\n")) {
    const [returnedSuffix, rawCount] = line.trim().split(":");
    if (returnedSuffix?.toUpperCase() !== suffix) continue;
    const count = Number.parseInt(rawCount ?? "0", 10);
    return { exposed: Number.isFinite(count) && count > 0, count: Number.isFinite(count) ? count : 0 };
  }
  return { exposed: false, count: 0 };
}

export async function pwnedPasswordError(password: string): Promise<string | null> {
  try {
    const result = await checkPwnedPassword(password);
    if (result.exposed) {
      return `Bu şifre daha önce veri sızıntılarında en az ${result.count.toLocaleString("tr-TR")} kez görülmüş. Lütfen başka bir şifre seç.`;
    }
  } catch (error) {
    console.error("pwned password check unavailable", error instanceof Error ? error.message : String(error));
  }
  return null;
}
