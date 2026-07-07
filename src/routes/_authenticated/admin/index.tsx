import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Admin — SiberPHP" }] }),
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orders, pending, keys] = await Promise.all([
        supabase.from("orders").select("id, price_try, status, created_at"),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "reviewing"]),
        supabase.from("license_keys").select("id", { count: "exact", head: true }).eq("status", "available"),
      ]);
      const all = orders.data ?? [];
      const approved = all.filter((o) => o.status === "approved");
      const totalRev = approved.reduce((s, o) => s + Number(o.price_try), 0);

      // last 14 days
      const days: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days[d.toISOString().slice(0, 10)] = 0;
      }
      approved.forEach((o) => {
        const k = new Date(o.created_at).toISOString().slice(0, 10);
        if (k in days) days[k] += Number(o.price_try);
      });
      const chart = Object.entries(days).map(([date, revenue]) => ({
        date: date.slice(5),
        revenue,
      }));

      return {
        totalRev,
        totalOrders: all.length,
        pendingCount: pending.count ?? 0,
        availableKeys: keys.count ?? 0,
        chart,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="font-mono text-xs text-muted-foreground">$ ./dashboard --stats</div>
      <h1 className="font-mono text-2xl neon-text">Kontrol Merkezi</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="toplam gelir" value={`₺${(stats?.totalRev ?? 0).toLocaleString("tr-TR")}`} />
        <Stat label="toplam sipariş" value={String(stats?.totalOrders ?? 0)} />
        <Stat label="bekleyen" value={String(stats?.pendingCount ?? 0)} warn={!!stats?.pendingCount} />
        <Stat label="stok (key)" value={String(stats?.availableKeys ?? 0)} warn={(stats?.availableKeys ?? 0) < 5} />
      </div>

      <div className="glass-card rounded-lg p-4">
        <div className="font-mono text-xs text-muted-foreground mb-2">$ tail -14 revenue.log</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.chart ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.03 220 / 0.4)" />
              <XAxis dataKey="date" stroke="oklch(0.65 0.03 200)" style={{ fontFamily: "JetBrains Mono", fontSize: 10 }} />
              <YAxis stroke="oklch(0.65 0.03 200)" style={{ fontFamily: "JetBrains Mono", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "oklch(0.18 0.02 240)", border: "1px solid oklch(0.85 0.24 145 / 0.4)", fontFamily: "JetBrains Mono" }}
              />
              <Bar dataKey="revenue" fill="oklch(0.85 0.24 145)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`glass-card rounded-lg p-4 ${warn ? "border-warn/40" : ""}`}>
      <div className="font-mono text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl ${warn ? "text-warn" : "neon-text"}`}>{value}</div>
    </div>
  );
}
