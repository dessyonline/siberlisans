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
import { ProductLogo } from "@/components/ProductLogo";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth-context";
import { Wallet } from "lucide-react";

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
  "Windows 10/11": { Icon: MonitorSmartphone, hue: "oklch(0.75 0.13 210)", ring: "oklch(0.75 0.13 210 / 0.4)", grad: "from-[oklch(0.75_0.13_210/0.25)] to-transparent" },
  "Windows Server":{ Icon: MonitorSmartphone, hue: "oklch(0.75 0.13 210)", ring: "oklch(0.75 0.13 210 / 0.4)", grad: "from-[oklch(0.75_0.13_210/0.25)] to-transparent" },
  "Görsel & Tasarım": { Icon: Palette,       hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  Adobe:           { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  Canva:           { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  CorelDRAW:       { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  "Envato Elements":{ Icon: Palette,          hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  Flaticon:        { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  Freepik:         { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  "Motion Array":  { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  Vecteezy:        { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  "Nano Banana":   { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  Autodesk:        { Icon: Palette,           hue: "oklch(0.72 0.20 320)", ring: "oklch(0.72 0.20 320 / 0.4)", grad: "from-[oklch(0.72_0.20_320/0.25)] to-transparent" },
  "Yapay Zeka":    { Icon: Brain,             hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
  ChatGPT:         { Icon: Brain,             hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
  "Google Gemini": { Icon: Brain,             hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
  Ideogram:        { Icon: Brain,             hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
  Midjourney:      { Icon: Brain,             hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
  "Microsoft Office": { Icon: FileText,       hue: "oklch(0.65 0.20 25)",  ring: "oklch(0.65 0.20 25 / 0.4)",  grad: "from-[oklch(0.65_0.20_25/0.25)] to-transparent" },
  "Office 365":    { Icon: FileText,          hue: "oklch(0.65 0.20 25)",  ring: "oklch(0.65 0.20 25 / 0.4)",  grad: "from-[oklch(0.65_0.20_25/0.25)] to-transparent" },
  "Office (Ömürlük)": { Icon: FileText,       hue: "oklch(0.65 0.20 25)",  ring: "oklch(0.65 0.20 25 / 0.4)",  grad: "from-[oklch(0.65_0.20_25/0.25)] to-transparent" },
  Oyunlar:         { Icon: Gamepad2,          hue: "oklch(0.68 0.22 340)", ring: "oklch(0.68 0.22 340 / 0.4)", grad: "from-[oklch(0.68_0.22_340/0.25)] to-transparent" },
  "Steam Oyunları":{ Icon: Gamepad2,          hue: "oklch(0.68 0.22 340)", ring: "oklch(0.68 0.22 340 / 0.4)", grad: "from-[oklch(0.68_0.22_340/0.25)] to-transparent" },
  "E-posta":       { Icon: Mail,              hue: "oklch(0.78 0.16 220)", ring: "oklch(0.78 0.16 220 / 0.4)", grad: "from-[oklch(0.78_0.16_220/0.25)] to-transparent" },
  "Email Hesapları": { Icon: Mail,            hue: "oklch(0.78 0.16 220)", ring: "oklch(0.78 0.16 220 / 0.4)", grad: "from-[oklch(0.78_0.16_220/0.25)] to-transparent" },
  Diğer:           { Icon: Cpu,               hue: "oklch(0.82 0.20 145)", ring: "oklch(0.82 0.20 145 / 0.4)", grad: "from-[oklch(0.82_0.20_145/0.20)] to-transparent" },
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

function Index() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, image_url, category, featured, manual_fulfillment, stock_hint, unlimited_stock, created_at, sort_order, tier, license_keys(status)")
        .eq("active", true)
        .order("price_try");
      if (error) throw error;
      return data;
    },
  });

  // AI ürünlerini üstte gösterme sırası
  const AI_ORDER = ["chatgpt", "gemini", "lovable", "claude", "midjourney", "nano banana", "ideogram"];
  const aiRank = (cat?: string | null) => {
    const c = (cat ?? "").toLowerCase();
    const i = AI_ORDER.findIndex((k) => c.includes(k));
    return i === -1 ? 99 : i;
  };
  const featured = useMemo(() => {
    return [...(products ?? [])]
      .filter((p) => (p as { featured: boolean }).featured)
      .sort((a, b) => {
        const ra = aiRank((a as { category?: string | null }).category);
        const rb = aiRank((b as { category?: string | null }).category);
        if (ra !== rb) return ra - rb;
        const ea = ((a as { tier?: string }).tier === "epic") ? 0 : 1;
        const eb = ((b as { tier?: string }).tier === "epic") ? 0 : 1;
        if (ea !== eb) return ea - eb;
        const sa = (a as { sort_order?: number }).sort_order ?? 0;
        const sb = (b as { sort_order?: number }).sort_order ?? 0;
        if (sa !== sb) return sb - sa;
        return 0;
      });
  }, [products]);

  // Genel sıralama yardımcısı: destansı → sıra → tarih
  const adminOrder = (list: typeof products) =>
    [...(list ?? [])].sort((a, b) => {
      const ea = ((a as { tier?: string }).tier === "epic") ? 0 : 1;
      const eb = ((b as { tier?: string }).tier === "epic") ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const sa = (a as { sort_order?: number }).sort_order ?? 0;
      const sb = (b as { sort_order?: number }).sort_order ?? 0;
      if (sa !== sb) return sb - sa;
      return (
        new Date((b as { created_at: string }).created_at).getTime() -
        new Date((a as { created_at: string }).created_at).getTime()
      );
    });

  const recent = useMemo(() => adminOrder(products).slice(0, 8), [products]);
  const activeSorted = useMemo(() => adminOrder(products), [products]);

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
          <div className="mt-10 rounded-xl border border-border/60 bg-background/40 overflow-hidden">
            {/* terminal header */}
            <div className="flex items-center justify-between border-b border-border/60 bg-background/60 px-4 py-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-primary">son eklenenler</span>
                <span className="text-muted-foreground/80">· /var/log/siberphp/new arrivals</span>
              </div>
              <Link
                to="/urunler"
                className="group inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline transition-colors"
              >
                tümünü listele
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* terminal list of recent arrivals */}
            <div className="divide-y divide-border/30 font-mono text-xs">
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
                    className="group flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: cv.hue }} />
                    <span className="hidden sm:inline text-muted-foreground/70 uppercase w-20 shrink-0">
                      {p.category ?? "lisans"}
                    </span>
                    <span className="text-primary/50 shrink-0">&gt;</span>
                    <span className="text-foreground/90 truncate flex-1 min-w-0 group-hover:text-primary transition-colors">
                      {p.name}
                    </span>
                    <span className="hidden md:inline text-muted-foreground/50 shrink-0">
                      {new Date((p as { created_at: string }).created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                    <span className="text-primary shrink-0 tabular-nums">
                      ₺{Number(p.price_try).toLocaleString("tr-TR")}
                    </span>
                    {isNew && (
                      <span className="rounded border border-cyan/30 bg-cyan/10 px-1.5 py-0 text-[10px] text-cyan">
                        NEW
                      </span>
                    )}
                  </Link>
                );
              })}
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
          {activeSorted.slice(0, 9).map((p) => (
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

function CyberStockLoader({
  stock, manual, unlimited, soldOut, cells = 18,
}: { stock: number; manual: boolean; unlimited: boolean; soldOut: boolean; cells?: number }) {
  const mode = soldOut ? "offline" : unlimited ? "infinite" : manual ? "queue" : "stock";
  const cap = mode === "stock" ? Math.min(20, Math.max(3, stock * 2)) : cells;
  const filled =
    mode === "infinite" ? cells :
    mode === "queue"    ? Math.round(cells * 0.35) :
    mode === "offline"  ? 0 :
    Math.min(cells, Math.max(1, Math.round((stock / cap) * cells)));
  const pct =
    mode === "infinite" ? 100 :
    mode === "offline"  ? 0 :
    mode === "queue"    ? null :
    Math.round((filled / cells) * 100);
  const color =
    mode === "offline"  ? "text-destructive" :
    mode === "infinite" ? "text-cyan" :
    mode === "queue"    ? "text-cyan" :
    stock <= 3 ? "text-warn" : "text-primary";
  const bar =
    mode === "offline"  ? "bg-destructive" :
    mode === "infinite" ? "bg-cyan" :
    mode === "queue"    ? "bg-cyan" :
    stock <= 3 ? "bg-warn" : "bg-primary";
  const label =
    mode === "offline"  ? "OFFLINE" :
    mode === "infinite" ? "READY" :
    mode === "queue"    ? "QUEUE" :
    stock <= 3 ? "LOW" : "OK";

  return (
    <div className="mt-3 font-mono select-none">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.22em] mb-1">
        <span className="text-muted-foreground/80">
          <span className="text-primary/60">$</span> stock.load
        </span>
        <span className={`inline-flex items-center gap-1.5 ${color}`}>
          <span className={`h-1 w-1 rounded-full ${bar} ${mode === "offline" ? "" : "animate-pulse"} shadow-[0_0_6px_currentColor]`} />
          {label}
          {pct !== null && <span className="text-muted-foreground/60">· {pct}%</span>}
        </span>
      </div>
      <div className="relative flex gap-[2px] h-2 rounded-sm bg-background/60 border border-border/50 p-[2px] overflow-hidden">
        {Array.from({ length: cells }).map((_, i) => {
          const isFilled = i < filled;
          const isEdge = mode === "stock" && i === filled - 1 && stock <= 3;
          return (
            <span
              key={i}
              className={`flex-1 rounded-[1px] transition-colors ${
                isFilled ? `${bar} ${isEdge ? "cell-flicker" : ""} shadow-[0_0_4px_currentColor]` : "bg-muted/25"
              }`}
            />
          );
        })}
        {mode !== "offline" && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/3 bar-shimmer opacity-70"
            style={{ background: "linear-gradient(90deg, transparent 0%, oklch(1 0 0 / 0.35) 50%, transparent 100%)" }}
          />
        )}
        {mode === "queue" && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-[30%] bar-scan"
            style={{ background: "linear-gradient(90deg, transparent, oklch(0.78 0.16 220 / 0.55), transparent)" }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground/70">
        <span>
          {mode === "offline" && "// havuzda anahtar yok"}
          {mode === "infinite" && "// anlık teslim · sınırsız kaynak"}
          {mode === "queue" && "// sipariş sonrası tedarik"}
          {mode === "stock" && `// havuzda ${stock} anahtar hazır`}
        </span>
        <span className="text-muted-foreground/50 hidden sm:inline">
          [{filled.toString().padStart(2, "0")}/{cells}]
        </span>
      </div>
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
    tier?: string | null;
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
  const epic = p.tier === "epic";
  return (
    <div
      className={`glass-card glass-card-hover rounded-xl p-5 flex flex-col group relative overflow-hidden ${
        epic
          ? "epic-card border-transparent"
          : featured
          ? "border-warn/30"
          : ""
      }`}
    >
      {/* epic ambient glow */}
      {epic && (
        <>
          <div className="pointer-events-none absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_20%_10%,rgba(217,166,52,0.18),transparent_55%),radial-gradient(circle_at_85%_90%,rgba(155,89,255,0.16),transparent_55%)]" aria-hidden />
          <div className="pointer-events-none absolute inset-0 epic-shimmer" aria-hidden />
        </>
      )}
      {/* corner shine on hover */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />

      {/* Top row: category + tier badges — no absolute overlaps */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-mono flex items-center gap-1.5 uppercase tracking-wider ${epic ? "text-[oklch(0.85_0.15_75)]" : "text-muted-foreground"}`}>
            {epic ? <Star className="h-3 w-3 fill-current shrink-0" /> : featured && <Star className="h-3 w-3 text-warn fill-warn shrink-0" />}
            <span className="truncate">{p.category ?? "license"}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {epic && (
            <span className="rounded-full px-2 py-0.5 font-mono text-[10px] border border-[oklch(0.78_0.16_75)] bg-[oklch(0.78_0.16_75/0.15)] text-[oklch(0.85_0.15_75)] shadow-[0_0_18px_oklch(0.78_0.16_75/0.45)] uppercase tracking-widest">
              ★ EPIC
            </span>
          )}
          {isNew && !epic && (
            <span className="rounded-full px-2 py-0.5 font-mono text-[10px] border border-cyan/50 bg-cyan/20 text-cyan animate-pulse shadow-lg">
              ✦ YENİ
            </span>
          )}
          <ProductLogo
            name={p.name}
            src={p.image_url}
            className="h-10 w-10 rounded-md border border-border/50 bg-background/70"
            fallback={<KeyRound className={`h-5 w-5 ${epic ? "text-[oklch(0.85_0.15_75)]" : "text-primary opacity-60"}`} />}
          />
        </div>
      </div>

      <h3 className={`relative mt-1.5 text-lg font-semibold tracking-tight truncate ${epic ? "epic-text-glow" : ""}`}>{p.name}</h3>
      <p className="relative mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">{p.description}</p>

      <div className="relative mt-4 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="rounded-md bg-muted/40 text-muted-foreground border border-border px-2 py-0.5">
          {DURATION_LABEL[p.duration] ?? p.duration}
        </span>
      </div>

      <CyberStockLoader stock={stock} manual={manual} unlimited={unlimited} soldOut={soldOut} />

      <div className="relative mt-auto pt-5 flex items-end justify-between">
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 shadow-[0_0_20px_oklch(0.82_0.20_145/0.18)]">
          <div className="text-[9px] uppercase tracking-[0.25em] text-primary/70 font-mono mb-0.5">fiyat</div>
          <div className={`font-mono text-3xl font-bold tracking-tight neon-text ${epic ? "text-[oklch(0.88_0.15_75)] epic-text-glow" : "text-primary"}`}>
            ₺{Number(p.price_try).toLocaleString("tr-TR")}
          </div>
        </div>
        <Button asChild size="sm" disabled={soldOut} className={epic ? "bg-[oklch(0.78_0.16_75)] hover:bg-[oklch(0.72_0.16_75)] text-black" : ""}>
          <Link to="/urun/$slug" params={{ slug: p.slug }}>
            {soldOut ? "tükendi" : "Satın al →"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
