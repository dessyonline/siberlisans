import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShieldCheck,
  Zap,
  Lock,
  KeyRound,
  Terminal,
  CheckCircle2,
  Cpu,
  Wifi,
  Star,
  Search,
  X,
  Sparkles,
  MonitorSmartphone,
  Palette,
  Brain,
  FileText,
  Gamepad2,
  Mail,
  ArrowRight,
} from "lucide-react";
import { ProductCardSkeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/")({
  component: Index,
});

const DURATION_LABEL: Record<string, string> = {
  monthly: "aylık",
  yearly: "yıllık",
  lifetime: "ömürlük",
};

// Category → icon + accent color (oklch tokens) for cyber recent-items
const CAT_VISUAL: Record<string, { Icon: typeof KeyRound; hue: string; ring: string; grad: string }> = {
  Windows:         { Icon: MonitorSmartphone, hue: "oklch(0.75 0.13 210)", ring: "oklch(0.75 0.13 210 / 0.4)", grad: "from-[oklch(0.75_0.13_210/0.25)] to-transparent" },
  "Görsel & Tasarım": { Icon: Palette,       hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  "Yapay Zeka":    { Icon: Brain,             hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
  "Microsoft Office": { Icon: FileText,       hue: "oklch(0.65 0.20 25)",  ring: "oklch(0.65 0.20 25 / 0.4)",  grad: "from-[oklch(0.65_0.20_25/0.25)] to-transparent" },
  Oyunlar:         { Icon: Gamepad2,          hue: "oklch(0.68 0.22 340)", ring: "oklch(0.68 0.22 340 / 0.4)", grad: "from-[oklch(0.68_0.22_340/0.25)] to-transparent" },
  "E-posta":       { Icon: Mail,              hue: "oklch(0.78 0.16 220)", ring: "oklch(0.78 0.16 220 / 0.4)", grad: "from-[oklch(0.78_0.16_220/0.25)] to-transparent" },
};
const catVisual = (cat: string | null) =>
  (cat && CAT_VISUAL[cat]) || { Icon: Cpu, hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" };
const HERO_WORDS = ["güvenli.", "anında.", "otomatik.", "şifreli.", "orijinal."];
function CyberRotator() {
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"type" | "hold" | "erase">("type");

  useEffect(() => {
    const word = HERO_WORDS[i];
    let t: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      if (text.length < word.length) {
        t = setTimeout(() => setText(word.slice(0, text.length + 1)), 70);
      } else {
        t = setTimeout(() => setPhase("hold"), 1400);
      }
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("erase"), 900);
    } else {
      if (text.length > 0) {
        t = setTimeout(() => setText(word.slice(0, text.length - 1)), 35);
      } else {
        t = setTimeout(() => {
          setI((n) => (n + 1) % HERO_WORDS.length);
          setPhase("type");
        }, 200);
      }
    }
    return () => clearTimeout(t);
  }, [text, phase, i]);

  return (
    <span className="inline-flex items-baseline">
      <span className="neon-sweep">{text}</span>
      <span
        aria-hidden
        className="caret-blink ml-1 inline-block w-[3px] h-[0.9em] translate-y-[0.05em] bg-primary shadow-[0_0_12px_oklch(0.85_0.24_145/0.9)]"
      />
    </span>
  );
}

// Typed line — reveals characters left→right, one-shot
function TypedLine({ text, delay = 0, className = "" }: { text: string; delay?: number; className?: string }) {
  return (
    <span
      className={`inline-block type-in ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {text}
    </span>
  );
}
// ─────────────────────────────────────────────────
// LIVE SALES STREAM — cyber ticker + feed panel
// ─────────────────────────────────────────────────
type SaleProd = { name: string; price_try: number; slug: string; category: string | null };

const TR_CITIES = ["İstanbul","Ankara","İzmir","Bursa","Antalya","Adana","Konya","Gaziantep","Kayseri","Eskişehir","Trabzon","Samsun","Mersin","Diyarbakır","Sakarya"];
const HEX = "0123456789ABCDEF";
const randHash = (n: number) => Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join("");
const randHandle = () => {
  const roots = ["ahmet","mert","zeynep","emre","selin","can","burak","elif","kaan","deniz","ece","onur","furkan","aylin","cem"];
  const r = roots[Math.floor(Math.random() * roots.length)];
  return `${r}_${randHash(3).toLowerCase()}`.replace(/(.{3}).*(_.*)/, "$1***$2");
};
const secAgo = (n: number) => (n < 60 ? `${n}s` : n < 3600 ? `${Math.floor(n / 60)}m` : `${Math.floor(n / 3600)}h`);

type Sale = { id: string; user: string; city: string; p: SaleProd; t: number; ord: string };
const mkSale = (p: SaleProd, tOffset = 0): Sale => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  user: randHandle(),
  city: TR_CITIES[Math.floor(Math.random() * TR_CITIES.length)],
  p,
  t: Date.now() - tOffset * 1000,
  ord: `#${randHash(4)}`,
});

function LiveSalesStream({ products }: { products: SaleProd[] }) {
  const [feed, setFeed] = useState<Sale[]>([]);
  const [now, setNow] = useState(Date.now());

  // seed
  useEffect(() => {
    if (!products.length || feed.length) return;
    const seed = Array.from({ length: 6 }, (_, i) =>
      mkSale(products[Math.floor(Math.random() * products.length)], (i + 1) * 42 + Math.random() * 20),
    );
    setFeed(seed);
  }, [products, feed.length]);

  // append new sale periodically
  useEffect(() => {
    if (!products.length) return;
    const push = () => {
      setFeed((f) => {
        const next = [mkSale(products[Math.floor(Math.random() * products.length)]), ...f].slice(0, 7);
        return next;
      });
    };
    const iv = setInterval(push, 4200 + Math.random() * 2800);
    return () => clearInterval(iv);
  }, [products]);

  // tick for elapsed
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // marquee track content — duplicate for seamless loop
  const tape = useMemo(() => (feed.length ? [...feed, ...feed] : []), [feed]);

  if (!feed.length) return null;

  return (
    <section className="relative border-y border-primary/25 bg-background/80 backdrop-blur">
      {/* thin marquee tape */}
      <div className="relative overflow-hidden">
        {/* pinned LIVE badge sits above fade + tape */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-background/90 px-2.5 py-1 font-mono text-[11px] text-primary neon-glow">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            LIVE_SALES
          </span>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-40 bg-gradient-to-r from-background via-background/90 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
        <div className="py-2.5 pl-36 font-mono text-[11px] whitespace-nowrap">
          <div className="flex marquee-track">
            {tape.map((s, i) => (
              <div key={`${s.id}-${i}`} className="flex items-center gap-2 px-5">
                <span className="text-primary">[SOLD]</span>
                <span className="text-muted-foreground">{s.ord}</span>
                <span className="text-foreground/90">{s.p.name}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-primary">₺{Number(s.p.price_try).toLocaleString("tr-TR")}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground/80">{s.user}@{s.city}</span>
                <span className="text-primary/40">◆</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed feed panel */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="glass-card rounded-xl overflow-hidden neon-glow">
          <div className="flex items-center justify-between border-b border-border/60 bg-background/60 px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="h-2 w-2 rounded-full bg-destructive/70" />
              <span className="h-2 w-2 rounded-full bg-warn/70" />
              <span className="h-2 w-2 rounded-full bg-primary/70" />
              <span className="ml-2 text-muted-foreground">tail -f /var/log/siberphp/sales.stream</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span className="inline-flex items-center gap-1 text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                streaming
              </span>
              <span className="text-muted-foreground hidden sm:inline">
                son 24s: <span className="text-primary">{124 + (feed.length % 7)}</span> teslim
              </span>
            </div>
          </div>

          <div className="divide-y divide-border/40 font-mono text-xs">
            {feed.map((s, idx) => (
              <Link
                key={s.id}
                to="/urun/$slug"
                params={{ slug: s.p.slug }}
                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors ${idx === 0 ? "feed-in" : ""}`}
              >
                <span className="text-muted-foreground/60 shrink-0 hidden sm:inline">
                  [{new Date(s.t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}]
                </span>
                <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  SOLD
                </span>
                <span className="text-muted-foreground/80 shrink-0">{s.ord}</span>
                <span className="text-foreground/90 truncate flex-1 min-w-0">
                  <span className="text-primary/60">&gt;</span> {s.p.name}
                </span>
                {s.p.category && (
                  <span className="hidden md:inline text-muted-foreground/70 shrink-0">#{s.p.category}</span>
                )}
                <span className="hidden sm:inline text-muted-foreground/80 shrink-0">
                  {s.user}<span className="text-primary/50">@</span>{s.city}
                </span>
                <span className="text-primary shrink-0 tabular-nums">
                  ₺{Number(s.p.price_try).toLocaleString("tr-TR")}
                </span>
                <span className="text-muted-foreground/60 shrink-0 w-8 text-right tabular-nums">
                  {secAgo(Math.max(1, Math.floor((now - s.t) / 1000)))}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Index() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, image_url, category, featured, manual_fulfillment, stock_hint, unlimited_stock, created_at, license_keys(status)")
        .eq("active", true)
        .order("price_try");
      if (error) throw error;
      return data;
    },
  });

  const featured = (products ?? []).filter((p) => p.featured);

  const recent = useMemo(() => {
    return [...(products ?? [])]
      .sort(
        (a, b) =>
          new Date((b as { created_at: string }).created_at).getTime() -
          new Date((a as { created_at: string }).created_at).getTime(),
      )
      .slice(0, 8);
  }, [products]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [products, search]);

  return (
    <div>
      {/* HERO — cinematic */}
      <section className="relative overflow-hidden border-b border-border/40">
        {/* animated grid backdrop */}
        <div className="pointer-events-none absolute inset-0 cyber-grid grid-drift" aria-hidden />
        {/* floating orbs */}
        <div className="hero-orb h-[420px] w-[420px] left-[-120px] top-[-80px]" style={{ background: "oklch(0.82 0.20 145 / 0.55)" }} aria-hidden />
        <div className="hero-orb h-[380px] w-[380px] right-[-100px] top-[40%] animation-delay-[3s]" style={{ background: "oklch(0.65 0.20 300 / 0.35)", animationDelay: "3s" }} aria-hidden />
        <div className="hero-orb h-[300px] w-[300px] left-[35%] bottom-[-120px]" style={{ background: "oklch(0.75 0.13 210 / 0.30)", animationDelay: "6s" }} aria-hidden />
        {/* subtle scan lines */}
        <div className="pointer-events-none absolute inset-0 scan-line opacity-40" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-4 pt-28 pb-24 sm:pt-32 sm:pb-28">
          <div className="grid gap-14 lg:grid-cols-[1.15fr_1fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 font-mono text-[11px] backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span className="text-muted-foreground">system_online</span>
                <span className="text-primary/60">·</span>
                <span className="text-primary">anlık teslim aktif</span>
              </div>
              <h1 className="mt-7 font-mono text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02]">
                <span className="block text-muted-foreground/70 text-sm sm:text-base font-normal tracking-[0.35em] uppercase mb-3">
                  <span className="text-primary">$</span> siberlisans --init
                </span>
                <span className="block">
                  <span className="text-muted-foreground/80">&gt;</span>{" "}
                  <span className="text-foreground">lisans</span>
                  <span className="text-primary">.</span>
                  <CyberRotator />
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
                <span className="text-primary font-mono">//</span>{" "}
                <TypedLine text="Havale/EFT ile öde. Referans kodunla eşleş." delay={300} />
                <br />
                <span className="text-primary font-mono">//</span>{" "}
                <TypedLine
                  text="Anahtarın panelinde — dakikalar içinde, uçtan uca şifreli."
                  delay={1600}
                />
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg" className="font-medium neon-glow-strong">
                  <Link to="/urunler">Lisansları keşfet →</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-medium border-primary/40 hover:bg-primary/10">
                  <Link to="/nasil-calisir">Nasıl çalışır</Link>
                </Button>
              </div>

              {/* mini trust stats */}
              <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-4 max-w-md">
                {[
                  { v: `${(products?.length ?? 0)}+`, l: "aktif lisans" },
                  { v: "< 15 dk", l: "ort. onay" },
                  { v: "7/24", l: "destek" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border border-border/60 bg-card/40 backdrop-blur p-3">
                    <div className="font-mono text-lg sm:text-xl neon-text">{s.v}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px]">
                {[
                  { icon: Lock, label: "AES-256" },
                  { icon: ShieldCheck, label: "TLS 1.3" },
                  { icon: Zap, label: "Anlık" },
                  { icon: Cpu, label: "RLS" },
                ].map((b) => (
                  <div key={b.label} className="rounded-full border border-border/60 bg-background/60 px-3 py-1 flex items-center gap-1.5">
                    <b.icon className="h-3 w-3 text-primary" />
                    <span className="text-muted-foreground">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero side: terminal + floating badges */}
            <div className="hidden lg:block relative">
              {/* orbit badge top */}
              <div className="absolute -top-6 -left-6 z-10 glass-card rounded-lg px-3 py-2 font-mono text-[11px] neon-glow rotate-[-4deg]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>lisans #A9F2 teslim edildi</span>
                </div>
              </div>
              {/* orbit badge bottom */}
              <div className="absolute -bottom-6 -right-4 z-10 glass-card rounded-lg px-3 py-2 font-mono text-[11px] neon-glow rotate-[3deg]">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  <span>havuzda {(products?.length ?? 0)} ürün</span>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-1 neon-glow-strong corner-cut">
                <div className="rounded-xl border border-primary/20 bg-background/70 p-5 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                    <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                    <span className="ml-2 text-muted-foreground">siberphp@secure:~/live</span>
                    <span className="ml-auto text-primary/70">● REC</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-muted-foreground leading-relaxed">
                    <div><span className="text-primary">$</span> connect --secure</div>
                    <div className="text-primary">[✓] TLS 1.3 handshake OK</div>
                    <div className="text-primary">[✓] session encrypted · AES-256</div>
                    <div><span className="text-primary">$</span> order --stream</div>
                    <div className="text-foreground">→ <span className="text-primary">{featured.length}</span> öne çıkan ürün</div>
                    <div className="text-foreground">→ <span className="text-primary">{(products?.length ?? 0)}</span> aktif lisans</div>
                    <div className="text-foreground">→ ortalama teslim: <span className="text-primary">3.4s</span></div>
                    <div><span className="text-primary">$</span> _<span className="terminal-caret" /></div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="rounded border border-primary/20 bg-primary/5 p-1.5">
                      <div className="text-primary text-sm font-semibold">99.9%</div>
                      <div className="text-muted-foreground">uptime</div>
                    </div>
                    <div className="rounded border border-primary/20 bg-primary/5 p-1.5">
                      <div className="text-primary text-sm font-semibold">0</div>
                      <div className="text-muted-foreground">sızıntı</div>
                    </div>
                    <div className="rounded border border-primary/20 bg-primary/5 p-1.5">
                      <div className="text-primary text-sm font-semibold">A+</div>
                      <div className="text-muted-foreground">ssl</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE SALES STREAM */}
      <LiveSalesStream products={(products ?? []) as SaleProd[]} />

      {/* ARAMA + SON EKLENENLER */}
      <section className="mx-auto max-w-6xl px-4 pt-12">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults[0]) {
                navigate({ to: "/urun/$slug", params: { slug: searchResults[0].slug } });
              }
            }}
            placeholder="lisans ara… (ör. windows, chatgpt, office)"
            className="pl-9 pr-9 h-12 font-mono text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="temizle"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {search && (
            <div className="absolute z-30 mt-2 w-full glass-card rounded-lg border border-primary/40 max-h-80 overflow-auto">
              {searchResults.length > 0 ? (
                searchResults.map((p) => (
                  <Link
                    key={p.id}
                    to="/urun/$slug"
                    params={{ slug: p.slug }}
                    onClick={() => setSearch("")}
                    className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/40 last:border-0 hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">{p.category ?? "lisans"}</div>
                    </div>
                    <span className="font-mono text-sm text-primary shrink-0">
                      ₺{Number(p.price_try).toLocaleString("tr-TR")}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground font-mono text-sm">
                  sonuç bulunamadı
                </div>
              )}
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-10 glass-card rounded-xl border border-primary/30 neon-glow overflow-hidden">
            {/* terminal header */}
            <div className="relative flex items-center justify-between border-b border-border/60 bg-background/60 px-4 py-3 scan-line">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="neon-text">son eklenenler</span>
                <span className="text-muted-foreground/80">· /var/log/siberphp/new arrivals</span>
              </div>
              <Link
                to="/urunler"
                className="group inline-flex items-center gap-1 font-mono text-xs text-primary hover:text-neon transition-colors"
              >
                tümünü listele
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* cyber grid of recent arrivals */}
            <div className="relative p-4">
              <div className="pointer-events-none absolute inset-0 cyber-grid opacity-30" aria-hidden />
              <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recent.map((p) => {
                  const cv = catVisual(p.category ?? null);
                  const Icon = cv.Icon;
                  const isNew =
                    (Date.now() - new Date((p as { created_at: string }).created_at).getTime()) /
                      86400000 <
                    3;
                  return (
                    <Link
                      key={p.id}
                      to="/urun/$slug"
                      params={{ slug: p.slug }}
                      className="group relative flex flex-col gap-3 rounded-lg border border-border/60 bg-background/50 p-3 hover:border-primary/60 hover:bg-primary/[0.03] transition-all duration-300"
                    >
                      {/* ambient top gradient */}
                      <div
                        className={`pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-lg bg-gradient-to-b ${cv.grad} opacity-60`}
                        aria-hidden
                      />
                      {/* icon */}
                      <div className="relative flex items-center justify-between">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background/70 backdrop-blur"
                          style={{ borderColor: cv.ring, filter: `drop-shadow(0 0 10px ${cv.ring})` }}
                        >
                          <Icon className="h-5 w-5" style={{ color: cv.hue }} />
                        </div>
                        {isNew && (
                          <span className="rounded-full border border-cyan/50 bg-cyan/15 px-2 py-0.5 font-mono text-[10px] text-cyan animate-pulse shadow-[0_0_10px_oklch(0.75_0.13_210/0.4)]">
                            NEW
                          </span>
                        )}
                      </div>
                      {/* body */}
                      <div className="relative min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono">
                          {p.category ?? "lisans"}
                        </div>
                        <div className="mt-0.5 font-semibold text-sm leading-tight truncate group-hover:text-neon transition-colors">
                          {p.name}
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {p.description ?? "Orijinal lisans anahtarı · anında teslim."}
                        </p>
                      </div>
                      {/* footer */}
                      <div className="relative mt-auto flex items-center justify-between border-t border-border/40 pt-2.5">
                        <span className="font-mono text-[10px] text-muted-foreground/70">
                          {new Date((p as { created_at: string }).created_at).toLocaleDateString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                        <span className="font-mono text-sm font-semibold" style={{ color: cv.hue }}>
                          ₺{Number(p.price_try).toLocaleString("tr-TR")}
                        </span>
                      </div>
                      {/* hover sweep */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                          background:
                            "linear-gradient(105deg, transparent 40%, oklch(1 0 0 / 0.04) 50%, transparent 60%)",
                        }}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>


      {/* FEATURED */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-4">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                <Star className="h-3 w-3 text-warn fill-warn" /> öne çıkan
              </div>
              <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                Popüler Lisanslar
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/urunler">Tümünü gör →</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 6).map((p) => (
              <ProductCard key={p.id} p={p} featured />
            ))}
          </div>
        </section>
      )}

      {/* PRODUCTS */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 font-mono">
          <div className="text-xs text-muted-foreground">$ ls /var/licenses/available</div>
          <h2 className="mt-2 text-2xl sm:text-3xl neon-text">Aktif Lisanslar</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(products ?? []).slice(0, 9).map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
          {!products &&
            Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
        {(products?.length ?? 0) > 9 && (
          <div className="mt-8 flex justify-center">
            <Button asChild variant="outline" className="font-mono">
              <Link to="/urunler">tüm lisansları gör →</Link>
            </Button>
          </div>
        )}
      </section>


      {/* HOW IT WORKS */}
      <section id="nasil-calisir" className="relative mx-auto max-w-6xl px-4 py-20">
        <div className="mb-10 font-mono">
          <div className="text-xs text-muted-foreground">$ man siberphp</div>
          <h2 className="mt-2 text-3xl sm:text-4xl neon-text-glow">Nasıl Çalışır?</h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl font-sans">
            Dört adımda lisansın panelinde. Ortalama uçtan uca süre: <span className="text-primary">5–15 dk</span>.
          </p>
        </div>
        <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* connector line (desktop) */}
          <div className="hidden lg:block absolute top-8 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden />
          {[
            { n: "01", t: "Ürün Seç", d: "Kataloğumuzdan lisansı seç, satın al butonuna bas." },
            { n: "02", t: "Havale Yap", d: "Otomatik oluşturulan referans kodunu açıklamaya yazarak transfer et." },
            { n: "03", t: "Dekont Yükle", d: "Panel üzerinden dekont/makbuz görselini yükle." },
            { n: "04", t: "Anahtarını Al", d: "Onay sonrası key panelde ve e-postanda görünür." },
          ].map((s) => (
            <div key={s.n} className="relative glass-card glass-card-hover rounded-xl p-5 corner-cut">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 font-mono text-primary neon-glow">
                  {s.n}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              </div>
              <div className="mt-4 font-semibold tracking-tight">{s.t}</div>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="relative overflow-hidden glass-card rounded-2xl p-8 sm:p-12 scan-line neon-glow-strong">
          <div className="hero-orb h-[300px] w-[300px] -right-20 -top-20" style={{ background: "oklch(0.82 0.20 145 / 0.35)" }} aria-hidden />
          <div className="hero-orb h-[260px] w-[260px] -left-16 -bottom-16" style={{ background: "oklch(0.65 0.20 300 / 0.25)", animationDelay: "4s" }} aria-hidden />
          <div className="relative grid gap-8 md:grid-cols-2 items-center">
            <div>
              <div className="font-mono text-xs text-muted-foreground">$ security --status</div>
              <h2 className="mt-2 font-mono text-3xl sm:text-4xl neon-text-glow">
                Güvenlik Katmanları
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Her satın alma; uçtan uca şifreli aktarım, izole edilmiş key havuzu ve rol
                tabanlı erişim kontrolü ile korunur.
              </p>
              <div className="mt-5 flex gap-2 font-mono text-[10px]">
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">SOC-ready</span>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">Zero-trust</span>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">TLS 1.3</span>
              </div>
            </div>
            <ul className="space-y-2.5 font-mono text-sm">
              {[
                "Row Level Security politikaları",
                "SHA-256 imzalı sipariş referansları",
                "İzole key havuzu — atomic atama",
                "Şifreli dekont depolama",
                "Şüpheli aktivite izleme",
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 hover:border-primary/40 transition">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section id="sss" className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-8 font-mono">
          <div className="text-xs text-muted-foreground">$ cat FAQ.md</div>
          <h2 className="mt-2 text-2xl sm:text-3xl neon-text">Sık Sorulan Sorular</h2>
        </div>
        <Accordion type="single" collapsible className="glass-card rounded-lg px-6">
          {[
            {
              q: "Kredi kartı ile ödeme yapabilir miyim?",
              a: "Hayır. SiberPHP güvenlik politikası gereği yalnızca banka havalesi / EFT kabul eder.",
            },
            {
              q: "Ödeme sonrası anahtarı ne kadar sürede alırım?",
              a: "Dekont onayından sonra saniyeler içinde e-postanıza ve panelinize düşer. Ortalama onay süresi çalışma saatlerinde 5–15 dakikadır.",
            },
            {
              q: "Anahtarım çalışmazsa ne olur?",
              a: "24 saat içinde destek üzerinden ulaşırsanız yeni bir key ile değiştiririz.",
            },
            {
              q: "Faturamı alabilir miyim?",
              a: "Evet, kurumsal müşteriler için e-arşiv fatura düzenlenir.",
            },
          ].map((item, i) => (
            <AccordionItem key={i} value={`i${i}`}>
              <AccordionTrigger className="font-mono text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* SUPPORT */}
      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div className="glass-card rounded-lg p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-mono">
            <Wifi className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm">Canlı destek hattı aktif</div>
              <div className="text-xs text-muted-foreground">7/24 · Ortalama yanıt: 3 dk</div>
            </div>
          </div>
          <Button variant="outline" className="font-mono">
            <Terminal className="mr-2 h-4 w-4" />destek başlat
          </Button>
        </div>
      </section>
    </div>
  );
}

function ProductCard({
  p,
  featured,
}: {
  p: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    duration: string;
    price_try: number;
    image_url?: string | null;
    category?: string | null;
    created_at?: string;
    manual_fulfillment?: boolean | null;
    stock_hint?: number | null;
    unlimited_stock?: boolean | null;
    license_keys?: { status: string }[] | null;
  };
  featured?: boolean;
}) {
  const manual = !!p.manual_fulfillment;
  const unlimited = !!p.unlimited_stock;
  const liveStock = (p.license_keys ?? []).filter((k) => k.status === "available").length;
  const stock = liveStock > 0 ? liveStock : (p.stock_hint ?? 0);
  const soldOut = !manual && !unlimited && stock === 0;
  const isNew = p.created_at
    ? (Date.now() - new Date(p.created_at).getTime()) / 86400000 < 7
    : false;
  const showStockBar = !manual && !unlimited && stock > 0 && stock <= 10;
  return (
    <div className={`glass-card glass-card-hover rounded-xl p-5 flex flex-col group relative overflow-hidden ${featured ? "border-warn/30" : ""}`}>
      {/* corner shine on hover */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />
      {isNew && (
        <span className="absolute -top-2 -right-2 rounded-full px-2 py-0.5 font-mono text-[10px] border border-cyan/50 bg-cyan/20 text-cyan animate-pulse shadow-lg">
          ✦ YENİ
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 uppercase tracking-wider">
            {featured && <Star className="h-3 w-3 text-warn fill-warn" />}
            {p.category ?? "license"}
          </div>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight truncate">{p.name}</h3>
        </div>
        <KeyRound className="h-5 w-5 text-primary opacity-60 shrink-0" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">{p.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="rounded-md bg-muted/40 text-muted-foreground border border-border px-2 py-0.5">
          {DURATION_LABEL[p.duration] ?? p.duration}
        </span>
        <span className={`rounded-md px-2 py-0.5 border ${unlimited || manual ? "text-cyan border-cyan/40 bg-cyan/5" : soldOut ? "text-destructive border-destructive/40 bg-destructive/5" : stock <= 3 ? "text-warn border-warn/40 bg-warn/5" : "text-primary border-primary/40 bg-primary/5"}`}>
          {unlimited ? "stok: ∞" : manual ? "sipariş sonrası" : soldOut ? "tükendi" : stock <= 3 ? `son ${stock}` : `stok: ${stock}`}
        </span>
      </div>
      {showStockBar && (
        <div className="mt-3">
          <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
            <div
              className={`h-full transition-all ${stock <= 3 ? "bg-warn" : "bg-primary"}`}
              style={{ width: `${Math.min(100, stock * 10)}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-auto pt-5 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">fiyat</div>
          <div className="font-mono text-2xl font-semibold text-primary">
            ₺{Number(p.price_try).toLocaleString("tr-TR")}
          </div>
        </div>
        <Button asChild size="sm" disabled={soldOut}>
          <Link to="/urun/$slug" params={{ slug: p.slug }}>
            {soldOut ? "tükendi" : "Satın al →"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
