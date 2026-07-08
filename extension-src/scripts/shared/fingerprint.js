/* XSiberPHPX — Fingerprint (HWID) */
(function () {
  "use strict";
  const KEY = "sp_hwid";

  function generate() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback UUIDv4
    const bytes = new Uint8Array(16);
    (crypto || window.msCrypto).getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function get() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (r) => {
          let hwid = r && r[KEY];
          if (!hwid) {
            hwid = generate();
            chrome.storage.local.set({ [KEY]: hwid }, () => resolve(hwid));
          } else {
            resolve(hwid);
          }
        });
      } catch (_) {
        // Fallback when chrome.storage is unavailable (e.g. testing in normal page)
        let hwid = localStorage.getItem(KEY);
        if (!hwid) {
          hwid = generate();
          localStorage.setItem(KEY, hwid);
        }
        resolve(hwid);
      }
    });
  }

  function shortHwid(hwid) {
    if (!hwid) return "—";
    if (hwid.length <= 14) return hwid;
    return `${hwid.slice(0, 8)}…${hwid.slice(-4)}`;
  }

  window.SPFingerprint = { get, shortHwid };
})();
