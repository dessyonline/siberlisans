import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getBundleBySlug } from "@/lib/bundles.functions";
import { Package, Check, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/paketler/$slug")({
  component: BundleDetail,
  loader: async ({ params }) => {
    const b = await getBundleBySlug({ data: { slug: params.slug } });
    if (!b) throw notFound();
    return b;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Paket bulunamadı" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.name} — Paket`;
    const desc = loaderData.description ?? `${loaderData.name} paketi indirimli fiyatla.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
      ],
    };
  },
  errorComponent: () => <div className="p-8 text-center">Yüklenemedi</div>,
  notFoundComponent: () => (
    <div className="container py-16 text-center">
      <div className="text-2xl font-bold mb-2">Paket bulunamadı</div>
      <p className="text-muted-foreground mb-4">Bu paket kaldırılmış veya pasif olabilir.</p>
      <Link to="/paketler" className="text-primary underline">
        Tüm paketlere dön
      </Link>
    </div>
  ),
});

function BundleDetail() {
  const b = Route.useLoaderData() as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    price_try: number;
    discount_percent: number;
    items: {
      quantity: number;
      product: { id: string; name: string; slug: string; price_try: number; image_url: string | null } | null;
    }[];
  };
  const items = b.items ?? [];
  const originalSum = items.reduce((s, i) => s + (Number(i.product?.price_try) || 0) * i.quantity, 0);
  const saved = originalSum - Number(b.price_try);

  async function buyBundle() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      toast.error("Önce giriş yap");
      return;
    }
    // Bundle satın alma: her ürün için order_items? Basit versiyon — sepete ekle sinyali
    toast.success("Paket için lütfen içindeki ürünleri tek tek satın al veya destek ile iletişime geç.");
  }

  return (
    <div className="container py-10 max-w-4xl">
      <div className="mb-6">
        <Link to="/paketler" className="text-xs font-mono text-muted-foreground hover:text-primary">
          ← tüm paketler
        </Link>
      </div>
      <div className="glass-card rounded-xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Package className="h-8 w-8 text-primary mt-1" />
            <div>
              <h1 className="text-3xl font-bold mb-1">{b.name}</h1>
              {b.description && <p className="text-muted-foreground">{b.description}</p>}
            </div>
          </div>
          {b.discount_percent > 0 && (
            <span className="bg-primary/20 text-primary text-sm px-3 py-1 rounded font-mono">
              -%{b.discount_percent}
            </span>
          )}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr,280px]">
          <div>
            <div className="text-sm font-semibold mb-3 font-mono text-muted-foreground">
              // paket içeriği
            </div>
            <ul className="space-y-2">
              {items.map((i, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-background/40"
                >
                  <div className="flex items-center gap-3">
                    <Check className="h-4 w-4 text-primary" />
                    <div>
                      <div className="font-medium">{i.product?.name}</div>
                      {i.quantity > 1 && (
                        <div className="text-xs text-muted-foreground">×{i.quantity} adet</div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">
                    ₺{Number(i.product?.price_try ?? 0).toFixed(0)}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card rounded-lg p-5 h-fit space-y-3">
            {originalSum > 0 && (
              <div className="rounded border border-primary/30 bg-primary/5 p-2 text-center">
                <div className="text-[10px] font-mono uppercase text-muted-foreground">
                  paket değeri
                </div>
                <div className="text-lg font-bold text-primary line-through decoration-destructive/70">
                  ₺{originalSum.toFixed(0)}
                </div>
              </div>
            )}
            <div className="text-4xl font-bold text-primary">
              ₺{Number(b.price_try).toFixed(0)}
            </div>
            {saved > 0 && (
              <div className="text-sm font-mono">
                <span className="text-primary">₺{saved.toFixed(0)} tasarruf</span>{" "}
                <span className="text-muted-foreground">
                  (%{originalSum > 0 ? ((saved / originalSum) * 100).toFixed(0) : 0})
                </span>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground border-t border-border/30 pt-2">
              Bu paket <b>₺{originalSum.toFixed(0)}</b> değerinde{" "}
              <b>{items.reduce((s, i) => s + i.quantity, 0)} ürün</b> içerir.
            </div>
            <Button onClick={buyBundle} className="w-full mt-2">
              <ShoppingCart className="h-4 w-4 mr-2" /> Paketi Al
            </Button>
            <div className="text-[11px] text-muted-foreground text-center">
              Paket ürünleri satın alım sonrası tek tek teslim edilir.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
