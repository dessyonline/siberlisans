import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { upsertProduct } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Star, ArrowUp, ArrowDown, X, Plus, Search, Crown, GripVertical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/populer")({
  component: PopulerAdmin,
  head: () => ({
    meta: [
      { title: "Popüler Seçimler — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration: "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "lifetime";
  delivery_type: "key" | "account" | "link" | "link_token";
  price_try: number;
  active: boolean;
  category: string | null;
  manual_fulfillment: boolean;
  stock_hint: number | null;
  featured: boolean;
  unlimited_stock: boolean;
  sort_order: number;
  tier: "standard" | "epic";
  image_url: string | null;
};

function PopulerAdmin() {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertProduct);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-populer-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const featured = useMemo(
    () =>
      [...(products ?? [])]
        .filter((p) => p.featured)
        .sort((a, b) => {
          // Epic first, then by sort_order desc
          const ea = a.tier === "epic" ? 0 : 1;
          const eb = b.tier === "epic" ? 0 : 1;
          if (ea !== eb) return ea - eb;
          return (b.sort_order ?? 0) - (a.sort_order ?? 0);
        }),
    [products],
  );

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => !p.featured)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [products, search]);

  const patch = async (p: Product, overrides: Partial<Product>) => {
    setBusy(p.id);
    try {
      await upsert({
        data: {
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description ?? undefined,
          duration: p.duration,
          delivery_type: p.delivery_type,
          price_try: Number(p.price_try),
          active: p.active,
          category: p.category,
          manual_fulfillment: p.manual_fulfillment,
          stock_hint: p.stock_hint,
          featured: overrides.featured ?? p.featured,
          unlimited_stock: p.unlimited_stock,
          sort_order: overrides.sort_order ?? p.sort_order,
          tier: p.tier,
          image_url: p.image_url,
        },
      });
      await qc.invalidateQueries({ queryKey: ["admin-populer-products"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const addToFeatured = async (p: Product) => {
    const maxOrder = featured.reduce((m, x) => Math.max(m, x.sort_order ?? 0), 0);
    await patch(p, { featured: true, sort_order: maxOrder + 10 });
    toast.success(`[✓] ${p.name} popülerlere eklendi`);
  };

  const removeFromFeatured = async (p: Product) => {
    await patch(p, { featured: false });
    toast.success(`[✓] ${p.name} popülerlerden çıkarıldı`);
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const a = featured[idx];
    const b = featured[idx + dir];
    if (!a || !b) return;
    // Swap sort_orders. If equal, bump a's order relative to b.
    const oa = a.sort_order ?? 0;
    const ob = b.sort_order ?? 0;
    const newA = ob === oa ? (dir === -1 ? oa + 1 : oa - 1) : ob;
    const newB = ob === oa ? oa : oa;
    setBusy(a.id);
    try {
      await Promise.all([
        upsert({
          data: {
            id: a.id, name: a.name, slug: a.slug,
            description: a.description ?? undefined, duration: a.duration,
            delivery_type: a.delivery_type, price_try: Number(a.price_try),
            active: a.active, category: a.category,
            manual_fulfillment: a.manual_fulfillment, stock_hint: a.stock_hint,
            featured: a.featured, unlimited_stock: a.unlimited_stock,
            sort_order: newA, tier: a.tier, image_url: a.image_url,
          },
        }),
        upsert({
          data: {
            id: b.id, name: b.name, slug: b.slug,
            description: b.description ?? undefined, duration: b.duration,
            delivery_type: b.delivery_type, price_try: Number(b.price_try),
            active: b.active, category: b.category,
            manual_fulfillment: b.manual_fulfillment, stock_hint: b.stock_hint,
            featured: b.featured, unlimited_stock: b.unlimited_stock,
            sort_order: newB, tier: b.tier, image_url: b.image_url,
          },
        }),
      ]);
      await qc.invalidateQueries({ queryKey: ["admin-populer-products"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[11px] text-muted-foreground">$ admin/populer</div>
          <h1 className="mt-1 font-mono text-xl sm:text-2xl neon-text flex items-center gap-2">
            <Star className="h-5 w-5 fill-warn text-warn" /> Popüler Seçimler
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            ana sayfada "Popüler Lisanslar" bölümünde görünen ürünler · destansı 👑 önce, sonra sıra
          </p>
        </div>
        <div className="glass-card rounded-md px-3 py-2 font-mono text-xs">
          <span className="text-muted-foreground">öne çıkan · </span>
          <span className="text-warn font-bold">{featured.length}</span>
        </div>
      </div>

      {/* Featured list */}
      <div className="mt-6">
        <div className="font-mono text-xs text-muted-foreground mb-2">
          # şu anda öne çıkanlar ({featured.length})
        </div>
        {isLoading && (
          <div className="glass-card rounded-lg p-6 text-center font-mono text-sm text-muted-foreground animate-pulse">
            yükleniyor…
          </div>
        )}
        {!isLoading && featured.length === 0 && (
          <div className="glass-card rounded-lg p-6 text-center font-mono text-sm text-muted-foreground">
            henüz öne çıkan ürün yok · aşağıdan ekle
          </div>
        )}
        <div className="space-y-2">
          {featured.map((p, i) => (
            <div
              key={p.id}
              className={`glass-card rounded-lg p-3 flex items-center gap-2 sm:gap-3 ${
                busy === p.id ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || !!busy}
                  className="h-6 w-6 rounded border border-border/60 hover:border-primary/60 hover:text-primary disabled:opacity-30 flex items-center justify-center transition"
                  title="yukarı"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === featured.length - 1 || !!busy}
                  className="h-6 w-6 rounded border border-border/60 hover:border-primary/60 hover:text-primary disabled:opacity-30 flex items-center justify-center transition"
                  title="aşağı"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border/50 bg-background/50 font-mono text-sm text-primary">
                {i + 1}
              </div>

              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded object-cover border border-border/50"
                  loading="lazy"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded border border-border/50 bg-background/50 flex items-center justify-center">
                  <Star className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {p.tier === "epic" && (
                    <Crown className="h-3.5 w-3.5 text-warn fill-warn shrink-0" />
                  )}
                  <div className="font-mono text-sm font-semibold truncate">{p.name}</div>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{p.category ?? "—"}</span>
                  <span>·</span>
                  <span className="text-primary">₺{Number(p.price_try).toLocaleString("tr-TR")}</span>
                  <span>·</span>
                  <span>sıra: {p.sort_order ?? 0}</span>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => removeFromFeatured(p)}
                disabled={!!busy}
                className="shrink-0 font-mono h-8 px-2 text-xs hover:border-destructive hover:text-destructive"
                title="popülerlerden çıkar"
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1">çıkar</span>
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Add new */}
      <div className="mt-8">
        <div className="font-mono text-xs text-muted-foreground mb-2">
          # popülerlere ekle ({available.length} uygun ürün)
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ürün adı veya kategori…"
            className="pl-9 font-mono text-sm"
          />
        </div>

        {available.length === 0 ? (
          <div className="glass-card rounded-lg p-6 text-center font-mono text-sm text-muted-foreground">
            {search ? "eşleşme yok" : "eklenebilecek başka ürün yok"}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {available.map((p) => (
              <div
                key={p.id}
                className={`glass-card rounded-lg p-3 flex items-center gap-3 ${
                  busy === p.id ? "opacity-60" : ""
                }`}
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded object-cover border border-border/50"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded border border-border/50 bg-background/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold truncate flex items-center gap-1.5">
                    {p.tier === "epic" && (
                      <Crown className="h-3 w-3 text-warn fill-warn shrink-0" />
                    )}
                    {p.name}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">
                    {p.category ?? "—"} · ₺{Number(p.price_try).toLocaleString("tr-TR")}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => addToFeatured(p)}
                  disabled={!!busy}
                  className="shrink-0 font-mono h-8 px-2 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline ml-1">ekle</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 glass-card rounded-lg p-4 font-mono text-[11px] text-muted-foreground leading-relaxed">
        <div className="text-primary mb-1"># ipucu</div>
        ana sayfadaki sıra: <span className="text-foreground">AI kategori önceliği → destansı 👑 → sıra numarası (büyükten küçüğe)</span>.
        yukarı/aşağı okları <span className="text-foreground">sıra numarasını</span> değiştirir.
      </div>
    </div>
  );
}
