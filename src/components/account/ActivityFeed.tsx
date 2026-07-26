import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  KeyRound,
  ShoppingCart,
} from "lucide-react";

type Item = {
  id: string;
  ts: string;
  icon: typeof Activity;
  title: string;
  detail: string;
  tone: "primary" | "muted" | "destructive" | "warn";
};

const TONE: Record<Item["tone"], string> = {
  primary: "text-primary",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
  warn: "text-warn",
};

const ORDER_TONE: Record<string, Item["tone"]> = {
  approved: "primary",
  rejected: "destructive",
  cancelled: "destructive",
  failed: "destructive",
  pending: "warn",
  reviewing: "warn",
};

export function ActivityFeed({ userId }: { userId: string }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["account-activity", userId],
    enabled: !!userId,
    refetchInterval: 20000,
    queryFn: async (): Promise<Item[]> => {
      const [orders, txns, notifs, keys] = await Promise.all([
        supabase
          .from("orders")
          .select("id, status, price_try, reference_code, created_at, product:products(name)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("wallet_transactions")
          .select("id, kind, amount_try, note, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("notifications")
          .select("id, title, body, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("license_keys")
          .select("id, key_value, delivered_at, product:products(name)")
          .eq("assigned_user_id", userId)
          .not("delivered_at", "is", null)
          .order("delivered_at", { ascending: false })
          .limit(6),
      ]);

      const out: Item[] = [];

      (orders.data ?? []).forEach((o) => {
        out.push({
          id: `o-${o.id}`,
          ts: o.created_at,
          icon: ShoppingCart,
          title: (o.product as { name?: string } | null)?.name ?? "Sipariş",
          detail: `${o.reference_code} · ₺${Number(o.price_try).toLocaleString("tr-TR")} · ${o.status}`,
          tone: ORDER_TONE[o.status] ?? "muted",
        });
      });

      (txns.data ?? []).forEach((t) => {
        const amt = Number(t.amount_try);
        out.push({
          id: `t-${t.id}`,
          ts: t.created_at,
          icon: amt >= 0 ? ArrowDownLeft : ArrowUpRight,
          title: t.kind === "topup" ? "Bakiye yükleme" : t.kind === "purchase" ? "Satın alma" : t.kind,
          detail: `${amt >= 0 ? "+" : ""}${amt.toLocaleString("tr-TR")} ₺${t.note ? ` · ${t.note}` : ""}`,
          tone: amt >= 0 ? "primary" : "destructive",
        });
      });

      (notifs.data ?? []).forEach((n) => {
        out.push({
          id: `n-${n.id}`,
          ts: n.created_at,
          icon: Bell,
          title: n.title,
          detail: n.body ?? "",
          tone: "muted",
        });
      });

      (keys.data ?? []).forEach((k) => {
        out.push({
          id: `k-${k.id}`,
          ts: k.delivered_at as string,
          icon: KeyRound,
          title: `Anahtar teslim: ${(k.product as { name?: string } | null)?.name ?? "-"}`,
          detail: `${String(k.key_value).slice(0, 6)}••••`,
          tone: "primary",
        });
      });

      return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 14);
    },
  });

  return (
    <div className="glass-card corner-cut rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-primary" /> $ tail -f hesap_aktivite.log
        </div>
        <Link to="/bildirimler" className="font-mono text-[11px] text-primary hover:underline">
          bildirimler →
        </Link>
      </div>

      {isLoading && (
        <div className="animate-pulse font-mono text-xs text-muted-foreground">yükleniyor…</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="font-mono text-xs text-muted-foreground">henüz aktivite yok</div>
      )}

      <div className="relative space-y-2">
        {items.length > 0 && (
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border/60" aria-hidden />
        )}
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.id} className="relative flex gap-3 pl-0">
              <div
                className={`z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border border-border/70 bg-background ${TONE[it.tone]}`}
              >
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1 border-b border-border/30 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate font-mono text-xs text-foreground">{it.title}</div>
                  <div className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {new Date(it.ts).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                {it.detail && (
                  <div className={`truncate font-mono text-[11px] ${TONE[it.tone]}`}>{it.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
