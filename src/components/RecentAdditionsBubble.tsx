import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, X, KeyRound } from "lucide-react";

type Recent = {
  id: string;
  name: string;
  slug: string;
  price_try: number;
  created_at: string;
  category: string | null;
};

export function RecentAdditionsBubble() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["recent-products-bubble"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price_try, created_at, category")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as Recent[];
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, []);

  // Ziyaretçi/public sayfalarda göster; admin/auth/ödeme/hesabım/aktivasyonda gizle
  const hide =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/hesabim") ||
    pathname.startsWith("/odeme") ||
    pathname.startsWith("/aktivasyon");

  if (hide || dismissed || !data || data.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono">
      {open ? (
        <div className="glass-card w-[300px] sm:w-[340px] rounded-lg border border-primary/40 neon-glow p-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="neon-text">son eklenenler</span>
              <span className="text-muted-foreground">({data.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-[10px] px-1"
                aria-label="küçült"
              >
                _
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="kapat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {data.map((p) => (
              <li key={p.id}>
                <Link
                  to="/urun/$slug"
                  params={{ slug: p.slug }}
                  className="flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5 hover:border-primary/40 hover:bg-primary/5 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.category ?? "lisans"} ·{" "}
                      {new Date(p.created_at).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                  </div>
                  <span className="text-primary text-xs shrink-0">
                    ₺{Number(p.price_try).toLocaleString("tr-TR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/urunler"
            className="mt-2 block text-center text-[11px] text-primary hover:underline"
          >
            tüm lisansları gör →
          </Link>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="glass-card rounded-full border border-primary/40 neon-glow px-3 py-2 flex items-center gap-2 text-xs hover:border-primary transition"
        >
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          <span>son eklenen {data.length} lisans</span>
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        </button>
      )}
    </div>
  );
}
