export type Theme = "dark" | "light";

const KEY = "siberphp-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  try {
    window.localStorage.setItem(KEY, t);
    window.dispatchEvent(new CustomEvent("themechange", { detail: t }));
  } catch {}
}

export function toggleTheme() {
  applyTheme(getTheme() === "light" ? "dark" : "light");
}

/** Inline script for RootShell to avoid FOUC. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`;
