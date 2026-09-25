import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getRecentPublicSales } from "@/lib/storefront.functions";
import { ShoppingBag, X, Activity } from "lucide-react";

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

export function LiveActivityPopup() {
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  const fetchSales = useServerFn(getRecentPublicSales);
  const { data: sales = [] } = useQuery({
    queryKey: ["recent-public-sales", "popup"],
    refetchInterval: 900_000,
    enabled: !dismissed,
    queryFn: async () => (await fetchSales({ data: { limit: 10 } })) as Sale[],
  });

  useEffect(() => {
    if (dismissed || sales.length === 0) return;
    let mounted = true;
    const cycle = () => {
      if (!mounted) return;
      setVisible(true);
      window.setTimeout(() => mounted && setVisible(false), 6000);
      window.setTimeout(() => {
        if (!mounted) return;
        setIndex((i) => (i + 1) % sales.length);
      }, 6600);
    };
    const first = window.setTimeout(cycle, 60000);
    const interval = window.setInterval(cycle, 900000);
    return () => {
      mounted = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [dismissed, sales.length]);

  if (dismissed || sales.length === 0) return null;
  const sale = sales[index % sales.length];
  if (!sale) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-40 max-w-[300px] transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="glass-card corner-cut border border-primary/30 p-3 pr-8 relative shadow-lg">
        <button
          type="button"
          aria-label="Bildirimi kapat"
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-primary mb-1.5">
          <Activity className="h-3 w-3 animate-pulse" />
          başkaları da satın aldı
        </div>
        <Link
          to="/urun/$slug"
          params={{ slug: sale.product_slug }}
          className="flex items-start gap-2 group"
        >
          <ShoppingBag className="h-4 w-4 text-primary/70 mt-0.5 shrink-0" />
          <span className="text-xs leading-snug">
            <span className="text-foreground/80 font-mono">{sale.masked_buyer}</span>{" "}
            <span className="text-muted-foreground">şunu aldı:</span>{" "}
            <span className="text-primary group-hover:underline">{sale.product_name}</span>
            <span className="block font-mono text-[10px] text-muted-foreground/70 mt-0.5">
              {timeAgo(sale.created_at)}
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
