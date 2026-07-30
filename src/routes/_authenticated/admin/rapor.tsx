import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getProfitReport } from "@/lib/admin-audit.functions";
import {
  listManualRevenue,
  addManualRevenue,
  deleteManualRevenue,
  repairDeliveries,
} from "@/lib/manual-revenue.functions";
import { Loader2, TrendingUp, RefreshCw, Download, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/admin/rapor")({
  ssr: false,
  component: ReportPage,
  head: () => ({ meta: [{ title: "Kar / Zarar Raporu — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function toLocalDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ReportPage() {
  const reportFn = useServerFn(getProfitReport);
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const [from, setFrom] = useState(toLocalDateInput(monthAgo));
  const [to, setTo] = useState(toLocalDateInput(now));
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");

  const fromISO = useMemo(() => new Date(from + "T00:00:00").toISOString(), [from]);
  const toISO = useMemo(() => new Date(to + "T23:59:59").toISOString(), [to]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["profit-report", fromISO, toISO, granularity],
    queryFn: () => reportFn({ data: { from: fromISO, to: toISO, granularity } }),
  });

  // ——— manuel gelir ———
  const qc = useQueryClient();
  const listManual = useServerFn(listManualRevenue);
  const addManual = useServerFn(addManualRevenue);
  const delManual = useServerFn(deleteManualRevenue);
  const repairFn = useServerFn(repairDeliveries);

  const [mAmount, setMAmount] = useState("");
  const [mCost, setMCost] = useState("");
  const [mLabel, setMLabel] = useState("");
  const [mDate, setMDate] = useState(toLocalDateInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const { data: manualRows = [] } = useQuery({
    queryKey: ["manual-revenue", fromISO, toISO],
    queryFn: () => listManual({ data: { from: fromISO, to: toISO } }),
  });

  const manualTotal = manualRows.reduce((a, r) => a + Number(r.amount_try), 0);

  async function saveManual() {
    const amount = Number(mAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) return toast.error("Geçerli bir tutar gir.");
    if (!mLabel.trim()) return toast.error("Açıklama zorunlu.");
    setSaving(true);
    try {
      await addManual({
        data: {
          amount,
          cost: Number((mCost || "0").replace(",", ".")) || 0,
          label: mLabel.trim(),
          occurred_at: new Date(mDate + "T12:00:00").toISOString(),
        },
      });
      toast.success("Ciroya eklendi");
      setMAmount(""); setMCost(""); setMLabel("");
      qc.invalidateQueries({ queryKey: ["manual-revenue"] });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  async function removeManual(id: string) {
    try {
      await delManual({ data: { id } });
      qc.invalidateQueries({ queryKey: ["manual-revenue"] });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Silinemedi");
    }
  }

  async function runRepair() {
    setRepairing(true);
    try {
      const res = await repairFn();
      const ok = res.filter((r) => r.outcome === "teslim edildi").length;
      toast.success(ok > 0 ? `${ok} sipariş teslimatı tamamlandı` : "Eksik teslimat bulunamadı");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Onarım başarısız");
    } finally {
      setRepairing(false);
    }
  }

  const series = data?.series ?? [];
  const byProduct = data?.byProduct ?? [];



  const totals = series.reduce(
    (acc, r) => ({
      orders: acc.orders + Number(r.orders_count),
      revenue: acc.revenue + Number(r.revenue),
      gross: acc.gross + Number(r.gross_revenue ?? 0),
      discount: acc.discount + Number(r.discount_total ?? 0),
      cost: acc.cost + Number(r.cost),
      profit: acc.profit + Number(r.profit),
      refunds: acc.refunds + Number(r.refunds),
      topups: acc.topups + Number(r.topups ?? 0),
    }),
    { orders: 0, revenue: 0, gross: 0, discount: 0, cost: 0, profit: 0, refunds: 0, topups: 0 },
  );

  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;


  const maxProfit = Math.max(1, ...series.map((s) => Number(s.profit)));

  function exportCsv() {
    const header = ["tarih", "sipariş", "brüt_ciro", "kupon_indirim", "net_ciro", "maliyet", "kar", "iade", "bakiye_yükleme"].join(",");
    const rows = series.map((r) =>
      [
        r.bucket,
        r.orders_count,
        r.gross_revenue ?? 0,
        r.discount_total ?? 0,
        r.revenue,
        r.cost,
        r.profit,
        r.refunds,
        r.topups ?? 0,
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapor-${from}-${to}.csv`;
    a.click();
  }


  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-xs text-muted-foreground">$ /admin/rapor<span className="terminal-caret" /></div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-bold neon-text md:text-2xl">
          <TrendingUp className="h-5 w-5" /> Kar / Zarar Raporu
        </h1>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-lg p-3 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block font-mono text-[10px] text-muted-foreground mb-1">başlangıç</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-primary/30 bg-background/40 px-2 py-1.5 font-mono text-xs" />
        </div>
        <div>
          <label className="block font-mono text-[10px] text-muted-foreground mb-1">bitiş</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded border border-primary/30 bg-background/40 px-2 py-1.5 font-mono text-xs" />
        </div>
        <div>
          <label className="block font-mono text-[10px] text-muted-foreground mb-1">aralık</label>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}
            className="rounded border border-primary/30 bg-background/40 px-2 py-1.5 font-mono text-xs">
            <option value="day">günlük</option>
            <option value="week">haftalık</option>
            <option value="month">aylık</option>
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={series.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi label="sipariş" value={String(totals.orders)} />
        <Kpi label="brüt ciro" value={`₺${fmt(totals.gross)}`} tone="muted" />
        <Kpi label="kupon indirim" value={`−₺${fmt(totals.discount)}`} tone={totals.discount > 0 ? "bad" : "muted"} />
        <Kpi label="net ciro" value={`₺${fmt(totals.revenue)}`} />
        <Kpi label="maliyet" value={`₺${fmt(totals.cost)}`} tone="muted" />
        <Kpi label="net kar" value={`₺${fmt(totals.profit)}`} tone={totals.profit >= 0 ? "good" : "bad"} />
        <Kpi label="marj" value={`%${fmt(margin)}`} tone={margin >= 20 ? "good" : margin >= 0 ? "muted" : "bad"} />
        <Kpi label="iade / iptal" value={`₺${fmt(totals.refunds)}`} tone={totals.refunds > 0 ? "bad" : "muted"} />
        <Kpi label="bakiye yükleme" value={`₺${fmt(totals.topups)}`} tone="good" />
      </div>


      {/* Bar chart */}
      <div className="glass-card rounded-lg p-4">
        <div className="font-mono text-xs text-muted-foreground mb-3">kar dağılımı</div>
        {series.length === 0 ? (
          <div className="text-sm text-muted-foreground font-mono py-8 text-center">
            {isFetching ? "yükleniyor…" : "seçilen aralıkta veri yok"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {series.map((r) => {
              const p = Number(r.profit);
              const width = Math.max(2, (p / maxProfit) * 100);
              return (
                <div key={r.bucket} className="flex items-center gap-2 text-xs font-mono">
                  <div className="w-24 text-muted-foreground shrink-0">
                    {new Date(r.bucket).toLocaleDateString("tr-TR")}
                  </div>
                  <div className="flex-1 h-5 rounded bg-background/40 border border-border/40 overflow-hidden">
                    <div
                      className={`h-full ${p >= 0 ? "bg-primary/60" : "bg-destructive/60"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-primary shrink-0">₺{fmt(p)}</div>
                  <div className="hidden md:block w-20 text-right text-cyan shrink-0" title="günlük onaylı bakiye yüklemesi">
                    +₺{fmt(Number(r.topups ?? 0))}
                  </div>
                  <div className="hidden md:block w-16 text-right text-muted-foreground shrink-0">
                    {Number(r.orders_count)} sip.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* Per-product */}
      <div className="glass-card rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 font-mono text-xs text-muted-foreground">
          ürün bazlı kar / zarar (en karlıdan)
        </div>
        <table className="w-full text-xs font-mono">
          <thead className="bg-primary/5 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">ürün</th>
              <th className="text-right px-3 py-2">adet</th>
              <th className="text-right px-3 py-2">ciro</th>
              <th className="text-right px-3 py-2">maliyet</th>
              <th className="text-right px-3 py-2">kar</th>
              <th className="text-right px-3 py-2">marj</th>
            </tr>
          </thead>
          <tbody>
            {byProduct.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">veri yok</td></tr>
            )}
            {byProduct.map((r) => {
              const rev = Number(r.revenue);
              const pr = Number(r.profit);
              const m = rev > 0 ? (pr / rev) * 100 : 0;
              return (
                <tr key={r.product_id} className="border-t border-border/40">
                  <td className="px-3 py-2 truncate max-w-[240px]">{r.product_name}</td>
                  <td className="px-3 py-2 text-right">{Number(r.qty_sold)}</td>
                  <td className="px-3 py-2 text-right">₺{fmt(rev)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">₺{fmt(Number(r.cost))}</td>
                  <td className={`px-3 py-2 text-right ${pr >= 0 ? "text-primary" : "text-destructive"}`}>₺{fmt(pr)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">%{fmt(m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "good" | "bad" }) {
  const cls = tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="font-mono text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg font-bold ${cls}`}>{value}</div>
    </div>
  );
}
