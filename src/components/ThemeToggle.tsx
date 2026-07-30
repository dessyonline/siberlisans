import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { applyTheme, getTheme, THEMES, type Theme } from "@/lib/theme";

/**
 * Theme picker: opens a dropdown with 5 visual themes + swatches.
 * Reads current theme on mount and listens to cross-tab "themechange" events.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTheme(getTheme());
    const onChange = (e: Event) => {
      const t = (e as CustomEvent<Theme>).detail;
      if (t) setTheme(t);
    };
    window.addEventListener("themechange", onChange);
    return () => window.removeEventListener("themechange", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div ref={wrapRef} className={"relative inline-block " + className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tema seç"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Tema: ${current.label}`}
        className="inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
      >
        <Palette className="h-4 w-4" />
        <span className="hidden 2xl:inline font-mono text-xs whitespace-nowrap">{current.label}</span>
        <span className="flex gap-0.5" aria-hidden>
          {current.swatch.map((c) => (
            <span key={c} className="h-2 w-2 rounded-sm border border-border/60" style={{ background: c }} />
          ))}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border/70 bg-popover/95 backdrop-blur-md p-1.5 shadow-xl"
        >
          <div className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            tema seç
          </div>
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                role="menuitemradio"
                aria-checked={active}
                type="button"
                onClick={() => {
                  applyTheme(t.id);
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors " +
                  (active ? "bg-primary/10 text-foreground" : "hover:bg-muted/60 text-foreground/90")
                }
              >
                <span className="flex gap-1 shrink-0" aria-hidden>
                  {t.swatch.map((c, i) => (
                    <span
                      key={c + i}
                      className="h-6 w-3 rounded-sm border border-border/60"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-xs font-semibold">{t.label}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground truncate">
                    {t.desc}
                  </span>
                </span>
                {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
