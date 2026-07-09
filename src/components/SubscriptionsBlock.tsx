import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Zap, XCircle, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  listMySubscriptions,
  setSubscriptionAutoRenew,
  cancelSubscription,
  renewSubscriptionNow,
  type SubscriptionRow,
} from "@/lib/subscriptions.functions";

const STATUS: Record<SubscriptionRow["status"], { label: string; cls: string }> = {
  active: { label: "aktif", cls: "text-primary border-primary/40 bg-primary/10" },
  paused: { label: "duraklatıldı", cls: "text-cyan border-cyan/40 bg-cyan/10" },
  canceled: { label: "iptal", cls: "text-muted-foreground border-border/60 bg-background/60" },
  failed: { label: "başarısız", cls: "text-destructive border-destructive/40 bg-destructive/10" },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export function SubscriptionsBlock() {
  const listFn = useServerFn(listMySubscriptions);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-subs"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const toggleFn = useServerFn(setSubscriptionAutoRenew);
  const cancelFn = useServerFn(cancelSubscription);
  const renewFn = useServerFn(renewSubscriptionNow);
  const [busy, setBusy] = useState<string | null>(null);

  async function onToggle(id: string, on: boolean) {
    setBusy(id);
    try {
      await toggleFn({ data: { subscriptionId: id, on } });
      toast.success(on ? "Otomatik yenileme açıldı" : "Otomatik yenileme kapatıldı");
      qc.invalidateQueries({ queryKey: ["my-subs"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function onCancel(id: string) {
    if (!confirm("Aboneliği iptal etmek istediğine emin misin? Kalan süre bitene kadar mevcut key çalışmaya devam eder.")) return;
    setBusy(id);
    try {
      await cancelFn({ data: { subscriptionId: id } });
      toast.success("Abonelik iptal edildi");
      qc.invalidateQueries({ queryKey: ["my-subs"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function onRenewNow(id: string) {
    setBusy(id);
    try {
      const res = await renewFn({ data: { subscriptionId: id } });
      if (res.outcome === "success") {
        toast.success("Yenilendi ✓ · Yeni key hesabında");
        qc.invalidateQueries({ queryKey: ["my-subs"] });
        qc.invalidateQueries({ queryKey: ["my-orders"] });
      } else if (res.outcome === "insufficient_funds") {
        toast.error("Cüzdan bakiyesi yetersiz. Bakiye yükleyip tekrar dene.");
      } else if (res.outcome === "no_stock") {
        toast.error("Şu an bu ürün stokta yok. Kısa süre içinde otomatik denenecek.");
      } else if (res.outcome === "canceled") {
        toast("Abonelik aktif değil.");
      } else {
        toast.error("Yenileme başarısız oldu.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="glass-card rounded-lg p-6 font-mono text-sm text-muted-foreground animate-pulse">
        yükleniyor…
      </div>
    );
  }
  const subs = data ?? [];
  if (subs.length === 0) {
    return (
      <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground">
        <RefreshCw className="mx-auto h-8 w-8 text-primary/40 mb-2" />
        Aktif aboneliğin yok. Süreli bir lisans satın aldığında otomatik olarak burada listelenir.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subs.map((s) => {
        const d = daysUntil(s.nextRenewalAt);
        const upcoming = s.status === "active" && s.autoRenew && d <= 3;
        return (
          <div
            key={s.id}
            className={`glass-card rounded-lg p-4 border ${
              s.status === "failed" ? "border-destructive/40" : upcoming ? "border-warn/40" : "border-border/60"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{s.productName ?? "—"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span className={`rounded border px-1.5 py-0.5 ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                  <span className="text-muted-foreground">{s.intervalDays} gün · ₺{s.priceTry.toLocaleString("tr-TR")}</span>
                  {s.failureCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {s.failureCount} başarısız
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right font-mono text-[11px]">
                <div className="text-muted-foreground uppercase tracking-wider">sıradaki yenileme</div>
                <div className={`text-sm ${upcoming ? "text-warn neon-text" : "text-foreground"}`}>
                  {fmtDate(s.nextRenewalAt)}
                </div>
                <div className="text-muted-foreground">
                  {d > 0 ? `${d} gün kaldı` : d === 0 ? "bugün" : `${-d} gün gecikti`}
                </div>
              </div>
            </div>

            {upcoming && (
              <div className="mt-3 flex items-center gap-2 rounded border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-[11px] text-warn">
                <Clock className="h-3.5 w-3.5" />
                Yenileme yakın · cüzdan bakiyeni kontrol et.
              </div>
            )}
            {s.status === "failed" && (
              <div className="mt-3 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                3 deneme başarısız oldu · bakiyeni yükleyip aşağıdan yeniden etkinleştir.
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <Switch
                  id={`ar-${s.id}`}
                  checked={s.autoRenew && s.status !== "canceled"}
                  disabled={busy === s.id || s.status === "canceled"}
                  onCheckedChange={(v) => onToggle(s.id, v)}
                />
                <label htmlFor={`ar-${s.id}`} className="cursor-pointer text-muted-foreground">
                  otomatik yenile
                </label>
              </div>

              {s.status !== "canceled" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === s.id}
                    onClick={() => onRenewNow(s.id)}
                    className="font-mono text-[11px]"
                  >
                    <Zap className="mr-1 h-3 w-3" /> şimdi yenile
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === s.id}
                    onClick={() => onCancel(s.id)}
                    className="font-mono text-[11px] text-destructive hover:text-destructive"
                  >
                    <XCircle className="mr-1 h-3 w-3" /> iptal et
                  </Button>
                </>
              )}

              {s.lastRenewedAt && (
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-primary" /> son: {fmtDate(s.lastRenewedAt)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
