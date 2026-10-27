import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, Clock3, History, Sparkles, XCircle } from "lucide-react";
import { getMyToolUsage, getToolQualitySummary } from "@/lib/tool-usage.functions";

function toolLabel(key: string) {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function time(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ToolUsageHistoryPanel() {
  const usageFn = useServerFn(getMyToolUsage);
  const qualityFn = useServerFn(getToolQualitySummary);
  const { data: usage, isLoading } = useQuery({
    queryKey: ["my-tool-usage"],
    queryFn: () => usageFn(),
    staleTime: 30_000,
  });
  const { data: quality = [] } = useQuery({
    queryKey: ["tool-quality-summary"],
    queryFn: () => qualityFn(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="glass-card rounded-lg p-6 text-center font-mono text-xs text-muted-foreground animate-pulse">kullanım geçmişi yükleniyor…</div>;
  }

  const totals = usage?.totals ?? { uses: 0, successful: 0, failed: 0, active_tools: 0 };
  const aiQuality = quality.filter((item) => item.tool_kind === "ai").slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Metric icon={Activity} label="toplam kullanım" value={totals.uses} />
        <Metric icon={Sparkles} label="aktif araç" value={totals.active_tools} />
        <Metric icon={CheckCircle2} label="başarılı" value={totals.successful} tone="text-primary" />
        <Metric icon={XCircle} label="başarısız" value={totals.failed} tone={totals.failed ? "text-destructive" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <section className="glass-card rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <div>
              <div className="font-mono text-xs text-primary">$ usage-history</div>
              <h2 className="font-semibold">Son kullanımlar</h2>
            </div>
          </div>
          {usage?.history.length ? (
            <div className="space-y-2">
              {usage.history.slice(0, 12).map((row) => (
                <div key={`${row.id}-${row.action}`} className="flex items-center justify-between gap-3 rounded border border-border/50 bg-background/25 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {row.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" /> : row.status === "failed" ? <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <Clock3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-mono text-xs">{toolLabel(row.tool_key)}</span>
                    {row.tool_kind === "ai" ? <span className="rounded border border-yellow-400/30 px-1.5 py-0.5 font-mono text-[9px] text-yellow-400">AI</span> : null}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{time(row.created_at)}</span>
                </div>
              ))}
            </div>
          ) : <div className="rounded border border-dashed border-border/60 p-6 text-center font-mono text-xs text-muted-foreground">henüz araç kullanımı yok</div>}
        </section>

        <section className="glass-card rounded-lg p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-yellow-400" />
            <div>
              <div className="font-mono text-xs text-yellow-400">$ ai-quality</div>
              <h2 className="font-semibold">AI araçlarının kalitesi</h2>
            </div>
          </div>
          {aiQuality.length ? (
            <div className="space-y-3">
              {aiQuality.map((item) => (
                <div key={item.tool_key}>
                  <div className="flex items-center justify-between gap-2 font-mono text-xs">
                    <span>{toolLabel(item.tool_key)}</span>
                    <span className="text-primary">{item.success_rate == null ? "—" : `%${item.success_rate}`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/40">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${item.success_rate ?? 0}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                    <span>{item.uses} kullanım · {item.rating_count ? `${item.rating}/5 puan` : "henüz puan yok"}</span>
                    <span>{item.average_duration_ms ? `${Math.round(item.average_duration_ms / 1000)} sn ort.` : "süre yok"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="rounded border border-dashed border-border/60 p-6 text-center font-mono text-xs text-muted-foreground">AI kalite verisi oluşması için üretim yapılmalı</div>}
        </section>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: number; tone?: string }) {
  return (
    <div className="glass-card rounded-lg border border-primary/10 p-3">
      <Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} />
      <div className="mt-2 font-mono text-xl text-foreground">{value.toLocaleString("tr-TR")}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
