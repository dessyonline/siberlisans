import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";

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
  license_keys: { status: string }[] | null;
};

const GROUPS: { key: string; label: string; cats: string[] }[] = [
  { key: "windows", label: "Windows", cats: ["Windows 10/11", "Windows Server"] },
  {
    key: "gorsel",
    label: "Görsel & Tasarım",
    cats: ["Adobe", "Envato Elements", "Freepik", "Canva", "Vecteezy", "Flaticon", "Motion Array", "CorelDRAW", "Autodesk"],
  },
  { key: "ai", label: "Yapay Zeka", cats: ["Google Gemini", "Nano Banana", "Midjourney", "Ideogram"] },
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
        .select("id, name, slug, description, duration, price_try, category, image_url, manual_fulfillment, stock_hint, license_keys(status)")
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

  const visible = useMemo(() => {
    const entries = Array.from(byCategory.entries());
    if (group === "all") return entries;
    return entries.filter(([cat]) => groupOf(cat) === group);
  }, [byCategory, group]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="font-mono mb-8">
        <div className="text-xs text-muted-foreground">$ ls /catalog</div>
        <h1 className="mt-2 text-3xl neon-text">Tüm Lisanslar</h1>
      </div>

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

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((p) => {
                  const stock = (p.license_keys ?? []).filter((k) => k.status === "available").length;
                  const stockLabel = stock === 0 ? "tükendi" : stock < 3 ? `son ${stock}` : "stokta";
                  const stockCls =
                    stock === 0
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
                        </div>
                      )}
                      <div className="p-5 flex flex-col flex-1">
                        <h3 className="font-mono text-base font-semibold">{p.name}</h3>
                        {p.description && (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2 font-mono text-[10px]">
                          <span className="rounded bg-primary/10 text-primary border border-primary/30 px-2 py-0.5">
                            {DUR[p.duration] ?? p.duration}
                          </span>
                          <span className={`rounded px-2 py-0.5 border ${stockCls}`}>● {stockLabel}</span>
                        </div>
                        <div className="mt-auto pt-4 flex items-end justify-between">
                          <div className="font-mono text-xl neon-text">
                            ₺{Number(p.price_try).toLocaleString("tr-TR")}
                          </div>
                          <Button asChild size="sm" className="font-mono" disabled={stock === 0}>
                            <Link to="/urun/$slug" params={{ slug: p.slug }}>
                              {stock === 0 ? "tükendi" : "al →"}
                            </Link>
                          </Button>
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
