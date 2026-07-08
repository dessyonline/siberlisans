/* SiberPHP — License API + storage */
(function () {
  "use strict";
  const API = "https://siberlisans.lovable.app";
  const KEYS = {
    license: "sp_license_key",
    activatedAt: "sp_activated_at",
    expiresAt: "sp_expires_at",
    lastCheck: "sp_last_check",
    token: "sp_token",
    tokenExp: "sp_token_expires",
  };

  function getStored() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(Object.values(KEYS), (r) => resolve(r || {}));
      } catch (_) {
        const out = {};
        Object.values(KEYS).forEach((k) => (out[k] = localStorage.getItem(k) || null));
        resolve(out);
      }
    });
  }

  function setStored(patch) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(patch, () => resolve());
      } catch (_) {
        Object.entries(patch).forEach(([k, v]) =>
          v == null ? localStorage.removeItem(k) : localStorage.setItem(k, String(v)),
        );
        resolve();
      }
    });
  }

  async function clear() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(Object.values(KEYS), () => resolve());
      } catch (_) {
        Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
        resolve();
      }
    });
  }

  function normalizeKey(k) {
    return String(k || "").trim().toUpperCase();
  }

  async function post(path, body) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function activate(licenseKey, hwid) {
    const key = normalizeKey(licenseKey);
    const r = await post("/api/activate", { license_key: key, hwid });
    if (r && r.success) {
      const patch = {
        [KEYS.license]: key,
        [KEYS.expiresAt]: r.expires_at || null,
        [KEYS.activatedAt]: new Date().toISOString(),
        [KEYS.lastCheck]: Date.now(),
      };
      if (r.token) patch[KEYS.token] = r.token;
      if (r.token_expires) patch[KEYS.tokenExp] = r.token_expires;
      await setStored(patch);
    }
    return r;
  }

  async function validate(licenseKey, hwid) {
    const key = normalizeKey(licenseKey);
    const r = await post("/api/validate", { license_key: key, hwid });
    if (r && r.valid) {
      const patch = {
        [KEYS.expiresAt]: r.expires_at || null,
        [KEYS.lastCheck]: Date.now(),
      };
      if (r.token) patch[KEYS.token] = r.token;
      if (r.token_expires) patch[KEYS.tokenExp] = r.token_expires;
      await setStored(patch);
    }
    return r;
  }

  window.SPLicense = { activate, validate, getStored, setStored, clear, KEYS };
})();
