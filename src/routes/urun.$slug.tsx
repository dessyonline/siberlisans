import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createOrder } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Info, ShieldCheck, Zap, CheckCircle2, X } from "lucide-react";

const productMetaQuery = (slug: string) => ({
  queryKey: ["product-meta", slug],
  queryFn: async () => {
    const { data } = await supabase
      .from("products")
      .select("name, description, image_url, price_try, category")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    return data;
  },
});

export const Route = createFileRoute("/urun/$slug")({
  component: ProductDetail,
  loader: async ({ params, context }) => {
    const q = productMetaQuery(params.slug);
    const product = await (context as { queryClient: import("@tanstack/react-query").QueryClient }).queryClient.ensureQueryData(q);
    return { product };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.product;
    const url = `https://siberlisans.lovable.app/urun/${params.slug}`;
    const title = p ? `${p.name} — SiberPHP` : "Lisans — SiberPHP";
    const desc = p?.description
      ? p.description.replace(/\|/g, " · ").slice(0, 155)
      : "SiberPHP üzerinden güvenli ve anında teslim edilen yazılım lisansı.";
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "product" },
      { property: "og:url", content: url },
    ];
    if (p?.image_url) {
      meta.push({ property: "og:image", content: p.image_url });
      meta.push({ name: "twitter:image", content: p.image_url });
    }
    const scripts = p
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: p.name,
              description: desc,
              image: p.image_url || undefined,
              category: p.category || undefined,
              brand: { "@type": "Brand", name: "SiberPHP" },
              offers: {
                "@type": "Offer",
                priceCurrency: "TRY",
                price: Number(p.price_try),
                url,
                availability: "https://schema.org/InStock",
              },
            }),
          },
        ]
      : [];
    return { meta, links: [{ rel: "canonical", href: url }], scripts };
  },
});

const DUR: Record<string, string> = { monthly: "aylık", yearly: "yıllık", lifetime: "ömürlük" };

function ProductDetail() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const createOrderFn = useServerFn(createOrder);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, active, category, image_url, manual_fulfillment, stock_hint, unlimited_stock, license_keys(status)")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const handleBuy = async () => {
    if (!user) {
      toast("Devam etmek için giriş yap");
      navigate({ to: "/auth" });
      return;
    }
    if (!product) return;
    setLoading(true);
    try {
      const res = await createOrderFn({ data: { productId: product.id } });
      navigate({ to: "/odeme/$orderId", params: { orderId: res.orderId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 animate-pulse">
        <div className="glass-card rounded-xl p-8 space-y-4">
          <div className="h-4 w-32 rounded bg-muted/40" />
          <div className="h-56 rounded bg-muted/30" />
          <div className="h-8 w-2/3 rounded bg-muted/40" />
          <div className="h-4 w-full rounded bg-muted/30" />
          <div className="h-4 w-5/6 rounded bg-muted/30" />
          <div className="h-10 w-40 rounded bg-muted/40" />
          <div className="h-11 w-full rounded bg-muted/40" />
        </div>
      </div>
    );
  if (!product) return <div className="p-12 font-mono text-center">ürün bulunamadı</div>;

  const liveStock = (product.license_keys ?? []).filter((k: { status: string }) => k.status === "available").length;
  const stock = liveStock > 0 ? liveStock : (product.stock_hint ?? 0);
  const manual = !!product.manual_fulfillment;
  const unlimited = !!(product as { unlimited_stock?: boolean }).unlimited_stock;
  const soldOut = !manual && !unlimited && stock === 0;
  const bullets = (product.description ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/urunler" className="font-mono text-sm text-muted-foreground hover:text-primary">
          ← tüm lisanslar
        </Link>
        <Link to="/urunler" className="rounded-full border border-border/60 p-2 text-muted-foreground hover:text-primary hover:border-primary/40">
          <X className="h-4 w-4" />
        </Link>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <Info className="h-4 w-4 text-primary" />
            Ürün Bilgisi
          </div>
        </div>

        {product.image_url && (
          <div className="relative h-56 md:h-72 overflow-hidden border-b border-border/60 bg-black/30 flex items-center justify-center p-6">
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-contain"
            />
          </div>
        )}

        <div className="p-6 md:p-8">
          <h1 className="font-mono text-2xl md:text-3xl font-semibold neon-text">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs">
            <StockBadge stock={stock} manual={manual} unlimited={unlimited} />
            {product.category && (
              <span className="rounded-full border border-border/60 bg-background px-3 py-1 text-muted-foreground">
                {product.category}
              </span>
            )}
            <span className="rounded-full border border-border/60 bg-background px-3 py-1 text-muted-foreground">
              {manual ? "Manuel Teslimat" : "Otomatik Teslimat"}
            </span>
          </div>

          <div className="mt-6 font-mono text-4xl neon-text">
            ₺{Number(product.price_try).toLocaleString("tr-TR")}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">KDV dahil · Havale/EFT</div>

          <div className="mt-6">
            <div className="mb-2 font-mono text-sm font-semibold">Ürün Açıklaması:</div>
            {bullets.length > 1 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{product.description || "Açıklama bulunmuyor."}</p>
            )}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 font-mono text-xs">
            {[
              { i: Zap, t: "anlık teslim" },
              { i: ShieldCheck, t: "orijinal key" },
              { i: CheckCircle2, t: "değişim garantisi" },
            ].map((b) => (
              <div key={b.t} className="rounded-md border border-border/60 p-3 flex items-center gap-2">
                <b.i className="h-4 w-4 text-primary" />
                <span>{b.t}</span>
              </div>
            ))}
          </div>

          <Button
            disabled={loading || soldOut}
            onClick={handleBuy}
            className="mt-8 w-full font-mono neon-glow"
            size="lg"
          >
            {loading
              ? "işleniyor…"
              : soldOut
              ? "stok tükendi"
              : "> satın al"}
          </Button>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground text-center">
            kredi kartı KABUL EDİLMEZ · sadece banka transferi
          </p>
        </div>
      </div>
    </div>
  );
}

function StockBadge({ stock, manual, unlimited }: { stock: number; manual: boolean; unlimited?: boolean }) {
  if (unlimited) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 font-mono text-xs text-cyan">
        <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" /> Sınırsız Stok ∞
      </div>
    );
  }
  if (manual) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-mono text-xs text-warn">
        <span className="h-2 w-2 rounded-full bg-warn" /> Sipariş Sonrası
      </div>
    );
  }
  if (stock === 0) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 font-mono text-xs text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" /> Stok Tükendi
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-500">
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Mevcut Stok
    </div>
  );
}
