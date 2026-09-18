import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListSubscriptions } from "@/lib/subscriptions.functions";
import { RefreshCw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/abonelikler")({
  component: AdminSubscriptions,
  head: () => ({ meta: [{ title: "Abonelikler — Admin" }, { name: "robots", content: "noindex" }] }),
});

type Row = {
  id: string;
  status: "active" | "paused" | "canceled" | "failed";
  autoRenew: boolean;
  intervalDays: number;
  priceTry: number;
  nextRenewalAt: string;
  lastRenewedAt: string | null;
  failureCount: number;
  userId: string;
  product: { name: string; slug: string } | null;
  profile: { email: string | null; displayName: string | null } | null;
};

const STATUS_LABEL: Record<Row["status"], string> = {
  active: "aktif",
  paused: "duraklatıldı",
  canceled: "iptal",
  failed: "başarısız",
};
const STATUS_CLS: Record<Row["status"], string> = {
  active: "text-primary border-primary/40 bg-primary/10",
  paused: "text-cyan border-cyan/40 bg-cyan/10",
  canceled: "text-muted-foreground border-border/60 bg-background/60",
  failed: "text-destructive border-destructive/40 bg-destructive/10",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function AdminSubscriptions() {
  const listFn = useServerFn(adminListSubscriptions);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subs"],
    queryFn: async (): Promise<Row[]> => listFn(),
    staleTime: 15_000,
  });

  const rows = data ?? [];
  const total = rows.length;
  const active = rows.filter((r) => r.status === "active").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const mrr = rows
    .filter((r) => r.status === "active" && r.autoRenew)
    .reduce((s, r) => s + (Number(r.priceTry) * 30) / r.intervalDays, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-mono">
        <RefreshCw className="h-4 w-4 text-primary" />
        <h1 className="text-lg neon-text">$ abonelikler</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="toplam" value={total} />
        <Stat label="aktif" value={active} tone="primary" />
        <Stat label="başarısız" value={failed} tone="destructive" />
        <Stat label="tahmini aylık gelir" value={`₺${Math.round(mrr).toLocaleString("tr-TR")}`} tone="warn" />
      </div>

      {isLoading && (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">
          yükleniyor…
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground">
          Henüz abonelik yok.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="glass-card rounded-lg p-3 border border-border/60">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{r.product?.name ?? "—"}</div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">
                  {r.profile?.displayName || r.profile?.email || r.userId.slice(0, 8)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className={`rounded border px-1.5 py-0.5 ${STATUS_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                <span className={`rounded border px-1.5 py-0.5 ${r.autoRenew ? "border-primary/40 text-primary bg-primary/10" : "border-border/60 text-muted-foreground"}`}>
                  {r.autoRenew ? "auto ON" : "auto OFF"}
                </span>
                <span className="text-muted-foreground">
                  {r.intervalDays}g · ₺{Number(r.priceTry).toLocaleString("tr-TR")}
                </span>
                {r.failureCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {r.failureCount}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-[10px] text-muted-foreground">
              <div>sıradaki: <span className="text-foreground">{fmt(r.nextRenewalAt)}</span></div>
              <div>son: <span className="text-foreground">{fmt(r.lastRenewedAt)}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "primary" | "destructive" | "warn" }) {
  const cls =
    tone === "primary" ? "text-primary neon-text" :
    tone === "destructive" ? "text-destructive" :
    tone === "warn" ? "text-warn" : "text-foreground";
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-xl ${cls}`}>{value}</div>
    </div>
  );
}
