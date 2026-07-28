import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=600",
  "Content-Type": "application/javascript; charset=utf-8",
};

/** Bayilerin kendi sitesine tek satırla gömebildiği ürün vitrini. */
const WIDGET = String.raw`(function () {
  var s = document.currentScript;
  if (!s) return;
  var base = new URL(s.src).origin;
  var code = s.getAttribute("data-code") || "";
  var limit = s.getAttribute("data-limit") || "8";
  var category = s.getAttribute("data-category") || "";
  var theme = s.getAttribute("data-theme") || "dark";
  var title = s.getAttribute("data-title") || "";

  var host = document.createElement("div");
  s.parentNode.insertBefore(host, s);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var dark = theme !== "light";
  var css = document.createElement("style");
  css.textContent = [
    ".sl-wrap{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:" + (dark ? "#e6f7ef" : "#0b1220") + "}",
    ".sl-title{font-size:15px;font-weight:700;margin:0 0 12px;letter-spacing:.02em}",
    ".sl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}",
    ".sl-card{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;text-decoration:none;color:inherit;border:1px solid " + (dark ? "rgba(0,255,157,.22)" : "rgba(0,0,0,.1)") + ";background:" + (dark ? "rgba(10,16,14,.75)" : "#fff") + ";transition:transform .15s,border-color .15s}",
    ".sl-card:hover{transform:translateY(-2px);border-color:#00ff9d}",
    ".sl-img{width:100%;height:96px;object-fit:contain;background:" + (dark ? "rgba(255,255,255,.04)" : "#f5f5f5") + ";border-radius:8px}",
    ".sl-name{font-size:13px;font-weight:600;line-height:1.3}",
    ".sl-meta{display:flex;align-items:center;justify-content:space-between;gap:8px}",
    ".sl-price{font-size:14px;font-weight:700;color:#00c97b}",
    ".sl-old{font-size:11px;text-decoration:line-through;opacity:.55}",
    ".sl-oos{font-size:10px;opacity:.6}",
    ".sl-foot{margin-top:10px;font-size:11px;opacity:.6}",
    ".sl-foot a{color:#00c97b;text-decoration:none}",
  ].join("");
  root.appendChild(css);

  var wrap = document.createElement("div");
  wrap.className = "sl-wrap";
  wrap.innerHTML = (title ? '<p class="sl-title">' + title + "</p>" : "") + '<div class="sl-grid"></div>' +
    '<div class="sl-foot">Ürünler <a href="' + base + '" target="_blank" rel="noopener">SiberLisans</a> tarafından sağlanır.</div>';
  root.appendChild(wrap);
  var grid = wrap.querySelector(".sl-grid");

  var url = base + "/api/public/catalog.json?limit=" + encodeURIComponent(limit) +
    (category ? "&category=" + encodeURIComponent(category) : "") +
    (code ? "&code=" + encodeURIComponent(code) : "");

  fetch(url).then(function (r) { return r.json(); }).then(function (d) {
    (d.products || []).forEach(function (p) {
      var a = document.createElement("a");
      a.className = "sl-card";
      a.href = p.url;
      a.target = "_blank";
      a.rel = "noopener";
      var price = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(p.price_try);
      var old = p.retail_price_try && p.retail_price_try > p.price_try
        ? '<span class="sl-old">' + new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(p.retail_price_try) + "</span>"
        : "";
      a.innerHTML =
        (p.image_url ? '<img class="sl-img" loading="lazy" alt="" src="' + p.image_url + '">' : "") +
        '<div class="sl-name"></div>' +
        '<div class="sl-meta"><span class="sl-price">' + price + "</span>" + old +
        (p.in_stock ? "" : '<span class="sl-oos">stok yok</span>') + "</div>";
      a.querySelector(".sl-name").textContent = p.name;
      grid.appendChild(a);
    });
  }).catch(function () {
    grid.textContent = "Ürünler yüklenemedi.";
  });
})();`;

export const Route = createFileRoute("/api/public/embed.js")({
  server: {
    handlers: {
      GET: async () => new Response(WIDGET, { headers: CORS }),
    },
  },
});
