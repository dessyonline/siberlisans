/* XSiberPHPX — License flow controller (popup) */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const screens = ["sp-loading", "sp-license-screen", "sp-active-screen", "sp-expired-screen", "sp-revoked-screen", "sp-offline-screen"];

  let currentHwid = null;
  let currentKey = null;
  let currentOwner = null; // { email, name }
  let currentExpiresAt = null; // ms
  let currentActivatedAt = null; // ms
  let tickerId = null;
  let revalidateId = null;

  function show(id) {
    screens.forEach((s) => {
      const el = $(s);
      if (el) el.style.display = s === id ? (id === "sp-active-screen" ? "flex" : "flex") : "none";
    });
  }

  function setBadge(text, variant) {
    const b = $("sp-license-badge");
    if (!b) return;
    if (!text) {
      b.style.display = "none";
      return;
    }
    b.style.display = "inline-flex";
    b.textContent = text;
    b.classList.remove("sp-badge--ok", "sp-badge--warn", "sp-badge--danger");
    if (variant) b.classList.add(`sp-badge--${variant}`);
  }

  function shortKey(k) {
    if (!k) return "—";
    return k.length > 20 ? `${k.slice(0, 10)}…${k.slice(-6)}` : k;
  }

  function formatRemaining(ms) {
    if (ms <= 0) return { text: "00:00:00", variant: "danger", badge: "SÜRESİ DOLDU" };
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    let text, variant, badge;
    if (days >= 1) {
      text = `${days} gün ${hours} saat`;
      badge = `${days}g`;
      variant = null;
    } else {
      const pad = (n) => String(n).padStart(2, "0");
      text = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
      if (hours < 1 && mins < 5) variant = "danger";
      else if (hours < 1) variant = "warn";
      else variant = null;
      badge = hours >= 1 ? `${hours}sa` : `${mins}dk`;
    }
    return { text, variant, badge };
  }

  function updateCountdown() {
    if (!currentExpiresAt) {
      $("sp-countdown").textContent = "∞";
      $("sp-countdown-label").textContent = "süresiz";
      $("sp-progress-fill").style.width = "100%";
      setBadge("∞ süresiz", "ok");
      return;
    }
    const now = Date.now();
    const remaining = currentExpiresAt - now;

    if (remaining <= 0) {
      stopTicker();
      show("sp-expired-screen");
      setBadge("SÜRESİ DOLDU", "danger");
      return;
    }

    const total = currentActivatedAt ? currentExpiresAt - currentActivatedAt : remaining;
    const pct = Math.max(0, Math.min(100, (remaining / total) * 100));

    const f = formatRemaining(remaining);
    const cd = $("sp-countdown");
    cd.textContent = f.text;
    cd.classList.remove("sp-countdown--warn", "sp-countdown--danger");
    if (f.variant) cd.classList.add(`sp-countdown--${f.variant}`);
    $("sp-countdown-label").textContent = "Kalan süre";
    $("sp-progress-fill").style.width = `${pct}%`;
    setBadge(f.badge, f.variant === "danger" ? "danger" : f.variant === "warn" ? "warn" : "ok");
  }

  function stopTicker() {
    if (tickerId) {
      clearInterval(tickerId);
      tickerId = null;
    }
  }

  function startTicker() {
    stopTicker();
    updateCountdown();
    tickerId = setInterval(updateCountdown, 1000);
  }

  function stopRevalidate() {
    if (revalidateId) {
      clearInterval(revalidateId);
      revalidateId = null;
    }
  }

  function startRevalidate() {
    stopRevalidate();
    revalidateId = setInterval(async () => {
      if (!currentKey || !currentHwid) return;
      const r = await SPLicense.validate(currentKey, currentHwid).catch(() => null);
      if (!r) return;
      handleValidate(r);
    }, 60000);
  }

  function paintActive() {
    $("sp-hwid-short").textContent = SPFingerprint.shortHwid(currentHwid);
    $("sp-key-short").textContent = shortKey(currentKey);
    const ownerRow = $("sp-owner-row");
    const ownerEl = $("sp-owner-short");
    if (ownerRow && ownerEl) {
      if (currentOwner && (currentOwner.email || currentOwner.name)) {
        ownerEl.textContent = currentOwner.name
          ? `${currentOwner.name} · ${currentOwner.email || ""}`.trim().replace(/·\s*$/, "")
          : currentOwner.email || "—";
        ownerRow.style.display = "";
      } else {
        ownerRow.style.display = "none";
      }
    }
    show("sp-active-screen");
    startTicker();
    startRevalidate();
  }

  function handleValidate(r) {
    if (r && r.valid) {
      currentExpiresAt = r.expires_at ? new Date(r.expires_at).getTime() : null;
      currentOwner = (r.owner_email || r.owner_name) ? { email: r.owner_email || null, name: r.owner_name || null } : null;
      paintActive();
      return true;
    }
    stopTicker();
    stopRevalidate();
    const err = (r && r.error) || "Lisans doğrulanamadı.";
    if (/iptal/i.test(err)) {
      show("sp-revoked-screen");
      setBadge("İPTAL", "danger");
    } else if (/süre|doldu|expired/i.test(err)) {
      show("sp-expired-screen");
      setBadge("SÜRESİ DOLDU", "danger");
    } else if (/başka.*cihaz|başka bir cihaz/i.test(err)) {
      showLicenseError(err, "sp-license-error");
      show("sp-license-screen");
      setBadge("CİHAZ HATASI", "danger");
    } else if (/etkinleştir/i.test(err)) {
      // "henüz etkinleştirilmemiş" → activate needed
      activateAndShow(currentKey);
    } else {
      showLicenseError(err, "sp-license-error");
      show("sp-license-screen");
      setBadge(null);
    }
    return false;
  }

  async function activateAndShow(licenseKey, errorTargetId) {
    show("sp-loading");
    try {
      const r = await SPLicense.activate(licenseKey, currentHwid);
      if (r && r.success) {
        currentKey = licenseKey;
        currentExpiresAt = r.expires_at ? new Date(r.expires_at).getTime() : null;
        // activated_at = now if we just activated
        currentActivatedAt = Date.now();
        await SPLicense.setStored({ [SPLicense.KEYS.activatedAt]: new Date().toISOString() });
        paintActive();
        return true;
      }
      const err = (r && r.error) || "Etkinleştirme başarısız.";
      if (/iptal/i.test(err)) {
        show("sp-revoked-screen");
      } else {
        showLicenseError(err, errorTargetId || "sp-license-error");
        show("sp-license-screen");
      }
      return false;
    } catch (e) {
      $("sp-offline-desc").textContent = "İnternet bağlantınızı kontrol edin.";
      show("sp-offline-screen");
      return false;
    }
  }

  function showLicenseError(msg, targetId) {
    const el = $(targetId || "sp-license-error");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
  }

  function bindEvents() {
    $("sp-license-btn").addEventListener("click", async () => {
      const val = ($("sp-license-input").value || "").trim().toUpperCase();
      const errEl = $("sp-license-error");
      errEl.style.display = "none";
      if (val.length < 4) {
        showLicenseError("Geçerli bir anahtar girin.", "sp-license-error");
        return;
      }
      await activateAndShow(val, "sp-license-error");
    });

    $("sp-expired-btn").addEventListener("click", async () => {
      const val = ($("sp-expired-input").value || "").trim().toUpperCase();
      const errEl = $("sp-expired-error");
      errEl.style.display = "none";
      if (val.length < 4) {
        showLicenseError("Geçerli bir anahtar girin.", "sp-expired-error");
        return;
      }
      await activateAndShow(val, "sp-expired-error");
    });

    $("sp-revoked-btn").addEventListener("click", async () => {
      await SPLicense.clear();
      currentKey = null;
      currentExpiresAt = null;
      currentActivatedAt = null;
      setBadge(null);
      show("sp-license-screen");
    });

    $("sp-change-key-btn").addEventListener("click", async () => {
      await SPLicense.clear();
      currentKey = null;
      currentExpiresAt = null;
      currentActivatedAt = null;
      setBadge(null);
      stopTicker();
      stopRevalidate();
      show("sp-license-screen");
    });

    $("sp-copy-hwid").addEventListener("click", async () => {
      await navigator.clipboard.writeText(currentHwid || "");
      flashCopied($("sp-copy-hwid"));
    });

    $("sp-copy-key").addEventListener("click", async () => {
      await navigator.clipboard.writeText(currentKey || "");
      flashCopied($("sp-copy-key"));
    });

    $("sp-retry-btn").addEventListener("click", () => boot());

    // Auto-format input: uppercase + strip spaces
    ["sp-license-input", "sp-expired-input"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const v = el.value.toUpperCase().replace(/\s+/g, "");
        if (v !== el.value) el.value = v;
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const btn = id === "sp-license-input" ? $("sp-license-btn") : $("sp-expired-btn");
          btn && btn.click();
        }
      });
    });
  }

  function flashCopied(btn) {
    const orig = btn.textContent;
    btn.classList.add("sp-copied");
    btn.textContent = "✓";
    setTimeout(() => {
      btn.classList.remove("sp-copied");
      btn.textContent = orig;
    }, 1500);
  }

  async function boot() {
    show("sp-loading");
    setBadge(null);

    currentHwid = await SPFingerprint.get();
    const stored = await SPLicense.getStored();
    currentKey = stored[SPLicense.KEYS.license] || null;
    currentActivatedAt = stored[SPLicense.KEYS.activatedAt]
      ? new Date(stored[SPLicense.KEYS.activatedAt]).getTime()
      : null;

    if (!currentKey) {
      show("sp-license-screen");
      return;
    }

    // Optimistically restore countdown from stored expires while we validate
    if (stored[SPLicense.KEYS.expiresAt]) {
      currentExpiresAt = new Date(stored[SPLicense.KEYS.expiresAt]).getTime();
    }

    try {
      const r = await SPLicense.validate(currentKey, currentHwid);
      handleValidate(r);
    } catch (e) {
      // offline — if we have cached data and it's not expired, show active anyway
      if (currentExpiresAt && currentExpiresAt > Date.now()) {
        paintActive();
        return;
      }
      const last = stored[SPLicense.KEYS.lastCheck];
      $("sp-offline-desc").textContent = last
        ? `Son doğrulama: ${new Date(Number(last)).toLocaleString("tr-TR")}`
        : "İnternet bağlantınızı kontrol edin.";
      show("sp-offline-screen");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    boot();
  });
})();
