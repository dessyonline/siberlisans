import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  KeyRound,
  AlertTriangle,
  MessageCircle,
  ArrowUpRight,
  Package,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Admin — SiberPHP" }] }),
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [ordersRes, pendingRes, keysRes, lowStockRes, messagesRes, recentRes] =
        await Promise.all([
          supabase.from("orders").select("id, price_try, status, created_at"),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "reviewing"]),
          supabase
            .from("license_keys")
            .select("id", { count: "exact", head: true })
            .eq("status", "available"),
          supabase
            .from("products")
            .select("id, name, slug, stock_hint, unlimited_stock, manual_fulfillment, license_keys(id, status)")
            .eq("active", true),
          supabase
            .from("orders")
            .select("id, reference_code, created_at, user_note, product:products(name)")
            .not("user_note", "is", null)
            .neq("status", "rejected")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("orders")
            .select("id, status, price_try, reference_code, created_at, product:products(name)")
            .order("created_at", { ascending: false })
            .limit(6),
        ]);

      const all = ordersRes.data ?? [];
      const approved = all.filter((o) => o.status === "approved");
      const totalRev = approved.reduce((s, o) => s + Number(o.price_try), 0);

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const todayRev = approved
        .filter((o) => new Date(o.created_at).toISOString().slice(0, 10) === today)
        .reduce((s, o) => s + Number(o.price_try), 0);

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

      const lowStock = (lowStockRes.data ?? [])
        .map((p) => {
          const avail = (p.license_keys ?? []).filter(
            (k: { status: string }) => k.status === "available"
          ).length;
          return {
            id: p.id,
            name: p.name,
            slug: p.slug,
            avail,
            unlimited: !!p.unlimited_stock,
            manual: !!p.manual_fulfillment,
            hint: p.stock_hint,
          };
        })
        .filter((p) => !p.unlimited && !p.manual && p.avail < 3)
        .sort((a, b) => a.avail - b.avail);

      return {
        totalRev,
        todayRev,
        totalOrders: all.length,
        pendingCount: pendingRes.count ?? 0,
        availableKeys: keysRes.count ?? 0,
        chart,
        lowStock,
        messages: messagesRes.data ?? [],
        recent: recentRes.data ?? [],
      };
    },
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-8">
      <div>
        <div className="font-mono text-xs text-muted-foreground">./admin/overview</div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">Kontrol Merkezi</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="Toplam Ciro"
          value={`₺${(stats?.totalRev ?? 0).toLocaleString("tr-TR")}`}
          sub={`Bugün ₺${(stats?.todayRev ?? 0).toLocaleString("tr-TR")}`}
          accent="primary"
        />
        <Stat
          icon={ShoppingBag}
          label="Toplam Sipariş"
          value={String(stats?.totalOrders ?? 0)}
        />
        <Stat
          icon={Clock}
          label="Bekleyen"
          value={String(stats?.pendingCount ?? 0)}
          warn={(stats?.pendingCount ?? 0) > 0}
          href="/admin/siparisler"
        />
        <Stat
          icon={KeyRound}
          label="Havuz Key"
          value={String(stats?.availableKeys ?? 0)}
          warn={(stats?.availableKeys ?? 0) < 5}
          href="/admin/keyler"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card rounded-xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono">Son 14 gün</div>
              <div className="text-lg font-semibold">Ciro Grafiği</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 220 / 0.5)" vertical={false} />
                <XAxis dataKey="date" stroke="oklch(0.60 0.02 200)" style={{ fontFamily: "JetBrains Mono Variable", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.60 0.02 200)" style={{ fontFamily: "JetBrains Mono Variable", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "oklch(0.20 0.015 240 / 0.5)" }}
                  contentStyle={{
                    background: "oklch(0.17 0.015 240)",
                    border: "1px solid oklch(0.28 0.02 220)",
                    borderRadius: 8,
                    fontFamily: "Inter",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`₺${v.toLocaleString("tr-TR")}`, "ciro"]}
                />
                <Bar dataKey="revenue" fill="oklch(0.82 0.20 145)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> müşteri mesajları
              </div>
              <div className="text-lg font-semibold">
                {stats?.messages?.length ?? 0} yeni not
              </div>
            </div>
            <Link
              to="/admin/siparisler"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              tümü <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(stats?.messages ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">mesaj yok</div>
            )}
            {(stats?.messages ?? []).map((m) => (
              <Link
                key={m.id}
                to="/admin/siparisler"
                className="block rounded-lg border border-border/60 p-3 hover:border-primary/40 hover:bg-primary/5 transition"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-primary truncate">{m.reference_code}</span>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(m.created_at).toLocaleDateString("tr-TR")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {m.product?.name}
                </div>
                <div className="text-sm mt-1 line-clamp-2">{m.user_note}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-warn" /> düşük stok uyarısı
              </div>
              <div className="text-lg font-semibold">
                {stats?.lowStock?.length ?? 0} ürün
              </div>
            </div>
            <Link
              to="/admin/keyler"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              havuzu yönet <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {(stats?.lowStock ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">
                tüm ürünlerde yeterli stok var ✓
              </div>
            )}
            {(stats?.lowStock ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">/{p.slug}</div>
                </div>
                <div
                  className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border ${
                    p.avail === 0
                      ? "text-destructive border-destructive/40 bg-destructive/10"
                      : "text-warn border-warn/40 bg-warn/10"
                  }`}
                >
                  {p.avail === 0 ? "TÜKENDİ" : `${p.avail} kaldı`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <Package className="h-3 w-3" /> son siparişler
              </div>
              <div className="text-lg font-semibold">Aktivite</div>
            </div>
          </div>
          <div className="space-y-2">
            {(stats?.recent ?? []).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{o.product?.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {o.reference_code} · {new Date(o.created_at).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <div className="font-mono text-sm text-primary">
                    ₺{Number(o.price_try).toLocaleString("tr-TR")}
                  </div>
                  <StatusPill status={o.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  warn,
  accent,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  accent?: "primary";
  href?: string;
}) {
  const inner = (
    <div
      className={`glass-card rounded-xl p-5 transition ${
        href ? "hover:border-primary/40 hover:-translate-y-0.5" : ""
      } ${warn ? "border-warn/40" : ""} ${accent ? "border-primary/40" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-mono">{label}</div>
        <Icon className={`h-4 w-4 ${warn ? "text-warn" : accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <div
        className={`mt-2 text-3xl font-semibold tracking-tight ${
          warn ? "text-warn" : accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground font-mono">{sub}</div>}
    </div>
  );
  return href ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: "text-muted-foreground border-border bg-muted/30",
  reviewing: "text-cyan border-cyan/40 bg-cyan/10",
  approved: "text-primary border-primary/40 bg-primary/10",
  rejected: "text-destructive border-destructive/40 bg-destructive/10",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`mt-0.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
        STATUS_COLOR[status] ?? STATUS_COLOR.pending
      }`}
    >
      {status}
    </span>
  );
}
