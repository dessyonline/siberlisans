export type Theme = "dark" | "light" | "matrix" | "midnight" | "sunset";

export const THEMES: { id: Theme; label: string; desc: string; swatch: string[] }[] = [
  { id: "dark",     label: "Cyber Neon",    desc: "koyu teal + neon yeşil (varsayılan)",  swatch: ["#0c1418", "#182027", "#00ffa3"] },
  { id: "light",    label: "Cloud White",   desc: "kâğıt beyazı + indigo/menekşe",         swatch: ["#fafbfd", "#eef0f6", "#5b3df5"] },
  { id: "matrix",   label: "Matrix",        desc: "saf siyah + zümrüt terminal",           swatch: ["#020402", "#0a1a10", "#00ff5c"] },
  { id: "midnight", label: "Midnight Blue", desc: "royal lacivert + buz camgöbeği",        swatch: ["#080d24", "#141c3d", "#5cc3ff"] },
  { id: "sunset",   label: "Sunset Ember",  desc: "sıcak erik + mercan turuncu",           swatch: ["#1a0d0a", "#2a1a15", "#ff7a3d"] },
];

const KEY = "siberphp-theme";
const VALID: Theme[] = ["dark", "light", "matrix", "midnight", "sunset"];

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(KEY) as Theme | null;
    return v && VALID.includes(v) ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try {
    window.localStorage.setItem(KEY, t);
    window.dispatchEvent(new CustomEvent("themechange", { detail: t }));
  } catch {}
}

export function cycleTheme() {
  const cur = getTheme();
  const idx = THEMES.findIndex((x) => x.id === cur);
  const next = THEMES[(idx + 1) % THEMES.length].id;
  applyTheme(next);
}

/** Inline script for RootShell to avoid FOUC. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');var ok=['light','matrix','midnight','sunset'];if(t&&ok.indexOf(t)>-1)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
