import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
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
      const [ordersRes, pendingRes, keysRes, lowStockRes, messagesRes, recentRes, topProductsRes] =
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
            .select("id, name, slug, stock_hint, unlimited_stock, manual_fulfillment, low_stock_threshold, license_keys(id, status)")
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
          supabase
            .from("orders")
            .select("price_try, product:products(name)")
            .eq("status", "approved"),
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
            threshold: (p as { low_stock_threshold?: number }).low_stock_threshold ?? 5,
          };
        })
        .filter((p) => !p.unlimited && !p.manual && p.avail < p.threshold)
        .sort((a, b) => a.avail - b.avail);

      const productAgg = new Map<string, { name: string; revenue: number; count: number }>();
      for (const row of (topProductsRes.data ?? []) as { price_try: number; product: { name: string } | null }[]) {
        const name = row.product?.name ?? "—";
        const cur = productAgg.get(name) ?? { name, revenue: 0, count: 0 };
        cur.revenue += Number(row.price_try);
        cur.count += 1;
        productAgg.set(name, cur);
      }
      const topProducts = Array.from(productAgg.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6)
        .map((p) => ({ ...p, name: p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name }));

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
        topProducts,
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
        <div className="glass-card rounded-xl p-5 lg:col-span-2 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono">Son 14 gün</div>
              <div className="text-lg font-semibold">Ciro Grafiği</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.chart ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.82 0.20 145)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.82 0.20 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 220 / 0.5)" vertical={false} />
                <XAxis dataKey="date" stroke="oklch(0.60 0.02 200)" style={{ fontFamily: "JetBrains Mono Variable", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.60 0.02 200)" style={{ fontFamily: "JetBrains Mono Variable", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ stroke: "oklch(0.82 0.20 145 / 0.4)", strokeWidth: 1 }}
                  contentStyle={{
                    background: "oklch(0.17 0.015 240)",
                    border: "1px solid oklch(0.28 0.02 220)",
                    borderRadius: 8,
                    fontFamily: "Inter",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`₺${v.toLocaleString("tr-TR")}`, "ciro"]}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="oklch(0.82 0.20 145)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "oklch(0.82 0.20 145)" }}
                  activeDot={{ r: 5 }}
                  fill="url(#revGrad)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
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

      <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-muted-foreground font-mono">Toplam ciroya göre</div>
            <div className="text-lg font-semibold">En Çok Satan Ürünler</div>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {stats?.topProducts?.length ?? 0} ürün
          </div>
        </div>
        <div className="h-72">
          {(stats?.topProducts ?? []).length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground font-mono">
              henüz onaylanmış sipariş yok
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.topProducts ?? []} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0.02 220 / 0.5)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.60 0.02 200)" style={{ fontFamily: "JetBrains Mono Variable", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" width={120} stroke="oklch(0.60 0.02 200)" style={{ fontFamily: "JetBrains Mono Variable", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "oklch(0.20 0.015 240 / 0.5)" }}
                  contentStyle={{
                    background: "oklch(0.17 0.015 240)",
                    border: "1px solid oklch(0.28 0.02 220)",
                    borderRadius: 8,
                    fontFamily: "Inter",
                    fontSize: 12,
                  }}
                  formatter={(v: number, k: string) =>
                    k === "revenue" ? [`₺${v.toLocaleString("tr-TR")}`, "ciro"] : [v, "adet"]
                  }
                />
                <Bar dataKey="revenue" fill="oklch(0.75 0.18 200)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>


      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
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
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {(stats?.lowStock ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">
                tüm ürünlerde yeterli stok var ✓
              </div>
            )}
            {(stats?.lowStock ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">/{p.slug}</div>
                </div>
                <div
                  className={`shrink-0 text-[10px] font-mono font-semibold px-2 py-1 rounded-md border whitespace-nowrap ${
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

        <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
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

      <UserActivityPanel />

      <ProfitabilityPanel />
    </div>
  );
}

function UserActivityPanel() {
  const fn = useServerFn(recentUserActivity);
  const { data } = useQuery({
    queryKey: ["admin-user-activity"],
    queryFn: () => fn(),
    refetchInterval: 30000,
  });

  const signups = data?.recentSignups ?? [];
  const logins = data?.recentLogins ?? [];
  const t = data?.totals;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Toplam Kullanıcı" value={String(t?.users ?? 0)} sub={`${t?.signedInEver ?? 0} giriş yapmış`} />
        <MiniStat label="Yeni (24s)" value={String(t?.newLast24h ?? 0)} sub="son 24 saatte kayıt" />
        <MiniStat label="Aktif (24s)" value={String(t?.activeLast24h ?? 0)} sub="son 24 saatte giriş" />
        <MiniStat label="Aktivasyon" value={`${t?.users ? Math.round(((t?.signedInEver ?? 0) / t.users) * 100) : 0}%`} sub="giriş yapmış oran" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> son kayıt olanlar
              </div>
              <div className="text-lg font-semibold">Yeni Kullanıcılar</div>
            </div>
            <Link to="/admin/kullanicilar" className="text-xs text-primary hover:underline flex items-center gap-1">
              tümü <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {signups.length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">henüz kayıt yok</div>
            )}
            {signups.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                <div className="min-w-0">
                  <div className="text-sm truncate">{u.display_name || u.email || "isimsiz"}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{u.email ?? "—"}</div>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground shrink-0">
                  {new Date(u.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                <LogIn className="h-3 w-3" /> son giriş yapanlar
              </div>
              <div className="text-lg font-semibold">Aktif Kullanıcılar</div>
            </div>
            <Link to="/admin/kullanicilar" className="text-xs text-primary hover:underline flex items-center gap-1">
              tümü <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {logins.length === 0 && (
              <div className="text-xs text-muted-foreground py-6 text-center">henüz giriş yok</div>
            )}
            {logins.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                <div className="min-w-0">
                  <div className="text-sm truncate">{u.display_name || u.email || "isimsiz"}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">{u.email ?? "—"}</div>
                </div>
                <div className="text-[11px] font-mono text-cyan shrink-0">
                  {u.last_sign_in_at
                    ? new Date(u.last_sign_in_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfitabilityPanel() {
  const { data } = useQuery({
    queryKey: ["admin-profitability"],
    queryFn: async () => {
      const [sumRes, profRes] = await Promise.all([
        supabase.rpc("admin_dashboard_summary" as never),
        supabase.rpc("admin_product_profitability" as never, { _days: 30 } as never),
      ]);
      const s = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
      return {
        summary: s as {
          today_revenue: number; today_orders: number;
          week_revenue: number; week_orders: number;
          month_revenue: number; month_orders: number;
          avg_basket: number; users_count: number;
        } | null,
        products: (profRes.data ?? []) as {
          product_id: string; name: string; sold: number;
          revenue: number; cost: number; profit: number;
        }[],
      };
    },
    refetchInterval: 30000,
  });

  const s = data?.summary;
  const products = (data?.products ?? []).slice(0, 8);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Bugün" value={`₺${Number(s?.today_revenue ?? 0).toLocaleString("tr-TR")}`} sub={`${s?.today_orders ?? 0} sipariş`} />
        <MiniStat label="Son 7 gün" value={`₺${Number(s?.week_revenue ?? 0).toLocaleString("tr-TR")}`} sub={`${s?.week_orders ?? 0} sipariş`} />
        <MiniStat label="Son 30 gün" value={`₺${Number(s?.month_revenue ?? 0).toLocaleString("tr-TR")}`} sub={`${s?.month_orders ?? 0} sipariş`} />
        <MiniStat label="Ort. sepet" value={`₺${Number(s?.avg_basket ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`} sub={`${s?.users_count ?? 0} kullanıcı`} />
      </div>

      <div className="glass-card rounded-xl p-5 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-muted-foreground font-mono">son 30 gün · sadece maliyet girilen ürünler kâr hesaplar</div>
            <div className="text-lg font-semibold">Ürün Karlılık Raporu</div>
          </div>
        </div>
        {products.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center font-mono">bu dönemde satış yok</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <th className="text-left py-2 pr-2">ürün</th>
                  <th className="text-right py-2 px-2">adet</th>
                  <th className="text-right py-2 px-2">ciro</th>
                  <th className="text-right py-2 px-2">maliyet</th>
                  <th className="text-right py-2 pl-2">kâr</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {products.map((p) => {
                  const noCost = Number(p.cost) === 0;
                  return (
                    <tr key={p.product_id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-2 truncate max-w-[220px]">{p.name}</td>
                      <td className="py-2 px-2 text-right">{p.sold}</td>
                      <td className="py-2 px-2 text-right text-primary">₺{Number(p.revenue).toLocaleString("tr-TR")}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{noCost ? "—" : `₺${Number(p.cost).toLocaleString("tr-TR")}`}</td>
                      <td className={`py-2 pl-2 text-right ${noCost ? "text-muted-foreground" : Number(p.profit) > 0 ? "text-primary" : "text-destructive"}`}>
                        {noCost ? "maliyet ekle" : `₺${Number(p.profit).toLocaleString("tr-TR")}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">{sub}</div>}
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
