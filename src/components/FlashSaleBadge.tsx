import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type FlashSale = {
  id: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  ends_at: string;
  label: string | null;
};

export function useActiveFlashSale(productId: string | undefined) {
  const [sale, setSale] = useState<FlashSale | null>(null);
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: new table
        .from("flash_sales" as any)
        .select("id, discount_type, discount_value, ends_at, label")
        .eq("product_id", productId)
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso)
        .order("ends_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setSale((data as unknown as FlashSale) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);
  return sale;
}

export function FlashSaleBadge({ sale }: { sale: FlashSale | null }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!sale) return;
    const tick = () => {
      const diff = new Date(sale.ends_at).getTime() - Date.now();
      if (diff <= 0) return setRemaining("bitti");
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(h > 0 ? `${h}s ${m}d` : m > 0 ? `${m}d ${s}sn` : `${s}sn`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sale]);

  if (!sale) return null;
  const value =
    sale.discount_type === "percent"
      ? `%${sale.discount_value} indirim`
      : `₺${sale.discount_value} indirim`;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-warn/50 bg-warn/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-warn animate-pulse">
      <Zap className="h-3 w-3" />
      <span>{sale.label ?? "flash"} · {value}</span>
      <span className="text-warn/80">· {remaining}</span>
    </div>
  );
}
