import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductsForCompare } from "@/lib/storefront.functions";
import { useCompare } from "@/lib/compare-store";
import { Button } from "@/components/ui/button";
import { Check, Minus, X, GitCompare } from "lucide-react";

export const Route = createFileRoute("/karsilastir")({
  head: () => ({
    meta: [
      { title: "Ürün Karşılaştırma | SiberLisans" },
      {
        name: "description",
        content: "Seçtiğin lisans ve dijital ürünleri fiyat, süre, stok ve teslimat şekline göre yan yana karşılaştır.",
      },
      { property: "og:title", content: "Ürün Karşılaştırma | SiberLisans" },
      {
        property: "og:description",
        content: "Lisansları fiyat, süre, stok ve teslimat şekline göre yan yana karşılaştır.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComparePage,
});

const DURATION_LABEL: Record<string, string> = {
  monthly: "Aylık",
  yearly: "Yıllık",
  lifetime: "Ömür boyu",
  hourly: "Saatlik",
  daily: "Günlük",
  weekly: "Haftalık",
};

const DELIVERY_LABEL: Record<string, string> = {
  key: "Lisans anahtarı",
  account: "Hesap (mail:şifre)",
  link: "İndirme linki",
  link_token: "Aktivasyon kodu",
};

function ComparePage() {
  const ids = useCompare((s) => s.ids);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);

  const fetchProducts = useServerFn(getProductsForCompare);
  const { data, isLoading } = useQuery({
    queryKey: ["compare-page", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => (await fetchProducts({ data: { ids } })),
  });

  const products = (data ?? []).slice().sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const cheapest = products.length ? Math.min(...products.map((p) => Number(p.price_try))) : 0;

  const rows: { label: string; render: (p: (typeof products)[number]) => React.ReactNode }[] = [
    {
      label: "Fiyat",
      render: (p) => (
        <span className={`font-mono text-base ${Number(p.price_try) === cheapest ? "text-primary neon-text" : ""}`}>
          ₺{Number(p.price_try).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      label: "Piyasa fiyatı",
      render: (p) =>
        p.retail_price_try ? (
          <span className="font-mono text-xs text-muted-foreground line-through">
            ₺{Number(p.retail_price_try).toLocaleString("tr-TR")}
          </span>
        ) : (
          <Minus className="h-3 w-3 text-muted-foreground" />
        ),
    },
    { label: "Süre", render: (p) => p.duration_label || DURATION_LABEL[p.duration ?? ""] || p.duration },
    { label: "Teslimat", render: (p) => DELIVERY_LABEL[p.delivery_type ?? ""] ?? p.delivery_type },
    { label: "Kategori", render: (p) => p.category || "—" },
    {
      label: "Stok",
      render: (p) =>
        p.unlimited_stock ? (
          <span className="text-primary">Sınırsız</span>
        ) : p.manual_fulfillment ? (
          <span className="text-cyan">Manuel teslim</span>
        ) : (p.stock_hint ?? 0) > 0 ? (
          <span>{p.stock_hint} adet</span>
        ) : (
          <span className="text-destructive">Tükendi</span>
        ),
    },
    {
      label: "Puan",
      render: (p) =>
        (p.review_count ?? 0) > 0 ? (
          <span>
            ★ {Number(p.avg_rating).toFixed(1)}{" "}
            <span className="text-muted-foreground text-xs">({p.review_count})</span>
          </span>
        ) : (
          <Minus className="h-3 w-3 text-muted-foreground" />
        ),
    },
    { label: "Satış adedi", render: (p) => p.orders_count ?? 0 },
    {
      label: "E-posta gerekli",
      render: (p) =>
        p.requires_email ? <Check className="h-4 w-4 text-warn" /> : <Minus className="h-3 w-3 text-muted-foreground" />,
    },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <GitCompare className="h-6 w-6 text-primary" /> Ürün Karşılaştırma
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            seçtiğin ürünleri fiyat, süre ve teslimat şekline göre yan yana incele
          </p>
        </div>
        {products.length > 0 && (
          <Button variant="outline" size="sm" className="font-mono" onClick={clear}>
            listeyi temizle
          </Button>
        )}
      </div>

      {ids.length === 0 ? (
        <div className="glass-card rounded-xl border border-border/60 p-10 text-center">
          <p className="mb-4 font-mono text-sm text-muted-foreground">
            Henüz karşılaştırma listen boş. Ürünler sayfasından "karşılaştır" butonuna bas.
          </p>
          <Button asChild className="font-mono">
            <Link to="/urunler">$ ürünlere git</Link>
          </Button>
        </div>
      ) : isLoading ? (
        <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="w-32 p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  özellik
                </th>
                {products.map((p) => (
                  <th key={p.id} className="p-2 align-top">
                    <div className="glass-card relative rounded-lg border border-primary/25 p-3 text-left">
                      <button
                        onClick={() => remove(p.id)}
                        aria-label="listeden çıkar"
                        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <div className="mb-2 flex h-16 items-center justify-center overflow-hidden rounded-md bg-background/60">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} loading="lazy" className="h-full object-contain p-1.5" />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <Link
                        to="/urun/$slug"
                        params={{ slug: p.slug }}
                        className="line-clamp-2 text-sm font-semibold hover:text-primary"
                      >
                        {p.name}
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={i % 2 ? "bg-card/30" : ""}>
                  <td className="p-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{r.label}</td>
                  {products.map((p) => (
                    <td key={p.id} className="p-3 text-sm">
                      {r.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-3" />
                {products.map((p) => (
                  <td key={p.id} className="p-3">
                    <Button asChild size="sm" className="w-full font-mono" disabled={!p.active}>
                      <Link to="/urun/$slug" params={{ slug: p.slug }}>
                        incele
                      </Link>
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
