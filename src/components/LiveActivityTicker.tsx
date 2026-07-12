import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Zap, KeyRound } from "lucide-react";

type Item = { name: string; when: string; category: string | null };

/**
 * Anasayfada hero altında akan canlı sipariş akışı — son 20 onaylı sipariş
 * (kişisel bilgi taşımıyor, sadece ürün adı + kategori).
 */
export function LiveActivityTicker() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // biome-ignore lint/suspicious/noExplicitAny: new rpc, types lag
      const { data } = await (supabase.rpc as any)("public_recent_sales");
      if (cancelled) return;
      const mapped: Item[] = ((data ?? []) as Array<{ name: string; category: string | null; created_at: string }>).map(
        (r) => ({ name: r.name, category: r.category, when: relative(r.created_at) }),
      );
      setItems(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;
  // duplicate for seamless marquee
  const loop = [...items, ...items];

  return (
    <div className="relative border-y border-border/40 bg-background/60 overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-background to-transparent z-10" />
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="shrink-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
            <span className="relative h-2 w-2 rounded-full bg-primary" />
          </span>
          canlı akış
        </div>
        <div className="flex-1 overflow-hidden">
          <div
            className="flex gap-6 whitespace-nowrap"
            style={{ animation: "activity-marquee 45s linear infinite" }}
          >
            {loop.map((it, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-foreground">{it.name}</span>
                <span className="text-primary/60">·</span>
                <span className="text-muted-foreground">{it.category ?? "lisans"}</span>
                <span className="text-primary/60">·</span>
                <span className="text-primary/80">{it.when}</span>
                <KeyRound className="h-3 w-3 text-primary/60" />
                <Zap className="h-3 w-3 text-warn/70" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes activity-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}
