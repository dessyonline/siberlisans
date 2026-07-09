import { createFileRoute, Link } from "@tanstack/react-router";
import { listBundles } from "@/lib/bundles.functions";
import { Package } from "lucide-react";

export const Route = createFileRoute("/paketler/")({
  component: BundlesPage,
  loader: () => listBundles(),
  head: () => ({
    meta: [
      { title: "Ürün Paketleri — SiberPHP" },
      { name: "description", content: "Birden fazla lisansı indirimli paketle satın al." },
      { property: "og:title", content: "Ürün Paketleri — SiberPHP" },
      { property: "og:description", content: "Kombine paketlerle daha uygun fiyata lisans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => <div className="p-8 text-center">Yüklenemedi</div>,
  notFoundComponent: () => <div className="p-8 text-center">Bulunamadı</div>,
});

type BundleItem = { quantity: number; product: { id: string; name: string; slug: string; price_try: number; image_url: string | null } | null };
type Bundle = { id: string; slug: string; name: string; description: string | null; price_try: number; discount_percent: number; active: boolean; items: BundleItem[] };

function BundlesPage() {
  const bundles = Route.useLoaderData() as unknown as Bundle[];

  return (
    <div className="container py-10 max-w-6xl">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
        <Package className="h-7 w-7 text-primary" /> Ürün Paketleri
      </h1>
      <p className="text-muted-foreground mb-8">
        Birden fazla lisansı tek pakette daha uygun fiyata al.
      </p>
      {bundles.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">Aktif paket yok.</div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {bundles.map((b) => {
          const items = b.items ?? [];
          const originalSum = items.reduce(
            (s, i) => s + (Number(i.product?.price_try) || 0) * i.quantity,
            0,
          );
          const saved = originalSum - Number(b.price_try);
          return (
            <div key={b.id} className="glass-card rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.description}</div>
                </div>
                {b.discount_percent > 0 && (
                  <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded font-mono">
                    -%{b.discount_percent}
                  </span>
                )}
              </div>
              <ul className="text-sm space-y-1 border-t border-border/40 pt-3">
                {items.map((i, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span className="truncate">
                      · {i.product?.name}
                      {i.quantity > 1 ? ` ×${i.quantity}` : ""}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      ₺{Number(i.product?.price_try ?? 0).toFixed(0)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="pt-3 border-t border-border/40 flex items-end justify-between">
                <div>
                  {saved > 0 && (
                    <div className="text-xs text-muted-foreground line-through">
                      ₺{originalSum.toFixed(0)}
                    </div>
                  )}
                  <div className="text-2xl font-bold text-primary">
                    ₺{Number(b.price_try).toFixed(0)}
                  </div>
                  {saved > 0 && (
                    <div className="text-[11px] text-primary/80 font-mono">
                      ₺{saved.toFixed(0)} tasarruf
                    </div>
                  )}
                </div>
                <Link
                  to="/paketler/$slug"
                  params={{ slug: b.slug }}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
                >
                  incele
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
