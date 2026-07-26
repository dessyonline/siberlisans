import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Hash, Copy, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/uuid")({
  component: Page,
  head: () => ({
    meta: [
      { title: "UUID / ID Üretici — SiberPHP" },
      { name: "description", content: "UUID v4, kısa ID ve NanoID formatında güvenli rastgele kimlikler üret. Tarayıcında çalışır." },
    ],
  }),
});

type Mode = "uuid" | "nano" | "kisa" | "hex";
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

function randStr(pool: string, n: number) {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return [...buf].map((v) => pool[v % pool.length]).join("");
}

function make(mode: Mode) {
  if (mode === "uuid") return crypto.randomUUID();
  if (mode === "nano") return randStr(ALPHA, 21);
  if (mode === "kisa") return randStr("abcdefghijkmnpqrstuvwxyz23456789", 8);
  return randStr("0123456789abcdef", 32);
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "uuid", label: "UUID v4", hint: "standart 36 karakter" },
  { id: "nano", label: "NanoID", hint: "21 karakter, URL güvenli" },
  { id: "kisa", label: "Kısa Kod", hint: "8 karakter, karışmaz" },
  { id: "hex", label: "Hex Token", hint: "32 karakter onaltılık" },
];

function Page() {
  const [mode, setMode] = useState<Mode>("uuid");
  const [count, setCount] = useState(5);
  const [list, setList] = useState<string[]>([]);
  const [upper, setUpper] = useState(false);

  const gen = useCallback(() => {
    setList(Array.from({ length: count }, () => {
      const v = make(mode);
      return upper ? v.toUpperCase() : v;
    }));
  }, [mode, count, upper]);

  useEffect(() => { gen(); }, [gen]);

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./idgen<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <Hash className="h-5 w-5" /> UUID / ID Üretici
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Kriptografik rastgelelikle üretilir. Sipariş kodu, referans, API anahtarı için.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded border px-3 py-2 text-left transition ${mode === m.id ? "border-primary bg-primary/10" : "border-primary/15 hover:border-primary/40"}`}
            >
              <div className={`font-mono text-xs ${mode === m.id ? "text-primary" : "text-foreground"}`}>{m.label}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">adet</span>
          {[1, 5, 10, 25].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={`rounded border px-2.5 py-1 font-mono text-xs transition ${count === n ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-muted-foreground hover:border-primary/50"}`}>{n}</button>
          ))}
          <button onClick={() => setUpper(!upper)} className={`rounded border px-2.5 py-1 font-mono text-xs transition ${upper ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-muted-foreground"}`}>BÜYÜK HARF</button>
          <Button onClick={gen} className="font-mono neon-glow ml-auto"><RefreshCw className="h-4 w-4 mr-1" /> üret</Button>
        </div>
      </div>

      {list.length > 0 && (
        <div className="glass-card rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">$ output · {list.length}</span>
            <button onClick={() => { navigator.clipboard.writeText(list.join("\n")); toast.success("Tümü kopyalandı"); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              <Copy className="h-3 w-3" /> tümünü kopyala
            </button>
          </div>
          {list.map((v, i) => (
            <button
              key={`${v}-${i}`}
              onClick={() => { navigator.clipboard.writeText(v); toast.success("Kopyalandı"); }}
              className="group w-full rounded border border-primary/15 bg-background/40 px-3 py-2 text-left font-mono text-sm break-all hover:border-primary/50 hover:bg-primary/5 transition"
            >
              <span className="text-primary/50 mr-2 select-none">{String(i + 1).padStart(2, "0")}</span>
              {v}
              <Copy className="inline h-3 w-3 ml-2 opacity-0 group-hover:opacity-60 transition" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
