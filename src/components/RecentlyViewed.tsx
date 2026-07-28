import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { readRecent, clearRecent, type RecentProduct } from "@/lib/recently-viewed";
import { History } from "lucide-react";

export function RecentlyViewed({ excludeId, title = "son baktıkların" }: { excludeId?: string; title?: string }) {
  const [items, setItems] = useState<RecentProduct[]>([]);

  useEffect(() => {
    const sync = () => setItems(readRecent());
    sync();
    window.addEventListener("siber-recent-updated", sync);
    return () => window.removeEventListener("siber-recent-updated", sync);
  }, []);

  const list = items.filter((p) => p.id !== excludeId).slice(0, 6);
  if (list.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-muted-foreground">
          <History className="h-4 w-4 text-primary" /> {title}
        </h2>
        <button
          onClick={() => clearRecent()}
          className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive"
        >
          temizle
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {list.map((p) => (
          <Link
            key={p.id}
            to="/urun/$slug"
            params={{ slug: p.slug }}
            className="group w-40 shrink-0 rounded-lg border border-border/60 bg-card/50 p-2 transition-colors hover:border-primary/50"
          >
            <div className="mb-2 flex h-20 items-center justify-center overflow-hidden rounded-md bg-background/60">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-contain p-2" />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">{p.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="line-clamp-2 text-xs group-hover:text-primary">{p.name}</div>
            <div className="mt-1 font-mono text-[11px] text-primary">₺{Number(p.priceTry).toLocaleString("tr-TR")}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
