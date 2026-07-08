import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, X, Sparkles, TrendingUp, Zap, ShieldCheck, ArrowRight, Package, Star, Crown,
} from "lucide-react";


export const Route = createFileRoute("/urunler")({
  component: ProductsPage,
  head: () => ({
    meta: [
      { title: "Lisans Kataloğu — SiberPHP" },
      {
        name: "description",
        content:
          "Windows, Office, Adobe, ChatGPT, Midjourney ve daha fazlası. Havale/EFT ile anında teslim edilen orijinal lisans anahtarları.",
      },
      { property: "og:title", content: "Lisans Kataloğu — SiberPHP" },
      {
        property: "og:description",
        content: "Anında teslim edilen orijinal yazılım lisansları — Windows, Office, Adobe, AI araçları ve daha fazlası.",
      },
      { property: "og:url", content: "https://siberlisans.lovable.app/urunler" },
    ],
    links: [{ rel: "canonical", href: "https://siberlisans.lovable.app/urunler" }],
  }),
});

const DUR: Record<string, string> = { monthly: "aylık", yearly: "yıllık", lifetime: "ömürlük" };



// Cyber-styled product title — terminal prompt + hover caret + glitch
function CyberTitle({
  name,
  size = "base",
  color = "primary",
}: {
  name: string;
  size?: "sm" | "base";
  color?: "primary" | "warn" | "cyan";
}) {
  const hoverText = color === "warn" ? "group-hover:text-warn" : color === "cyan" ? "group-hover:text-cyan" : "group-hover:text-primary";
  const caretBg = color === "warn" ? "bg-warn" : color === "cyan" ? "bg-cyan" : "bg-primary";
  const sizeCls = size === "sm" ? "text-sm" : "text-base";
  return (
    <h3 className={`font-mono ${sizeCls} font-semibold tracking-tight flex items-baseline gap-1.5 min-w-0`}>
      <span className="text-muted-foreground/60 shrink-0 select-none">&gt;</span>
      <span className={`truncate transition-colors ${hoverText} group-hover:glitch`}>{name}</span>
      <span
        aria-hidden
        className={`caret-blink inline-block w-[2px] h-[0.9em] translate-y-[0.05em] ${caretBg} opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_8px_currentColor] shrink-0`}
      />
    </h3>
  );
}


type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration: string;
  price_try: number;
  category: string | null;
  image_url: string | null;
  manual_fulfillment: boolean | null;
  stock_hint: number | null;
  unlimited_stock: boolean | null;
  created_at: string;
  sort_order?: number | null;
  tier?: string | null;
  license_keys: { status: string }[] | null;
};

// Kategori grupları — talep sırasına göre: AI en önce, sonra görsel/office...
const GROUPS: { key: string; label: string; cats: string[] }[] = [
  { key: "ai", label: "Yapay Zeka", cats: ["ChatGPT", "Google Gemini", "Lovable", "Claude", "Nano Banana", "Midjourney", "Ideogram"] },
  {
    key: "gorsel",
    label: "Görsel & Tasarım",
    cats: ["Adobe", "Envato Elements", "Freepik", "Canva", "Vecteezy", "Flaticon", "Motion Array", "CorelDRAW", "Autodesk"],
  },
  { key: "office", label: "Microsoft Office", cats: ["Office (Ömürlük)", "Office 365"] },
  { key: "windows", label: "Windows", cats: ["Windows 10/11", "Windows Server"] },
  { key: "oyun", label: "Oyunlar", cats: ["Steam Oyunları"] },
  { key: "email", label: "E-posta", cats: ["Email Hesapları"] },
];

function groupOf(cat: string | null): string {
  const c = cat ?? "Diğer";
  return GROUPS.find((g) => g.cats.includes(c))?.key ?? "diger";
}


function ProductsPage() {
  const { data } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, category, image_url, manual_fulfillment, stock_hint, unlimited_stock, created_at, sort_order, tier, license_keys(status)")
        .eq("active", true)
        .order("price_try");
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const byCategory = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const p of data ?? []) {
      const cat = p.category ?? "Diğer";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return map;
  }, [data]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [cat, items] of byCategory) {
      const g = groupOf(cat);
      counts.set(g, (counts.get(g) ?? 0) + items.length);
    }
    return counts;
  }, [byCategory]);

  const [group, setGroup] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Ortak admin sıralaması: destansı → sıra → tarih
  const adminOrder = (list: Row[]) =>
    [...list].sort((a, b) => {
      const ea = a.tier === "epic" ? 0 : 1;
      const eb = b.tier === "epic" ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const sa = a.sort_order ?? 0;
      const sb = b.sort_order ?? 0;
      if (sa !== sb) return sb - sa;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const recent = useMemo(() => adminOrder(data ?? []).slice(0, 8), [data]);

  const hot = useMemo(() => {
    // En çok tercih edilenler: destansı olanlar > sıra > fiyat
    return [...(data ?? [])]
      .filter((p) => !p.manual_fulfillment && !p.unlimited_stock)
      .sort((a, b) => {
        const ea = a.tier === "epic" ? 0 : 1;
        const eb = b.tier === "epic" ? 0 : 1;
        if (ea !== eb) return ea - eb;
        const sa = a.sort_order ?? 0;
        const sb = b.sort_order ?? 0;
        if (sa !== sb) return sb - sa;
        return (b.price_try ?? 0) - (a.price_try ?? 0);
      })
      .slice(0, 3);
  }, [data]);

  // Kategori sıralama önceliği: GROUPS sırası + AI içi (ChatGPT, Gemini, Lovable, ...)
  const catPriority = (cat: string): number => {
    const g = groupOf(cat);
    const gIdx = GROUPS.findIndex((x) => x.key === g);
    const baseGroup = gIdx === -1 ? 99 : gIdx;
    const group = GROUPS[gIdx];
    const inCat = group ? group.cats.indexOf(cat) : -1;
    return baseGroup * 100 + (inCat === -1 ? 50 : inCat);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const entries = Array.from(byCategory.entries()).map(([cat, items]) => {
      let list = items;
      if (q) {
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q) ||
            (p.category ?? "").toLowerCase().includes(q),
        );
      }
      // Kategori içi: destansı önce, sonra sort_order yüksek olan, sonra fiyat
      list = [...list].sort((a, b) => {
        const ea = a.tier === "epic" ? 0 : 1;
        const eb = b.tier === "epic" ? 0 : 1;
        if (ea !== eb) return ea - eb;
        const sa = a.sort_order ?? 0;
        const sb = b.sort_order ?? 0;
        if (sa !== sb) return sb - sa;
        return (a.price_try ?? 0) - (b.price_try ?? 0);
      });
      return [cat, list] as [string, Row[]];
    });
    const filtered = group === "all" ? entries : entries.filter(([cat]) => groupOf(cat) === group);
    const nonEmpty = filtered.filter(([, items]) => items.length > 0);
    // Kategoriler arası: GROUPS sırasına göre
    return nonEmpty.sort(([a], [b]) => catPriority(a) - catPriority(b));
  }, [byCategory, group, search]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient cyber-grid background */}
      <div className="pointer-events-none absolute inset-0 -z-10 cyber-grid grid-drift opacity-40" />
      <div className="pointer-events-none absolute -top-40 right-0 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-[320px] w-[320px] rounded-full bg-cyan/10 blur-[100px]" />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        {/* Hero / terminal header */}
        <section className="relative mb-8 overflow-hidden rounded-2xl border border-primary/20 bg-background/60 p-6 sm:p-8">
          <div className="absolute inset-0 scan-line opacity-60" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="font-mono text-xs text-primary/80">
                <span className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2 py-0.5">
                  <Zap className="h-3 w-3" /> KATALOG_V2.0
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className="neon-text">Tüm</span> Lisanslar
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                Orijinal yazılım, AI araçları ve oyun lisansları. Havale/EFT ile hızlı teslimat, otomatik aktivasyon.
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Güvenli ödeme
              </span>
              <span className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-primary" /> {data?.length ?? 0} ürün
              </span>
            </div>
          </div>
        </section>

        {/* Search + filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="lisans ara… (ör. windows, chatgpt, office)"
              className="pl-9 pr-9 h-11 font-mono border-primary/20 bg-background/60 focus-visible:ring-primary/40"
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
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            <CatChip label={`hepsi · ${data?.length ?? 0}`} active={group === "all"} onClick={() => setGroup("all")} />
            {GROUPS.map((g) => (
              <CatChip
                key={g.key}
                label={`${g.label} · ${groupCounts.get(g.key) ?? 0}`}
                active={group === g.key}
                onClick={() => setGroup(g.key)}
              />
            ))}
          </div>
        </div>

        {/* Hot picks */}
        {!search && hot.length > 0 && (
          <section className="mb-10">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs">
              <TrendingUp className="h-3.5 w-3.5 text-warn" />
              <span className="neon-text">popüler seçimler</span>
              <span className="text-muted-foreground">· çok satan</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hot.map((p) => (
                <HotCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* Recently added */}
        {!search && recent.length > 0 && (
          <section className="mb-10 glass-card rounded-lg p-4 border border-primary/20">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="neon-text">son eklenen lisanslar</span>
              <span className="text-muted-foreground">· güncel</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((p) => (
                <Link
                  key={p.id}
                  to="/urun/$slug"
                  params={{ slug: p.slug }}
                  className="group flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-3 py-2 hover:border-primary/50 hover:bg-primary/5 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs truncate group-hover:text-primary transition-colors">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.category ?? "lisans"} ·{" "}
                      {new Date(p.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-primary shrink-0">
                    ₺{Number(p.price_try).toLocaleString("tr-TR")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {visible.length === 0 && search && (
          <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground border-dashed border-primary/20">
            "{search}" için sonuç bulunamadı.
          </div>
        )}

        {/* Category sections */}
        <div className="space-y-14">
          {visible.map(([cat, items]) => {
            const cover = items.find((p) => p.image_url)?.image_url ?? null;
            return (
              <section key={cat}>
                <div className="mb-5 flex items-center gap-4 border-b border-border/60 pb-3">
                  {cover && (
                    <div className="h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border/60 corner-cut">
                      <img src={cover} alt={cat} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="font-mono">
                    <div className="text-[10px] text-muted-foreground">./{cat.toLowerCase().replace(/\s+/g, "-")}</div>
                    <h2 className="text-xl neon-text sm:text-2xl">{cat}</h2>
                  </div>
                  <div className="ml-auto font-mono text-xs text-muted-foreground">
                    {items.length} varyant
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product: p }: { product: Row }) {
  const manual = !!p.manual_fulfillment;
  const unlimited = !!p.unlimited_stock;
  const liveStock = (p.license_keys ?? []).filter((k) => k.status === "available").length;
  const stock = liveStock > 0 ? liveStock : (p.stock_hint ?? 0);
  const soldOut = !manual && !unlimited && stock === 0;
  const stockLabel = unlimited
    ? "stok: ∞"
    : manual
    ? "sipariş sonrası"
    : soldOut
    ? "tükendi"
    : stock < 3
    ? `son ${stock}`
    : `stok: ${stock}`;
  const stockCls = unlimited
    ? "text-cyan border-cyan/40 bg-cyan/10"
    : manual
    ? "text-cyan border-cyan/40 bg-cyan/10"
    : soldOut
    ? "text-destructive border-destructive/40 bg-destructive/10"
    : stock < 3
    ? "text-warn border-warn/40 bg-warn/10 animate-pulse"
    : "text-primary border-primary/30 bg-primary/10";
  const isNew = (Date.now() - new Date(p.created_at).getTime()) / 86400000 < 7;
  const epic = p.tier === "epic";

  return (
    <div className={`group relative rounded-xl overflow-hidden flex flex-col glass-card-hover ${epic ? "epic-card border border-transparent" : "glass-card border border-border/60"}`}>
      {epic && <div className="pointer-events-none absolute inset-0 epic-shimmer" aria-hidden />}
      <div className="pointer-events-none absolute inset-0 cyber-grid opacity-20" aria-hidden />

      <div className="relative p-4 flex flex-col flex-1">
        {/* Top row: category + badges */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary uppercase tracking-wider">
            <Star className="h-3 w-3 shrink-0 fill-primary" />
            <span className="truncate">{p.category ?? "lisans"}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {epic && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[oklch(0.78_0.16_75)] bg-[oklch(0.78_0.16_75/0.15)] px-2 py-0.5 font-mono text-[9px] text-[oklch(0.88_0.16_75)] uppercase tracking-wider shadow-[0_0_14px_oklch(0.78_0.16_75/0.45)]">
                <Crown className="h-3 w-3 shrink-0" /> epic
              </span>
            )}
            {isNew && !epic && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan/50 bg-cyan/15 px-2 py-0.5 font-mono text-[9px] text-cyan uppercase tracking-wider">
                <Sparkles className="h-3 w-3 shrink-0" /> yeni
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <CyberTitle name={p.name} size="base" color={epic ? "warn" : "primary"} />

        {/* Description */}
        {p.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
        )}

        {/* Badges */}
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="rounded-full bg-primary/10 text-primary border border-primary/30 px-2.5 py-1">
            {DUR[p.duration] ?? p.duration}
          </span>
          <span className={`rounded-full px-2.5 py-1 border ${stockCls}`}>
            {stockLabel}
          </span>
        </div>

        {/* Price + CTA */}
        <div className="mt-auto pt-4 flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-0.5">fiyat</div>
            <div className={`font-mono text-2xl leading-none ${epic ? "text-[oklch(0.90_0.14_85)] epic-text-glow" : "neon-text"}`}>
              ₺{Number(p.price_try).toLocaleString("tr-TR")}
            </div>
          </div>
          <Button asChild size="sm" className="font-mono bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_oklch(0.82_0.20_145/0.35)] transition-all">
            <Link to="/urun/$slug" params={{ slug: p.slug }} className="flex items-center gap-1">
              Satın al <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function HotCard({ product: p }: { product: Row }) {
  const isNew = (Date.now() - new Date(p.created_at).getTime()) / 86400000 < 7;
  return (
    <Link
      to="/urun/$slug"
      params={{ slug: p.slug }}
      className="group relative overflow-hidden rounded-xl border border-warn/30 bg-gradient-to-br from-warn/10 to-background/80 p-4 transition-all hover:border-warn/60 hover:shadow-[0_0_40px_oklch(0.75_0.18_80/0.15)]"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-warn/40 bg-warn/15">
          <TrendingUp className="h-6 w-6 text-warn" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CyberTitle name={p.name} size="sm" color="warn" />
            {isNew && <span className="rounded border border-cyan/50 bg-cyan/20 px-1.5 py-0 text-[9px] text-cyan">YENİ</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.description ?? p.category}</p>
          <div className="mt-2 font-mono text-sm text-warn">
            ₺{Number(p.price_try).toLocaleString("tr-TR")}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-warn opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 transition-all ${
        active
          ? "border-primary bg-primary/15 text-primary neon-glow"
          : "border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      {label}
    </button>
  );
}
