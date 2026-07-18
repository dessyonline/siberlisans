import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { listAdminAiJobs, getAdminAiStats } from "@/lib/admin-ai.functions";

export const Route = createFileRoute("/_authenticated/admin/araclar")({
  component: Page,
});

type StatusFilter = "all" | "queued" | "processing" | "completed" | "failed";

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminAiJobs);
  const statsFn = useServerFn(getAdminAiStats);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: jobs = [] } = useQuery({
    queryKey: ["admin-ai-jobs", status, search],
    queryFn: () => listFn({ data: { status, search, limit: 100 } }),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-ai-stats"],
    queryFn: () => statsFn(),
  });

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["admin-ai-jobs"] });
    qc.invalidateQueries({ queryKey: ["admin-ai-stats"] });
  };

  const complete = async (id: string) => {
    const url = urls[id]?.trim();
    if (!url) return toast.error("URL girmelisin");
    setBusy(id);
    const { error } = await supabase.rpc("admin_complete_ai_job", { _job: id, _url: url });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Tamamlandı");
    refetch();
  };

  const fail = async (id: string, refund: boolean) => {
    const reason = prompt("Başarısızlık nedeni?") ?? "";
    if (!reason) return;
    setBusy(id);
    const { error } = await supabase.rpc("admin_fail_ai_job", { _job: id, _reason: reason, _refund: refund });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(refund ? "İade edildi" : "Başarısız işaretlendi");
    refetch();
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "hepsi" },
    { key: "queued", label: "kuyruk" },
    { key: "processing", label: "işleniyor" },
    { key: "completed", label: "tamamlandı" },
    { key: "failed", label: "başarısız" },
  ];

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4">
        <h1 className="font-mono text-xl neon-text">$ ./admin --ai-jobs</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Son 30 gün · Toplam: {stats?.totalJobs ?? 0} istem · Maliyet: ₺{(stats?.totalCost ?? 0).toFixed(2)}
        </p>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="toplam istem" value={String(stats.totalJobs)} />
          <StatCard label="toplam maliyet" value={`₺${stats.totalCost.toFixed(2)}`} />
          <StatCard label="aktif abonelik" value={String(stats.activeSubs)} sub={`₺${stats.subRevenue.toFixed(0)} ciro`} />
          <StatCard
            label="durum dağılımı"
            value={`${stats.byStatus.completed ?? 0} ✓ / ${stats.byStatus.failed ?? 0} ✗`}
            sub={`${(stats.byStatus.queued ?? 0) + (stats.byStatus.processing ?? 0)} bekleyen`}
          />
        </div>
      )}

      {stats && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="glass-card rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">tür dağılımı (video)</div>
            <div className="space-y-1">
              {Object.entries(stats.byKind).length === 0 ? (
                <div className="text-xs text-muted-foreground">veri yok</div>
              ) : (
                Object.entries(stats.byKind).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs font-mono">
                    <span className="text-foreground/80">{k}</span>
                    <span className="text-primary">{v}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">ücretsiz araç kullanımı</div>
            <div className="space-y-1">
              {Object.entries(stats.byTool).length === 0 ? (
                <div className="text-xs text-muted-foreground">veri yok</div>
              ) : (
                Object.entries(stats.byTool)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs font-mono">
                      <span className="text-foreground/80">{k}</span>
                      <span className="text-primary">{v}</span>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="glass-card rounded-lg p-4">
            <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">abonelik planları</div>
            <div className="space-y-1">
              {Object.entries(stats.subsByPlan).length === 0 ? (
                <div className="text-xs text-muted-foreground">aktif abone yok</div>
              ) : (
                Object.entries(stats.subsByPlan).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs font-mono">
                    <span className="text-foreground/80">{k}</span>
                    <span className="text-primary">{v} kullanıcı</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top users */}
      {stats && stats.topUsers.length > 0 && (
        <div className="glass-card rounded-lg p-4">
          <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">en aktif kullanıcılar (30g)</div>
          <div className="space-y-1">
            {stats.topUsers.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono border-b border-border/20 pb-1">
                <div className="min-w-0 flex-1">
                  <span className="text-foreground">{u.display_name ?? "—"}</span>
                  <span className="text-muted-foreground ml-2 truncate">{u.email ?? u.id.slice(0, 8)}</span>
                </div>
                <div className="flex gap-3 shrink-0">
                  <span className="text-primary">{u.jobs} video</span>
                  <span className="text-primary/70">{u.tool_calls} araç</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={status === f.key ? "default" : "outline"}
            onClick={() => setStatus(f.key)}
            className="font-mono text-xs h-8"
          >
            {f.label}
          </Button>
        ))}
        <Input
          placeholder="istem içinde ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 font-mono text-xs"
        />
      </div>

      {/* Jobs list */}
      <div className="space-y-2">
        {jobs.length === 0 && (
          <div className="text-xs text-muted-foreground font-mono glass-card rounded-lg p-4">kayıt bulunamadı</div>
        )}
        {jobs.map((j: any) => {
          const isOpen = expanded[j.id];
          return (
            <div key={j.id} className="glass-card rounded-lg p-3 text-xs font-mono">
              <div className="flex flex-wrap justify-between gap-2 items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        j.status === "completed"
                          ? "bg-primary/20 text-primary"
                          : j.status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {j.status}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(j.created_at).toLocaleString("tr-TR")}
                    </span>
                    <span className="text-primary/70">{j.kind}</span>
                    <span className="text-muted-foreground">
                      {j.params?.duration}s · {j.params?.aspect} · ₺{j.cost_try}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-foreground">{j.user?.display_name ?? "—"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-primary">{j.user?.email ?? j.user_id?.slice(0, 8)}</span>
                    {j.user?.tier && (
                      <span className="text-[10px] px-1 rounded bg-primary/10 text-primary">{j.user.tier}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [j.id]: !isOpen }))}
                  className="text-[10px] text-muted-foreground hover:text-primary shrink-0"
                >
                  {isOpen ? "gizle" : "detay"}
                </button>
              </div>

              <div className={`mt-2 text-foreground/80 ${isOpen ? "" : "line-clamp-2"}`}>{j.prompt}</div>

              {isOpen && (
                <div className="mt-2 space-y-1 text-[11px]">
                  {j.provider && (
                    <div className="text-muted-foreground">
                      provider: <span className="text-primary">{j.provider}</span>
                      {j.provider_model ? ` · ${j.provider_model}` : ""}
                    </div>
                  )}
                  <div className="text-muted-foreground">job_id: {j.id}</div>
                  <div className="text-muted-foreground">user_id: {j.user_id}</div>
                </div>
              )}

              {j.result_url && (
                <a href={j.result_url} target="_blank" rel="noreferrer" className="text-primary hover:underline block mt-1 truncate">
                  {j.result_url}
                </a>
              )}
              {j.error && <div className="text-red-400 mt-1">{j.error}</div>}

              {(j.status === "queued" || j.status === "processing") && (
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  <Input
                    placeholder="video url (mp4)"
                    value={urls[j.id] ?? ""}
                    onChange={(e) => setUrls((u) => ({ ...u, [j.id]: e.target.value }))}
                    className="max-w-md h-8"
                  />
                  <Button size="sm" onClick={() => complete(j.id)} disabled={busy === j.id}>
                    tamamla
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => fail(j.id, true)} disabled={busy === j.id}>
                    başarısız + iade
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => fail(j.id, false)} disabled={busy === j.id}>
                    başarısız
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card rounded-lg p-4">
      <div className="text-[10px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-mono neon-text mt-1">{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
