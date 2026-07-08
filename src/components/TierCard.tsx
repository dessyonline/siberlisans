import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Trophy, Sparkles } from "lucide-react";

type Tier = "bronze" | "silver" | "gold" | "platinum";

const TIER_INFO: Record<
  Tier,
  { label: string; color: string; ring: string; discount: number; next?: { tier: string; at: number } }
> = {
  bronze: {
    label: "Bronz",
    color: "text-amber-600",
    ring: "border-amber-600/40 bg-amber-600/5",
    discount: 0,
    next: { tier: "Gümüş", at: 500 },
  },
  silver: {
    label: "Gümüş",
    color: "text-slate-300",
    ring: "border-slate-300/40 bg-slate-300/5",
    discount: 3,
    next: { tier: "Altın", at: 2000 },
  },
  gold: {
    label: "Altın",
    color: "text-yellow-400",
    ring: "border-yellow-400/40 bg-yellow-400/5",
    discount: 5,
    next: { tier: "Platin", at: 5000 },
  },
  platinum: {
    label: "Platin",
    color: "text-primary",
    ring: "border-primary/40 bg-primary/5",
    discount: 8,
  },
};

type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
};

export function TierCard() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["tier-card", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [profRes, ledgerRes] = await Promise.all([
        supabase.from("profiles").select("total_points, tier").eq("id", user!.id).single(),
        supabase
          .from("user_points_ledger")
          .select("id, delta, reason, balance_after, created_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      return {
        points: (profRes.data?.total_points as number | undefined) ?? 0,
        tier: ((profRes.data?.tier as Tier | undefined) ?? "bronze") as Tier,
        ledger: (ledgerRes.data ?? []) as LedgerRow[],
      };
    },
  });

  const info = TIER_INFO[data?.tier ?? "bronze"];
  const points = data?.points ?? 0;
  const progress = info.next ? Math.min(100, Math.round((points / info.next.at) * 100)) : 100;
  const toNext = info.next ? Math.max(0, info.next.at - points) : 0;

  return (
    <div className={`glass-card corner-cut rounded-md p-4 border ${info.ring}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className={`h-5 w-5 shrink-0 ${info.color}`} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">seviye</div>
            <div className={`text-lg font-bold font-mono ${info.color}`}>{info.label}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">puan</div>
          <div className="text-xl neon-text font-mono">{points.toLocaleString("tr-TR")}</div>
        </div>
      </div>

      {info.next ? (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span>{info.discount > 0 ? `%${info.discount} sürekli indirim` : "avantajları keşfet"}</span>
            <span>
              {toNext.toLocaleString("tr-TR")} puan → {info.next.tier}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono text-primary">
          <Sparkles className="h-3 w-3" />
          maksimum seviyedesin · %{info.discount} sürekli indirim
        </div>
      )}

      {data?.ledger && data.ledger.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-border/60 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-1">
            son hareketler
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {data.ledger.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="text-muted-foreground truncate">
                  {new Date(r.created_at).toLocaleDateString("tr-TR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}{" "}
                  · {r.reason}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    r.delta > 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {r.delta > 0 ? "+" : ""}
                  {r.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-[10px] font-mono text-muted-foreground/70">
        her ₺10 sipariş = 1 puan · yorum yaz +20 · 100 puan = ₺1 sepet indirimi
      </div>
    </div>
  );
}
