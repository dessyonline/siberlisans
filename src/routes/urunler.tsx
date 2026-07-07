import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

function ProductsPage() {
  const { data } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, license_keys(status)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="font-mono mb-8">
        <div className="text-xs text-muted-foreground">$ ls /catalog</div>
        <h1 className="mt-2 text-3xl neon-text">Tüm Lisanslar</h1>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((p) => {
          const stock = (p.license_keys ?? []).filter((k: { status: string }) => k.status === "available").length;
          const stockLabel = stock === 0 ? "tükendi" : stock < 3 ? `son ${stock} adet` : "stokta";
          const stockCls =
            stock === 0
              ? "text-destructive border-destructive/40 bg-destructive/10"
              : stock < 3
              ? "text-warn border-warn/40 bg-warn/10 animate-pulse"
              : "text-primary border-primary/30 bg-primary/10";
          return (
            <div key={p.id} className="glass-card rounded-lg p-5 flex flex-col">
              <div className="flex items-start justify-between">
                <h3 className="font-mono text-lg font-semibold">{p.name}</h3>
                <KeyRound className="h-5 w-5 text-primary opacity-70" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{p.description}</p>
              <div className="mt-3 flex items-center gap-2 font-mono text-xs">
                <span className="rounded bg-primary/10 text-primary border border-primary/30 px-2 py-0.5">
                  {DUR[p.duration]}
                </span>
                <span className={`rounded px-2 py-0.5 border ${stockCls}`}>● {stockLabel}</span>
              </div>
              <div className="mt-auto pt-5 flex items-end justify-between">
                <div className="font-mono text-2xl neon-text">
                  ₺{Number(p.price_try).toLocaleString("tr-TR")}
                </div>
                <Button asChild size="sm" className="font-mono" disabled={stock === 0}>
                  <Link to="/urun/$slug" params={{ slug: p.slug }}>
                    {stock === 0 ? "tükendi" : "satın al →"}
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
