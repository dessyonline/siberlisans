import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProductsForCompare } from "@/lib/storefront.functions";
import { useCompare, COMPARE_MAX } from "@/lib/compare-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GitCompare, X, Check } from "lucide-react";

export function CompareToggle({ productId, className = "" }: { productId: string; className?: string }) {
  const ids = useCompare((s) => s.ids);
  const toggle = useCompare((s) => s.toggle);
  const active = ids.includes(productId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const res = toggle(productId);
        if (res === "full") toast.error(`En fazla ${COMPARE_MAX} ürün karşılaştırabilirsin`);
        else if (res === "added") toast.success("Karşılaştırmaya eklendi");
      }}
      aria-label="karşılaştırmaya ekle"
      title="karşılaştır"
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary"
      } ${className}`}
    >
      {active ? <Check className="h-3 w-3" /> : <GitCompare className="h-3 w-3" />}
      karşılaştır
    </button>
  );
}

export function CompareBar() {
  const ids = useCompare((s) => s.ids);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);

  const fetchProducts = useServerFn(getProductsForCompare);
  const { data } = useQuery({
    queryKey: ["compare-bar", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => (await fetchProducts({ data: { ids } })),
  });

  if (ids.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[min(680px,94vw)] -translate-x-1/2">
      <div className="glass-card rounded-xl border border-primary/40 p-3 shadow-[0_0_30px_oklch(0.82_0.20_145/0.25)]">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {(data ?? []).map((p) => (
              <span
                key={p.id}
                className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1 font-mono text-[11px]"
              >
                <span className="truncate">{p.name}</span>
                <button onClick={() => remove(p.id)} aria-label="çıkar" className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {ids.length < 2 && (
              <span className="font-mono text-[11px] text-muted-foreground self-center">
                karşılaştırmak için en az 2 ürün seç
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={clear}>
              temizle
            </Button>
            <Button asChild size="sm" disabled={ids.length < 2} className="font-mono">
              <Link to="/karsilastir">karşılaştır ({ids.length})</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
