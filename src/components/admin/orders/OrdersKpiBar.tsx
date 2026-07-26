import { Activity, Clock, TrendingUp, Timer } from "lucide-react";

type Kpis = {
  waiting: number;
  ordersToday: number;
  approvedToday: number;
  revenueToday: number;
  avgApproveMinutes: number;
};

function fmtDuration(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}s ${m}dk` : `${h} saat`;
}

export function OrdersKpiBar({ kpis, live }: { kpis?: Kpis; live: boolean }) {
  const cards = [
    {
      label: "bekleyen",
      value: kpis ? String(kpis.waiting) : "—",
      hint: "pending + inceleniyor",
      icon: Clock,
      tone: "text-warn border-warn/30",
    },
    {
      label: "bugün sipariş",
      value: kpis ? String(kpis.ordersToday) : "—",
      hint: kpis ? `${kpis.approvedToday} onaylı` : "",
      icon: Activity,
      tone: "text-cyan border-cyan/30",
    },
    {
      label: "bugün ciro",
      value: kpis ? `₺${kpis.revenueToday.toLocaleString("tr-TR")}` : "—",
      hint: "onaylı siparişler",
      icon: TrendingUp,
      tone: "text-primary border-primary/30",
    },
    {
      label: "ort. onay süresi",
      value: kpis ? fmtDuration(kpis.avgApproveMinutes) : "—",
      hint: "son 50 onay",
      icon: Timer,
      tone: "text-foreground border-border",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`glass-card rounded-xl p-4 border ${c.tone}`}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {c.label}
            </span>
            <c.icon className="h-3.5 w-3.5 opacity-70" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono">{c.value}</div>
          <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">{c.hint}</div>
        </div>
      ))}
      <div className="col-span-2 lg:col-span-4 -mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
        {live ? "canlı akış açık — yeni siparişler anında düşer" : "canlı akış bağlanıyor…"}
      </div>
    </div>
  );
}
