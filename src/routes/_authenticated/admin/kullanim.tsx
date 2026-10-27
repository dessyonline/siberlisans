import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CheckCircle2, Clock3, Star, UserRound, UserRoundX, Users } from "lucide-react";
import { getAdminToolAnalytics } from "@/lib/tool-usage.functions";

export const Route = createFileRoute("/_authenticated/admin/kullanim")({
  component: ToolUsageAdmin,
  head: () => ({ meta: [{ title: "Araç Kullanımı — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function label(key: string) {
  return key.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function duration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} sn`;
}

function ToolUsageAdmin() {
  const analyticsFn = useServerFn(getAdminToolAnalytics);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-tool-analytics"],
    queryFn: () => analyticsFn(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">kullanım analitiği yükleniyor…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">$ /admin/kullanim<span className="terminal-caret" /></div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold neon-text"><Activity className="h-5 w-5" /> Araç Kullanımı</h1>
          <p className="mt-1 text-xs text-muted-foreground">Son {data.periodDays} gün · ücretsiz araçlar + AI üretimleri</p>
        </div>
        <button type="button" onClick={() => void refetch()} className="rounded border border-primary/30 px-3 py-2 font-mono text-xs text-primary hover:bg-primary/10">yenile</button>
      </div>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Activity} label="toplam kullanım" value={data.totals.uses} />
        <Kpi icon={Users} label="benzersiz kullanıcı" value={data.totals.uniqueUsers} />
        <Kpi icon={CheckCircle2} label="başarılı" value={data.totals.successful} tone="text-primary" />
        <Kpi icon={UserRoundX} label="hiç kullanmayan" value={data.unusedUserCount} tone={data.unusedUserCount ? "text-yellow-400" : "text-primary"} />
        <Kpi icon={Star} label="verilen puan" value={data.totals.rated} tone="text-yellow-400" />
      </div>

      <section className="glass-card rounded-lg p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><div className="font-mono text-[10px] uppercase tracking-wider text-primary">$ tool-ranking</div><h2 className="font-semibold">En çok kullanılan araçlar ve kalite</h2></div>
          <Clock3 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left font-mono text-xs">
            <thead className="border-b border-border/60 text-[10px] uppercase text-muted-foreground"><tr><th className="px-2 py-2">araç</th><th className="px-2 py-2">tür</th><th className="px-2 py-2">kullanım</th><th className="px-2 py-2">kullanıcı</th><th className="px-2 py-2">başarı</th><th className="px-2 py-2">ort. süre</th><th className="px-2 py-2">puan</th></tr></thead>
            <tbody>
              {data.tools.map((tool) => <tr key={`${tool.tool_kind}-${tool.tool_key}`} className="border-b border-border/30 last:border-0"><td className="px-2 py-2.5 text-foreground">{label(tool.tool_key)}</td><td className="px-2 py-2.5"><span className={tool.tool_kind === "ai" ? "text-yellow-400" : "text-primary"}>{tool.tool_kind.toUpperCase()}</span></td><td className="px-2 py-2.5 text-primary">{tool.uses}</td><td className="px-2 py-2.5">{tool.users}</td><td className="px-2 py-2.5">{tool.success_rate == null ? "—" : `%${tool.success_rate}`}</td><td className="px-2 py-2.5 text-muted-foreground">{duration(tool.average_duration_ms)}</td><td className="px-2 py-2.5">{tool.rating == null ? "—" : `${tool.rating}/5 (${tool.rating_count})`}</td></tr>)}
            </tbody>
          </table>
          {!data.tools.length ? <div className="p-6 text-center font-mono text-xs text-muted-foreground">henüz kullanım verisi yok</div> : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <UserList title="En aktif kullanıcılar" icon={UserRound} rows={data.topUsers.map((user) => ({ id: user.id, primary: user.display_name || user.email || user.id.slice(0, 8), secondary: `${user.uses} kullanım · ${user.tools} farklı araç` }))} />
        <UserList title="Hiç araç kullanmayanlar" icon={UserRoundX} rows={data.unusedUsers.map((user) => ({ id: user.id, primary: user.display_name || user.email || user.id.slice(0, 8), secondary: user.email && user.display_name ? user.email : "son kullanım kaydı yok" }))} empty="Tüm kullanıcıların en az bir araç kullanımı var." />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: number; tone?: string }) {
  return <div className="glass-card rounded-lg border border-primary/10 p-3"><Icon className={`h-4 w-4 ${tone ?? "text-primary"}`} /><div className="mt-2 font-mono text-xl">{value.toLocaleString("tr-TR")}</div><div className="font-mono text-[10px] text-muted-foreground">{label}</div></div>;
}

function UserList({ title, icon: Icon, rows, empty }: { title: string; icon: typeof UserRound; rows: Array<{ id: string; primary: string; secondary: string }>; empty?: string }) {
  return <section className="glass-card rounded-lg p-4"><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><h2 className="font-semibold">{title}</h2></div>{rows.length ? <div className="space-y-2">{rows.slice(0, 20).map((row) => <div key={row.id} className="rounded border border-border/50 bg-background/20 px-3 py-2"><div className="truncate text-sm">{row.primary}</div><div className="font-mono text-[10px] text-muted-foreground">{row.secondary}</div></div>)}</div> : <div className="rounded border border-dashed border-border/60 p-6 text-center font-mono text-xs text-muted-foreground">{empty ?? "veri yok"}</div>}</section>;
}
