export type Theme = "dark" | "light" | "matrix" | "midnight" | "sunset";

export const THEMES: { id: Theme; label: string; desc: string; swatch: string[] }[] = [
  { id: "dark",     label: "Cyber Neon",    desc: "koyu + neon yeşil (varsayılan)",       swatch: ["#0a0f14", "#111b24", "#00ff9d"] },
  { id: "light",    label: "Cloud White",   desc: "beyaz + elektrik mavi",                swatch: ["#fafbfc", "#e8ecf1", "#3b82f6"] },
  { id: "matrix",   label: "Matrix",        desc: "siyah + parlak yeşil terminal",        swatch: ["#000000", "#0a1a0a", "#22ff55"] },
  { id: "midnight", label: "Midnight Blue", desc: "derin lacivert + camgöbeği",           swatch: ["#0a0e2a", "#141a3d", "#4dd0ff"] },
  { id: "sunset",   label: "Sunset Ember",  desc: "sıcak amber + turuncu ember",          swatch: ["#1a0f0a", "#241612", "#ff8a3d"] },
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
