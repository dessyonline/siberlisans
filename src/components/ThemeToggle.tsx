import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";

/**
 * Header sun/moon toggle. Reads current theme on mount and listens to
 * cross-tab changes via the "themechange" event.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(getTheme());
    const onChange = (e: Event) => {
      const t = (e as CustomEvent<Theme>).detail;
      if (t === "light" || t === "dark") setTheme(t);
    };
    window.addEventListener("themechange", onChange);
    return () => window.removeEventListener("themechange", onChange);
  }, []);

  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={() => {
        const next: Theme = isLight ? "dark" : "light";
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={isLight ? "Koyu temaya geç" : "Açık temaya geç"}
      title={isLight ? "Koyu tema" : "Açık tema"}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors " +
        className
      }
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
