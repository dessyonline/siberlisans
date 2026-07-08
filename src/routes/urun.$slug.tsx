import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createOrder } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Info, ShieldCheck, Zap, CheckCircle2, X, KeyRound, Lock, ArrowLeft, Terminal, Cpu, Wifi, Crown, Sparkles, Landmark, Package, RefreshCw, HelpCircle, Users, Clock, ShoppingCart } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useCart } from "@/lib/cart-store";

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
  const addToCart = useCart((s) => s.addItem);


  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, active, category, image_url, manual_fulfillment, stock_hint, unlimited_stock, tier, license_keys(status)")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: relatedProducts } = useQuery({
    queryKey: ["related-products", product?.category, product?.id],
    enabled: !!product?.category,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, slug, price_try, image_url, category, tier")
        .eq("active", true)
        .eq("category", product!.category!)
        .neq("id", product!.id)
        .limit(4);
      return data ?? [];
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

  const handleAddToCart = () => {
    if (!product) return;
    addToCart({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      priceTry: Number(product.price_try),
      imageUrl: product.image_url ?? null,
    });
    toast.success("Sepete eklendi");
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
  const isEpic = ((product as { tier?: string }).tier ?? "standard") === "epic";
  const soldOut = !manual && !unlimited && stock === 0;
  const bullets = (product.description ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="relative overflow-hidden">
      {/* cyber backdrop */}
      <div className="pointer-events-none absolute inset-0 cyber-grid grid-drift opacity-60" aria-hidden />
      <div className="hero-orb h-[380px] w-[380px] left-[-120px] top-[-60px]" style={{ background: isEpic ? "oklch(0.80 0.18 85 / 0.42)" : "oklch(0.82 0.20 145 / 0.35)" }} aria-hidden />
      <div className="hero-orb h-[300px] w-[300px] right-[-80px] top-[40%]" style={{ background: isEpic ? "oklch(0.60 0.22 310 / 0.35)" : "oklch(0.65 0.20 300 / 0.25)", animationDelay: "3s" }} aria-hidden />
      <div className="pointer-events-none absolute inset-0 scan-line opacity-30" aria-hidden />

      <div className="relative mx-auto max-w-5xl px-4 py-10 pb-32 md:pb-14">
        {/* Breadcrumb terminal */}
        <div className="mb-6 flex items-center justify-between font-mono text-xs">
          <Link to="/urunler" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span className="text-primary">$</span>
            <span>cd ../lisanslar</span>
          </Link>
          <div className="hidden sm:flex items-center gap-3 text-muted-foreground/70">
            <span className="inline-flex items-center gap-1.5"><Wifi className="h-3 w-3 text-primary" /> online</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5"><Lock className="h-3 w-3 text-primary" /> TLS 1.3</span>
          </div>
        </div>

        {/* Terminal window frame */}
        <div className={`relative rounded-xl overflow-hidden ${isEpic ? "epic-card" : "glass-card neon-glow-strong"}`}>
          {isEpic && <div className="epic-shimmer" aria-hidden />}
          {isEpic && (
            <div className="relative flex items-center justify-center gap-2 border-b border-[oklch(0.78_0.16_75/0.4)] bg-gradient-to-r from-[oklch(0.14_0.03_75/0.6)] via-[oklch(0.13_0.05_300/0.55)] to-[oklch(0.14_0.03_75/0.6)] py-1.5 font-mono text-[10px] uppercase tracking-[0.4em] text-[oklch(0.90_0.14_85)] epic-text-glow">
              <Crown className="h-3 w-3" /> destansı sürüm · epic tier <Sparkles className="h-3 w-3" />
            </div>
          )}
          {/* window chrome */}
          <div className="flex items-center justify-between border-b border-border/60 bg-background/50 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              <span className="ml-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <Terminal className="h-3 w-3 text-primary" />
                siberphp@secure:~/urun/{slug}
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] text-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              LIVE
            </span>
          </div>

          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* Left: digital ID card */}
            <div className="relative border-b md:border-b-0 md:border-r border-border/60 bg-black/40 p-2 sm:p-6 flex items-center justify-center">


              <div className="pointer-events-none absolute inset-0 cyber-grid opacity-30" aria-hidden />

              {/* ID CARD */}
              <div className={`relative w-full max-w-[240px] sm:max-w-[320px] md:max-w-[380px] mx-auto rounded-xl overflow-hidden ${isEpic ? "epic-card" : "border border-primary/40 bg-gradient-to-br from-[oklch(0.16_0.03_145)] via-[oklch(0.13_0.02_180)] to-[oklch(0.14_0.04_270)] shadow-[0_0_30px_oklch(0.82_0.20_145/0.25),inset_0_0_0_1px_oklch(0.82_0.20_145/0.15)]"}`}>
                {isEpic && <div className="epic-shimmer" aria-hidden />}
                {/* holographic sheen */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen"
                  aria-hidden
                  style={{
                    background:
                      "linear-gradient(115deg, transparent 30%, oklch(0.85 0.18 200 / 0.35) 45%, oklch(0.75 0.18 300 / 0.30) 55%, transparent 70%)",
                  }}
                />
                {/* micro-print grid */}
                <div className="pointer-events-none absolute inset-0 cyber-grid opacity-20" aria-hidden />

                {/* card header */}
                <div className="relative flex items-center justify-between border-b border-primary/25 bg-black/30 px-3 py-2 backdrop-blur-sm">
                  <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.28em] text-primary/90">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    digital_license · id-card
                  </div>
                  <div className="font-mono text-[9px] text-primary/70 tracking-wider">
                    #{(product.id ?? "").slice(0, 8).toUpperCase()}
                  </div>
                </div>

                {/* image window */}
                <div className="relative aspect-[3/2] w-full bg-black/50 overflow-hidden">

                  {/* corner brackets */}
                  <span className="pointer-events-none absolute top-2 left-2 h-3 w-3 border-l border-t border-primary/60" />
                  <span className="pointer-events-none absolute top-2 right-2 h-3 w-3 border-r border-t border-primary/60" />
                  <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-l border-b border-primary/60" />
                  <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-r border-b border-primary/60" />
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="relative h-full w-full object-contain p-4 drop-shadow-[0_0_18px_oklch(0.82_0.20_145/0.45)]"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary">
                      <KeyRound className="h-16 w-16 opacity-80 drop-shadow-[0_0_20px_oklch(0.82_0.20_145/0.6)]" />
                      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                        {product.category ?? "lisans"}
                      </span>
                    </div>
                  )}
                  {/* scanline */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-full scan-line opacity-30" aria-hidden />
                </div>

                {/* card body: identity strip */}
                <div className="relative px-3 py-2.5 border-t border-primary/20 bg-black/40">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-primary/70">
                        category
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-primary/90 uppercase tracking-[0.2em] truncate">
                        {product.category ?? "license"}
                      </div>
                    </div>
                    {/* chip */}
                    <div
                      className="h-8 w-10 rounded border border-primary/40 relative overflow-hidden shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.80 0.15 85) 0%, oklch(0.90 0.16 95) 45%, oklch(0.65 0.15 75) 100%)",
                      }}
                      aria-hidden
                    >
                      <div className="absolute inset-1 grid grid-cols-2 grid-rows-3 gap-[1px]">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <span key={i} className="bg-black/40 rounded-[1px]" />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* price strip */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-primary/15 pt-2">
                    <div className="font-mono text-[9px] uppercase tracking-[0.28em] text-primary/70">
                      final_price
                    </div>
                    <div className="font-mono text-sm sm:text-base text-primary neon-text-glow">
                      ₺{Number(product.price_try).toLocaleString("tr-TR")}
                    </div>
                  </div>

                  {/* MRZ-like footer */}
                  <div className="mt-2 font-mono text-[9px] text-primary/70 tracking-[0.15em] break-all border-t border-primary/15 pt-1.5">
                    &lt;LIC&lt;{(product.slug ?? "").toUpperCase().padEnd(12, "<").slice(0, 12)}&lt;&lt;{String(product.duration ?? "std").toUpperCase().slice(0, 4)}&lt;&lt;{(product.id ?? "").replace(/-/g, "").slice(0, 10).toUpperCase()}
                  </div>
                </div>

              </div>
            </div>

            {/* Right: info */}
            <div className="p-4 sm:p-6 md:p-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80 flex items-center gap-2">
                <Info className="h-3 w-3" /> product_manifest
              </div>
              <h1 className="mt-2 font-mono text-2xl md:text-[28px] font-semibold tracking-tight leading-tight flex items-baseline gap-2">
                <span className="text-muted-foreground/60 select-none">&gt;</span>
                <span className={isEpic ? "epic-text-glow text-[oklch(0.92_0.14_85)]" : "neon-sweep"}>{product.name}</span>
                <span aria-hidden className="caret-blink inline-block w-[2px] h-[0.9em] translate-y-[0.05em] bg-primary shadow-[0_0_10px_oklch(0.82_0.20_145/0.9)]" />
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                {isEpic && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[oklch(0.78_0.16_75/0.5)] bg-[oklch(0.14_0.03_75/0.6)] px-2.5 py-1 text-[oklch(0.92_0.14_85)] epic-text-glow uppercase tracking-[0.24em] text-[10px]">
                    <Crown className="h-3 w-3" /> destansı
                  </span>
                )}
                <StockBadge stock={stock} manual={manual} unlimited={unlimited} />
                {product.category && (
                  <span className="rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-1 text-muted-foreground">
                    <span className="text-primary/60">#</span> {product.category}
                  </span>
                )}
                <span className="rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-1 text-muted-foreground">
                  <Cpu className="mr-1 inline h-3 w-3 text-primary" />
                  {manual ? "manuel teslim" : "otomatik teslim"}
                </span>
              </div>

              {!manual && !unlimited && stock > 0 && stock <= 10 && (
                <div className="mt-5 rounded-lg border border-border/40 bg-background/40 backdrop-blur p-3">
                  <div className="flex items-center justify-between font-mono text-[10px] mb-1.5">
                    <span className="text-muted-foreground uppercase tracking-widest">stock.status</span>
                    <span className={stock <= 3 ? "text-warn" : "text-primary"}>[{stock}/10]</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={`h-full transition-all ${stock <= 3 ? "bg-warn shadow-[0_0_10px_currentColor]" : "bg-primary shadow-[0_0_10px_currentColor]"}`}
                      style={{ width: `${Math.min(100, stock * 10)}%` }}
                    />
                  </div>
                </div>
              )}


              {/* Description */}
              <div className="mt-6">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80 flex items-center gap-2">
                  <span>~</span> description.md
                </div>
                {bullets.length > 1 ? (
                  <ul className="space-y-2 font-mono text-sm">
                    {bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-muted-foreground">
                        <span className="text-primary shrink-0 mt-0.5">[✓]</span>
                        <span className="text-foreground/90">{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-mono text-sm text-muted-foreground leading-relaxed">
                    {product.description || "// açıklama bulunmuyor."}
                  </p>
                )}
              </div>

              {/* Guarantees */}
              <div className="mt-6 grid grid-cols-3 gap-2 font-mono text-[11px]">
                {[
                  { i: Zap, t: "anlık teslim" },
                  { i: ShieldCheck, t: "orijinal key" },
                  { i: CheckCircle2, t: "değişim garantili" },
                ].map((b) => (
                  <div
                    key={b.t}
                    className="rounded-md border border-border/40 bg-background/40 backdrop-blur px-2.5 py-2 flex items-center gap-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    <b.i className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{b.t}</span>
                  </div>
                ))}
              </div>

              <div className="mt-7 hidden md:grid grid-cols-[1fr_auto] gap-2">
                <Button
                  disabled={loading || soldOut}
                  onClick={handleBuy}
                  className="w-full group relative overflow-hidden font-mono bg-primary text-primary-foreground border border-primary/50 hover:bg-primary/90 shadow-[0_0_25px_oklch(0.82_0.20_145/0.35)] hover:shadow-[0_0_40px_oklch(0.82_0.20_145/0.55)] transition-all duration-300"
                  size="lg"
                >
                  <span className="pointer-events-none absolute inset-0 scan-line opacity-30" aria-hidden />
                  <Zap className="relative mr-2 h-4 w-4 animate-pulse" />
                  <span className="relative">
                    {loading ? "$ processing…" : soldOut ? "$ out_of_stock" : "$ satın al --now"}
                  </span>
                </Button>
                <Button
                  disabled={soldOut}
                  onClick={handleAddToCart}
                  variant="outline"
                  size="lg"
                  className="font-mono border-primary/40 hover:bg-primary/10 hover:text-primary"
                  aria-label="Sepete ekle"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span className="ml-1.5 hidden lg:inline">sepete ekle</span>
                </Button>
              </div>
              <p className="mt-3 font-mono text-[10px] text-muted-foreground text-center hidden md:block">
                <span className="text-primary/60">//</span> kredi kartı KABUL EDİLMEZ · sadece banka transferi
              </p>
            </div>
          </div>
        </div>

        {/* Trust strip: payment / delivery / return */}
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[
            {
              i: Landmark,
              t: "ödeme yöntemi",
              d: "Sadece Havale / EFT / FAST kabul edilir. Ödemeniz onaylandığında sipariş anında işleme alınır.",
              tag: "havale · eft · fast",
            },
            {
              i: Package,
              t: "teslimat süresi",
              d: manual
                ? "Manuel teslim: ödeme onayının ardından 5-30 dakika içinde e-posta ile teslim."
                : "Otomatik teslim: ödeme onayının ardından anında hesabınızda görünür.",
              tag: manual ? "5-30 dk" : "anında",
            },
            {
              i: RefreshCw,
              t: "iade & değişim",
              d: "Çalışmayan/kullanılmamış lisanslar 24 saat içinde ücretsiz değiştirilir. Aktive edilmiş keyler iade edilmez.",
              tag: "24 saat garanti",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="glass-card corner-cut rounded-lg border border-border/50 p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-primary/80">
                <c.i className="h-3.5 w-3.5" /> {c.t}
              </div>
              <p className="mt-2 font-mono text-xs leading-relaxed text-foreground/90">{c.d}</p>
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                <span className="text-primary/60">//</span> {c.tag}
              </div>
            </div>
          ))}
        </div>

        {/* Live trust bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary">2.418+</span> mutlu müşteri
          </span>
          <span className="hidden sm:inline text-border/60">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            son teslim <span className="text-primary">2 dk önce</span>
          </span>
          <span className="hidden sm:inline text-border/60">·</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            SSL & şifreli veri aktarımı
          </span>
        </div>

        {/* FAQ */}
        <div className="mt-8">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80 flex items-center gap-2">
            <HelpCircle className="h-3.5 w-3.5" /> sık sorulan sorular
          </div>
          <Accordion type="single" collapsible className="glass-card rounded-lg border border-border/50 divide-y divide-border/40">
            {[
              {
                q: "Ödeme sonrası lisansım ne zaman teslim edilir?",
                a: manual
                  ? "Manuel teslim ürünlerde ödemeniz onaylandıktan sonra 5-30 dakika içinde e-posta ile lisans bilgileriniz iletilir. Mesai saatleri dışında bu süre uzayabilir."
                  : "Otomatik teslim: ödeme onaylandığı an lisansınız hesabınızda ve mail adresinizde görüntülenir.",
              },
              {
                q: "Hangi ödeme yöntemlerini kabul ediyorsunuz?",
                a: "Sadece banka Havale / EFT / FAST kabul ediyoruz. Kredi kartı, PayPal veya kripto para kabul edilmez. Ödeme yaparken sipariş numaranızı açıklamaya yazmanız gerekir.",
              },
              {
                q: "Lisans çalışmazsa ne olur?",
                a: "Lisans key'i çalışmıyorsa 24 saat içinde bize ulaşın, ücretsiz olarak yeni bir key ile değiştirilir. Aktive edilmiş ve kullanılmış lisanslar iade kapsamı dışındadır.",
              },
              {
                q: "Faturamı nasıl alabilirim?",
                a: "Kurumsal fatura talepleriniz için ödeme sonrası destek ekibimizle iletişime geçin. E-fatura veya e-arşiv olarak iletilir.",
              },
              {
                q: "Lisans süresi ne kadar?",
                a: `Bu ürünün lisans türü: ${DUR[product.duration ?? "lifetime"] ?? "belirtilmemiş"}. Ürün açıklamasında detaylı süre bilgisi yer alır.`,
              },
            ].map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-0 px-4">
                <AccordionTrigger className="font-mono text-sm hover:no-underline hover:text-primary">
                  <span className="text-left">
                    <span className="text-primary/60 mr-2">Q{i + 1}.</span>
                    {f.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="font-mono text-xs text-muted-foreground leading-relaxed pl-6">
                  <span className="text-primary/60">A. </span>
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Related products */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex items-baseline justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80 flex items-center gap-2">
                <span>~</span> ilgili ürünler / {product.category}
              </div>
              <Link to="/urunler" className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors">
                tümünü gör →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((rp) => {
                const rEpic = (rp as { tier?: string }).tier === "epic";
                return (
                  <Link
                    key={rp.id}
                    to="/urun/$slug"
                    params={{ slug: rp.slug }}
                    className={`group relative overflow-hidden rounded-lg border p-3 transition-all hover:-translate-y-0.5 ${
                      rEpic
                        ? "border-[oklch(0.78_0.16_75/0.5)] bg-[oklch(0.14_0.03_75/0.4)] hover:shadow-[0_0_25px_oklch(0.80_0.18_85/0.35)]"
                        : "border-border/50 bg-background/40 backdrop-blur hover:border-primary/50 hover:shadow-[0_0_20px_oklch(0.82_0.20_145/0.25)]"
                    }`}
                  >
                    <div className="aspect-[3/2] rounded bg-black/40 border border-border/40 flex items-center justify-center overflow-hidden">
                      {rp.image_url ? (
                        <img src={rp.image_url} alt={rp.name} className="h-full w-full object-contain p-3 group-hover:scale-105 transition-transform" />
                      ) : (
                        <KeyRound className="h-8 w-8 text-primary/60" />
                      )}
                    </div>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-primary/70 flex items-center gap-1">
                      {rEpic && <Crown className="h-3 w-3 text-[oklch(0.90_0.14_85)]" />}
                      {rp.category}
                    </div>
                    <div className="mt-1 font-mono text-sm text-foreground/95 truncate group-hover:text-primary transition-colors">
                      {rp.name}
                    </div>
                    <div className={`mt-1.5 font-mono text-sm font-semibold ${rEpic ? "text-[oklch(0.90_0.14_85)] epic-text-glow" : "text-primary neon-text"}`}>
                      ₺{Number(rp.price_try).toLocaleString("tr-TR")}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky mobile buy bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-primary/30 bg-background/95 backdrop-blur-md p-3 shadow-[0_-4px_30px_oklch(0.82_0.20_145/0.15)]">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] text-muted-foreground truncate">
              <span className="text-primary">&gt;</span> {product.name}
            </div>
            <div className="font-mono text-lg neon-text leading-none">
              ₺{Number(product.price_try).toLocaleString("tr-TR")}
            </div>
          </div>
          <Button
            disabled={soldOut}
            onClick={handleAddToCart}
            variant="outline"
            size="lg"
            className="font-mono shrink-0 border-primary/40 hover:bg-primary/10 hover:text-primary h-11 px-3"
            aria-label="Sepete ekle"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
          <Button
            disabled={loading || soldOut}
            onClick={handleBuy}
            className="group relative overflow-hidden font-mono bg-primary text-primary-foreground border border-primary/50 hover:bg-primary/90 shadow-[0_0_20px_oklch(0.82_0.20_145/0.35)] hover:shadow-[0_0_30px_oklch(0.82_0.20_145/0.5)] transition-all duration-300 shrink-0"
            size="lg"
          >
            <span className="pointer-events-none absolute inset-0 scan-line opacity-30" aria-hidden />
            <Zap className="relative mr-1.5 h-4 w-4 animate-pulse" />
            <span className="relative">{loading ? "…" : soldOut ? "tükendi" : "$ satın al"}</span>
          </Button>
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
