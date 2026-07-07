import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createOrder } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Zap, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/urun/$slug")({
  component: ProductDetail,
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
        .select("id, name, slug, description, duration, price_try, active")
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

  if (isLoading) return <div className="p-12 font-mono text-center">yükleniyor…</div>;
  if (!product) return <div className="p-12 font-mono text-center">ürün bulunamadı</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link to="/urunler" className="font-mono text-sm text-muted-foreground hover:text-primary">
        ← tüm lisanslar
      </Link>
      <div className="mt-4 grid gap-6 md:grid-cols-[1fr,320px]">
        <div className="glass-card rounded-lg p-6 scan-line">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <KeyRound className="h-4 w-4 text-primary" /> ./license/{product.slug}
          </div>
          <h1 className="mt-2 font-mono text-3xl neon-text">{product.name}</h1>
          <p className="mt-4 text-muted-foreground">{product.description}</p>
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
        </div>
        <div className="glass-card rounded-lg p-6 h-fit">
          <div className="font-mono text-xs text-muted-foreground">süre</div>
          <div className="font-mono text-lg">{DUR[product.duration]}</div>
          <div className="mt-4 font-mono text-xs text-muted-foreground">fiyat</div>
          <div className="font-mono text-4xl neon-text">
            ₺{Number(product.price_try).toLocaleString("tr-TR")}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">KDV dahil · Havale/EFT</div>
          <Button
            disabled={loading}
            onClick={handleBuy}
            className="mt-6 w-full font-mono neon-glow"
            size="lg"
          >
            {loading ? "işleniyor…" : "> satın al"}
          </Button>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground text-center">
            kredi kartı KABUL EDİLMEZ · sadece banka transferi
          </p>
        </div>
      </div>
    </div>
  );
}
