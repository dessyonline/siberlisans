import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getRecentPublicSales } from "@/lib/storefront.functions";
import { Activity, ShoppingBag } from "lucide-react";

type Sale = {
  id: string;
  product_name: string;
  product_slug: string;
  image_url: string | null;
  masked_buyer: string;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export function LiveSalesTicker() {
  const fetchSales = useServerFn(getRecentPublicSales);
  const { data: sales = [] } = useQuery({
    queryKey: ["recent-public-sales"],
    refetchInterval: 60_000,
    queryFn: async () => (await fetchSales({ data: { limit: 12 } })) as Sale[],
  });

  if (sales.length === 0) return null;
  const loop = [...sales, ...sales];

  return (
    <section className="border-y border-border/60 bg-card/30 overflow-hidden">
      <div className="container mx-auto px-4 py-3 flex items-center gap-3">
        <span className="shrink-0 flex items-center gap-1.5 font-mono text-[11px] text-primary">
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          canlı satışlar
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex gap-6 w-max animate-[ticker_40s_linear_infinite] hover:[animation-play-state:paused]">
            {loop.map((s, i) => (
              <Link
                key={`${s.id}-${i}`}
                to="/urun/$slug"
                params={{ slug: s.product_slug }}
                className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground hover:text-primary transition-colors whitespace-nowrap"
              >
                <ShoppingBag className="h-3 w-3 text-primary/70" />
                <span className="text-foreground/80">{s.masked_buyer}</span>
                <span>satın aldı:</span>
                <span className="text-primary">{s.product_name}</span>
                <span className="text-muted-foreground/60">· {timeAgo(s.created_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </section>
  );
}
