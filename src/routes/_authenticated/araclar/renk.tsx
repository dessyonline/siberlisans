import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Palette, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/renk")({
  component: Page,
  head: () => ({ meta: [{ title: "Renk Çevirici — SiberPHP" }] }),
});

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace("#", "").trim();
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function Page() {
  const [hex, setHex] = useState("#00ff9d");
  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;

  const rgbStr = rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "-";
  const hslStr = hsl ? `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` : "-";

  const shades = useMemo(() => {
    if (!rgb) return [];
    return [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6].map((m) => {
      const r = Math.min(255, rgb.r * m);
      const g = Math.min(255, rgb.g * m);
      const b = Math.min(255, rgb.b * m);
      return rgbToHex(r, g, b);
    });
  }, [rgb]);

  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success(`${v} kopyalandı`); };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./color --local<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Palette className="h-5 w-5" /> Renk Çevirici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">HEX ↔ RGB ↔ HSL + otomatik ton skalası.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="color"
            value={rgb ? hex.length === 4 ? "#" + hex.slice(1).split("").map((c) => c + c).join("") : hex : "#000000"}
            onChange={(e) => setHex(e.target.value)}
            className="h-14 w-20 rounded cursor-pointer bg-transparent border border-border"
          />
          <input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="font-mono text-lg bg-background/40 border border-border rounded px-3 py-2 w-36"
          />
          <div
            className="h-14 flex-1 min-w-[200px] rounded border border-border"
            style={{ background: rgb ? hex : "transparent" }}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: "HEX", val: hex.toUpperCase() },
            { label: "RGB", val: rgbStr },
            { label: "HSL", val: hslStr },
          ].map((r) => (
            <button
              key={r.label}
              onClick={() => copy(r.val)}
              className="rounded border border-border/60 bg-background/40 p-3 text-left hover:border-primary/60"
            >
              <div className="font-mono text-[10px] text-muted-foreground flex items-center justify-between">
                {r.label}
                <Copy className="h-3 w-3" />
              </div>
              <div className="font-mono text-sm">{r.val}</div>
            </button>
          ))}
        </div>

        {shades.length > 0 && (
          <div>
            <div className="font-mono text-[11px] text-muted-foreground mb-2">ton skalası</div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {shades.map((s) => (
                <button
                  key={s}
                  onClick={() => copy(s)}
                  className="h-12 rounded border border-border/60 hover:scale-105 transition"
                  style={{ background: s }}
                  title={s}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
