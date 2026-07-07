import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Search, X, Sparkles } from "lucide-react";

export const Route = createFileRoute("/urunler")({
  component: ProductsPage,
  head: () => ({
    meta: [
      { title: "Lisanslar — SiberPHP" },
      { name: "description", content: "SiberPHP lisans kataloğu. Havale/EFT ile güvenli teslimat." },
    ],
  }),
});

const DUR: Record<string, string> = { monthly: "aylık", yearly: "yıllık", lifetime: "ömürlük" };

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
  license_keys: { status: string }[] | null;
};

const GROUPS: { key: string; label: string; cats: string[] }[] = [
  { key: "windows", label: "Windows", cats: ["Windows 10/11", "Windows Server"] },
  {
    key: "gorsel",
    label: "Görsel & Tasarım",
    cats: ["Adobe", "Envato Elements", "Freepik", "Canva", "Vecteezy", "Flaticon", "Motion Array", "CorelDRAW", "Autodesk"],
  },
  { key: "ai", label: "Yapay Zeka", cats: ["ChatGPT", "Google Gemini", "Nano Banana", "Midjourney", "Ideogram"] },
  { key: "office", label: "Microsoft Office", cats: ["Office (Ömürlük)", "Office 365"] },
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
        .select("id, name, slug, description, duration, price_try, category, image_url, manual_fulfillment, stock_hint, unlimited_stock, created_at, license_keys(status)")
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

  const recent = useMemo(() => {
    return [...(data ?? [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);
  }, [data]);

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
      return [cat, list] as [string, Row[]];
    });
    const filtered = group === "all" ? entries : entries.filter(([cat]) => groupOf(cat) === group);
    return filtered.filter(([, items]) => items.length > 0);
  }, [byCategory, group, search]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="font-mono mb-6">
        <div className="text-xs text-muted-foreground">$ ls /catalog</div>
        <h1 className="mt-2 text-3xl neon-text">Tüm Lisanslar</h1>
      </div>

      {/* ARAMA */}
      <div className="mb-6 relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="lisans ara… (ör. windows, chatgpt, office)"
          className="pl-9 pr-9 h-11 font-mono"
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

      {/* SON EKLENENLER */}
      {!search && recent.length > 0 && (
        <section className="mb-10 glass-card rounded-lg p-4 border border-primary/30">
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
                className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-3 py-2 hover:border-primary/50 hover:bg-primary/5 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs truncate">{p.name}</div>
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

      <div className="mb-8 flex flex-wrap gap-2 font-mono text-xs">
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

      {visible.length === 0 && search && (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground">
          "{search}" için sonuç bulunamadı.
        </div>
      )}

      <div className="space-y-12">
        {visible.map(([cat, items]) => {
          const cover = items.find((p) => p.image_url)?.image_url ?? null;
          return (
            <section key={cat}>
              <div className="mb-4 flex items-center gap-4">
                {cover && (
                  <div className="h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border/60">
                    <img src={cover} alt={cat} loading="lazy" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="font-mono">
                  <div className="text-[10px] text-muted-foreground">./{cat.toLowerCase().replace(/\s+/g, "-")}</div>
                  <h2 className="text-xl neon-text">{cat}</h2>
                </div>
                <div className="ml-auto font-mono text-xs text-muted-foreground">
                  {items.length} varyant
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => {
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
                  return (
                    <div key={p.id} className="glass-card rounded-lg overflow-hidden flex flex-col">
                      {p.image_url && (
                        <div className="relative h-32 overflow-hidden border-b border-border/60">
                          <img
                            src={p.image_url}
                            alt={p.name}
                            loading="lazy"
                            className="h-full w-full object-cover opacity-70"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                          <KeyRound className="absolute right-3 top-3 h-5 w-5 text-primary" />
                          <span
                            className={`absolute left-3 top-3 rounded px-2 py-0.5 font-mono text-[10px] border ${
                              manual
                                ? "border-warn/50 bg-warn/15 text-warn"
                                : "border-primary/40 bg-primary/15 text-primary"
                            }`}
                          >
                            {manual ? "manuel teslimat" : "otomatik teslimat"}
                          </span>
                        </div>
                      )}
                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="font-mono text-base font-semibold">{p.name}</h3>
                        {p.description && (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px]">
                          <span className="rounded bg-primary/10 text-primary border border-primary/30 px-2 py-0.5">
                            {DUR[p.duration] ?? p.duration}
                          </span>
                          <span className={`rounded px-2 py-0.5 border ${stockCls}`}>● {stockLabel}</span>
                        </div>
                        <div className="mt-auto pt-4">
                          <div className="mb-3 font-mono text-xl neon-text">
                            ₺{Number(p.price_try).toLocaleString("tr-TR")}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <Button asChild variant="outline" size="sm" className="font-mono flex-1">
                              <Link to="/urun/$slug" params={{ slug: p.slug }}>İncele</Link>
                            </Button>
                            <Button asChild size="sm" className="font-mono flex-1" disabled={soldOut}>
                              <Link to="/urun/$slug" params={{ slug: p.slug }}>
                                {soldOut ? "tükendi" : "Satın Al"}
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-3 py-1 transition ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}
