import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KeyRound, Copy, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/sifre")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Güçlü Şifre Üreteci — SiberPHP" },
      { name: "description", content: "Kriptografik olarak güvenli, özelleştirilebilir şifre üreteci. Tarayıcında çalışır, hiçbir veri gönderilmez." },
    ],
  }),
});

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYM = "!@#$%^&*()-_=+[]{};:,.?/";
const AMBIG = "il1Lo0O";

function randPick(pool: string, n: number) {
  const out: string[] = [];
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  for (let i = 0; i < n; i++) out.push(pool[buf[i] % pool.length]);
  return out;
}

function shuffle(arr: string[]) {
  const buf = new Uint32Array(arr.length);
  crypto.getRandomValues(buf);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function Page() {
  const [len, setLen] = useState(20);
  const [useUpper, setUpper] = useState(true);
  const [useDigit, setDigit] = useState(true);
  const [useSym, setSym] = useState(true);
  const [noAmbig, setNoAmbig] = useState(true);
  const [count, setCount] = useState(5);
  const [list, setList] = useState<string[]>([]);

  const pool = useMemo(() => {
    let p = LOWER + (useUpper ? UPPER : "") + (useDigit ? DIGIT : "") + (useSym ? SYM : "");
    if (noAmbig) p = [...p].filter((c) => !AMBIG.includes(c)).join("");
    return p;
  }, [useUpper, useDigit, useSym, noAmbig]);

  const gen = useCallback(() => {
    if (!pool.length) return;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const required: string[] = [];
      if (useUpper) required.push(...randPick(UPPER, 1));
      if (useDigit) required.push(...randPick(DIGIT, 1));
      if (useSym) required.push(...randPick(SYM, 1));
      const rest = randPick(pool, Math.max(0, len - required.length));
      out.push(shuffle([...required, ...rest]).join("").slice(0, len));
    }
    setList(out);
  }, [pool, count, len, useUpper, useDigit, useSym]);

  useEffect(() => { gen(); }, [gen]);

  const entropy = Math.round(len * Math.log2(Math.max(pool.length, 2)));
  const strength = entropy >= 128 ? "askeri" : entropy >= 90 ? "çok güçlü" : entropy >= 60 ? "güçlü" : entropy >= 40 ? "orta" : "zayıf";
  const strengthColor = entropy >= 90 ? "text-primary" : entropy >= 60 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./passgen --crypto-secure<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl neon-text flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Güçlü Şifre Üreteci
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Web Crypto ile üretilir — sunucuya hiçbir şey gitmez.</p>
      </div>

      <div className="glass-card rounded-lg p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-muted-foreground">uzunluk</span>
            <span className="text-primary">{len}</span>
          </div>
          <input type="range" min={8} max={64} value={len} onChange={(e) => setLen(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Büyük harf (A-Z)" on={useUpper} set={setUpper} />
          <Toggle label="Rakam (0-9)" on={useDigit} set={setDigit} />
          <Toggle label="Sembol (!@#$)" on={useSym} set={setSym} />
          <Toggle label="Karışan karakterleri çıkar" on={noAmbig} set={setNoAmbig} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">adet</span>
          {[1, 5, 10, 20].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={`rounded border px-2.5 py-1 font-mono text-xs transition ${count === n ? "border-primary bg-primary/10 text-primary" : "border-primary/20 text-muted-foreground hover:border-primary/50"}`}>{n}</button>
          ))}
          <Button onClick={gen} className="font-mono neon-glow ml-auto"><RefreshCw className="h-4 w-4 mr-1" /> üret</Button>
        </div>

        <div className="rounded border border-primary/20 bg-black/30 p-3 font-mono text-xs flex items-center justify-between">
          <span className="text-muted-foreground">entropi</span>
          <span className={strengthColor}>~{entropy} bit · {strength}</span>
        </div>
      </div>

      {list.length > 0 && (
        <div className="glass-card rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">$ output</span>
            <button onClick={() => { navigator.clipboard.writeText(list.join("\n")); toast.success("Tümü kopyalandı"); }} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              <Copy className="h-3 w-3" /> tümünü kopyala
            </button>
          </div>
          {list.map((p, i) => (
            <button
              key={`${p}-${i}`}
              onClick={() => { navigator.clipboard.writeText(p); toast.success("Kopyalandı"); }}
              className="group w-full rounded border border-primary/15 bg-background/40 px-3 py-2 text-left font-mono text-sm break-all hover:border-primary/50 hover:bg-primary/5 transition"
            >
              <span className="text-primary/50 mr-2 select-none">{String(i + 1).padStart(2, "0")}</span>
              {p}
              <Copy className="inline h-3 w-3 ml-2 opacity-0 group-hover:opacity-60 transition" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`flex items-center justify-between rounded border px-3 py-2 font-mono text-xs transition ${on ? "border-primary/60 bg-primary/5 text-primary" : "border-primary/15 text-muted-foreground hover:border-primary/40"}`}
    >
      {label}
      <span className={`h-3 w-3 rounded-sm border ${on ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
    </button>
  );
}
