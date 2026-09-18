import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getDealerStats,
  getDealerPriceList,
  dealerPurchaseProduct,
  getDealerOrders,
  getDealerCustomers,
  listDealerApiKeys,
  issueDealerApiKey,
  revokeDealerApiKey,
  listDealerWebhooks,
  addDealerWebhook,
  removeDealerWebhook,
  type DealerStatsResult,
  type DealerPriceListItem,
  type DealerOrderRow as DealerOrderRowType,
  type DealerCustomerRow,
  type DealerApiKeyRow,
  type DealerWebhookRow,
} from "@/lib/dealer.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Handshake,
  Copy,
  Wallet,
  Users,
  TrendingUp,
  Package,
  ShoppingCart,
  KeyRound,
  Download,
  Receipt,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/bayi")({
  head: () => ({
    meta: [
      { title: "Bayi Paneli | SiberLisans" },
      { name: "description", content: "Bayi cirosu, müşteri listen ve toptan fiyat listesi." },
      { property: "og:title", content: "Bayi Paneli | SiberLisans" },
      { property: "og:description", content: "Bayi cirosu ve toptan fiyat listesi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealerPanel,
});

type Stats = NonNullable<DealerStatsResult>;

const try_ = (n: number | string | null | undefined) => `₺${Number(n ?? 0).toLocaleString("tr-TR")}`;

function DealerPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ozet" | "fiyat" | "siparis" | "musteri" | "api">("ozet");

  const statsFn = useServerFn(getDealerStats);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dealer-stats"],
    queryFn: () => statsFn(),
  });

  if (isLoading) {
    return <p className="container mx-auto px-4 py-10 font-mono text-sm text-muted-foreground">yükleniyor…</p>;
  }

  if (!stats) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-16 text-center">
        <Handshake className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 text-2xl font-bold">Henüz bayi değilsin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bayilik programına başvur, onaylandığında bu panel açılır.
        </p>
        <Button asChild className="mt-5 font-mono">
          <Link to="/bayilik">$ bayilik başvurusu</Link>
        </Button>
      </div>
    );
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${stats.code}` : `/b/${stats.code}`;
  const progress = stats.next_tier
    ? Math.min(100, (Number(stats.total_volume_try) / Number(stats.next_tier.min_volume_try)) * 100)
    : 100;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Handshake className="h-6 w-6 text-primary" /> Bayi Paneli
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {stats.tier_name} · toptan indirim %{Number(stats.discount_percent)}
            {!stats.active && <span className="ml-2 text-destructive">[pasif]</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary">
            {stats.code}
          </code>
          <Button
            size="sm"
            variant="outline"
            className="font-mono"
            onClick={() => {
              navigator.clipboard.writeText(inviteUrl);
              toast.success("Bayi linkin kopyalandı");
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> linki kopyala
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: TrendingUp, label: "toplam ciro", value: try_(stats.total_volume_try) },
          { icon: Package, label: "sipariş", value: String(stats.order_count) },
          { icon: Users, label: "müşteri", value: String(stats.customer_count) },
        ].map((k) => (
          <div key={k.label} className="glass-card rounded-xl border border-border/60 p-4">
            <k.icon className="h-4 w-4 text-primary" />
            <div className="mt-2 font-mono text-xl">{k.value}</div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {stats.next_tier && (
        <div className="glass-card mt-4 rounded-xl border border-primary/25 p-4">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-muted-foreground">
              sonraki seviye: <span className="text-primary">{stats.next_tier.name}</span> (toptan indirim %
              {Number(stats.next_tier.discount_percent)})
            </span>
            <span>
              {try_(stats.total_volume_try)} / {try_(stats.next_tier.min_volume_try)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border/50">
            <div className="h-full rounded-full bg-primary neon-glow" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ["ozet", "özet"],
            ["fiyat", "toptan fiyat listesi"],
            ["siparis", "siparişlerim & anahtarlar"],
            ["musteri", "müşterilerim"],
            ["api", "api erişimi"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
              tab === k
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "ozet" && <MonthlyTable monthly={stats.monthly ?? []} inviteUrl={inviteUrl} />}
        {tab === "fiyat" && <PriceList onOrdered={() => qc.invalidateQueries({ queryKey: ["dealer-stats"] })} />}
        {tab === "siparis" && <DealerOrders />}
        {tab === "musteri" && <Customers />}
        {tab === "api" && <ApiAccess />}
      </div>

    </div>
  );
}

function MonthlyTable({ monthly, inviteUrl }: { monthly: Stats["monthly"]; inviteUrl: string }) {
  return (
    <div className="space-y-4">
      <div className="glass-card rounded-xl border border-border/60 p-4">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">bayi davet linkin</div>
        <div className="mt-2 break-all font-mono text-sm text-primary">{inviteUrl}</div>
        <p className="mt-2 text-xs text-muted-foreground">
          Bu linkten kayıt olan müşteriler bayi hesabına bağlanır ve ciron artar.
        </p>
      </div>

      {monthly.length > 0 && (
        <div className="glass-card rounded-xl border border-border/60 p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            aylık ciro
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...monthly].reverse()} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="dlrVol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={64} />
                <RTooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [try_(v), "ciro"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={() => "ciro"} />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#dlrVol)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...monthly].reverse()} margin={{ left: -12, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={40} />
                <RTooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [String(v), "sipariş"]}
                />
                <Bar dataKey="orders" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">

        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="p-2 text-left">ay</th>
              <th className="p-2 text-right">sipariş</th>
              <th className="p-2 text-right">ciro</th>
            </tr>
          </thead>
          <tbody>
            {monthly.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center font-mono text-xs text-muted-foreground">
                  henüz ciro kaydı yok
                </td>
              </tr>
            )}
            {monthly.map((m, i) => (
              <tr key={m.month} className={i % 2 ? "bg-card/30" : ""}>
                <td className="p-2 font-mono">{m.month}</td>
                <td className="p-2 text-right">{m.orders}</td>
                <td className="p-2 text-right font-mono">{try_(m.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceList({ onOrdered }: { onOrdered: () => void }) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const priceListFn = useServerFn(getDealerPriceList);
  const { data, isLoading } = useQuery<DealerPriceListItem[]>({
    queryKey: ["dealer-price-list"],
    queryFn: () => priceListFn(),
  });

  const rows = useMemo(
    () => (data ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  const selected = useMemo(
    () => (data ?? []).filter((p) => sel[p.id]),
    [data, sel],
  );
  const cartTotal = selected.reduce(
    (s, p) => s + Number(p.dealer_price_try) * Math.max(1, Math.min(50, qty[p.id] || 1)),
    0,
  );
  const cartQty = selected.reduce((s, p) => s + Math.max(1, Math.min(50, qty[p.id] || 1)), 0);

  const purchaseFn = useServerFn(dealerPurchaseProduct);
  const purchase = async (productId: string) => {
    const n = Math.max(1, Math.min(50, qty[productId] || 1));
    return purchaseFn({ data: { productId, quantity: n } });
  };

  const buy = async (productId: string, name: string) => {
    setBusy(productId);
    try {
      const order = await purchase(productId);
      toast.success(`${qty[productId] ?? 1} adet ${name} alındı — ${try_(order.total_try)}`);
      onOrdered();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const buyBulk = async () => {
    if (!selected.length) return;
    setBulkBusy(true);
    let ok = 0;
    let spent = 0;
    const failed: string[] = [];
    for (const p of selected) {
      try {
        const order = await purchase(p.id);
        ok++;
        spent += Number(order.total_try);
      } catch (e) {
        failed.push(`${p.name}: ${(e as Error).message}`);
      }
    }
    setBulkBusy(false);
    setSel({});
    if (ok) toast.success(`${ok} kalem alındı — toplam ${try_(spent)}`);
    if (failed.length) toast.error(failed.slice(0, 3).join(" · "));
    onOrdered();
  };

  const exportCsv = () => {
    const head = "urun;liste_fiyat;bayi_fiyat;stok\n";
    const body = rows
      .map(
        (p) =>
          `"${p.name.replace(/"/g, "'")}";${Number(p.price_try)};${Number(p.dealer_price_try)};${
            p.unlimited_stock ? "sinirsiz" : p.available
          }`,
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bayi-fiyat-listesi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  const allSelected = rows.length > 0 && rows.every((p) => sel[p.id]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="ürün ara…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Button variant="outline" size="sm" className="font-mono" onClick={exportCsv}>
          <Download className="mr-1 h-3.5 w-3.5" /> csv indir
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="glass-card sticky top-16 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 p-3">
          <div className="font-mono text-xs">
            <span className="text-primary">{selected.length}</span> kalem ·{" "}
            <span className="text-primary">{cartQty}</span> adet · toplam{" "}
            <span className="text-primary">{try_(cartTotal)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="font-mono" onClick={() => setSel({})}>
              temizle
            </Button>
            <Button size="sm" className="font-mono" disabled={bulkBusy} onClick={buyBulk}>
              <ShoppingCart className="mr-1 h-3.5 w-3.5" />
              {bulkBusy ? "alınıyor…" : "toplu al"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="p-2 text-left">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => {
                    const next: Record<string, boolean> = { ...sel };
                    rows.forEach((p) => {
                      next[p.id] = !!v;
                    });
                    setSel(next);
                  }}
                />
              </th>
              <th className="p-2 text-left">ürün</th>
              <th className="p-2 text-right">liste</th>
              <th className="p-2 text-right">bayi fiyatı</th>
              <th className="p-2 text-right">stok</th>
              <th className="p-2 text-right">adet</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id} className={i % 2 ? "bg-card/30" : ""}>
                <td className="p-2">
                  <Checkbox
                    checked={!!sel[p.id]}
                    onCheckedChange={(v) => setSel({ ...sel, [p.id]: !!v })}
                  />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="line-clamp-1">{p.name}</span>
                  </div>
                </td>
                <td className="p-2 text-right font-mono text-xs text-muted-foreground line-through">
                  {try_(p.price_try)}
                </td>
                <td className="p-2 text-right font-mono text-primary">{try_(p.dealer_price_try)}</td>
                <td className="p-2 text-right font-mono text-xs">
                  {p.unlimited_stock ? "∞" : p.available}
                </td>
                <td className="p-2 text-right">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={qty[p.id] ?? 1}
                    onChange={(e) => setQty({ ...qty, [p.id]: Number(e.target.value) })}
                    className="ml-auto h-8 w-20 text-right font-mono"
                  />
                </td>
                <td className="p-2 text-right">
                  <Button
                    size="sm"
                    className="font-mono"
                    disabled={busy === p.id || bulkBusy}
                    onClick={() => buy(p.id, p.name)}
                  >
                    <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                    {busy === p.id ? "…" : "al"}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center font-mono text-xs text-muted-foreground">
                  ürün bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[11px] text-muted-foreground">
        toplu alım cüzdan bakiyenden tahsil edilir, anahtarlar anında hesabına tanımlanır.
      </p>
    </div>
  );
}

type DealerOrderRow = DealerOrderRowType;

function DealerOrders() {
  const [q, setQ] = useState("");

  const ordersFn = useServerFn(getDealerOrders);
  const { data, isLoading } = useQuery<DealerOrderRow[]>({
    queryKey: ["dealer-orders"],
    queryFn: () => ordersFn(),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (o) =>
        o.reference_code.toLowerCase().includes(term) ||
        (o.product_name ?? "").toLowerCase().includes(term) ||
        o.items.some((i) => i.product_name_snapshot.toLowerCase().includes(term)),
    );
  }, [data, q]);

  const allKeys = (o: DealerOrderRow) => o.keys;

  const exportCsv = () => {
    const head = "referans;tarih;durum;tutar;urun;anahtarlar\n";
    const body = rows
      .map((o) => {
        const name = o.product_name ?? o.items.map((i) => `${i.quantity}x ${i.product_name_snapshot}`).join(" | ");
        return `${o.reference_code};${new Date(o.created_at).toLocaleString("tr-TR")};${o.status};${Number(
          o.price_try,
        )};"${name.replace(/"/g, "'")}";"${allKeys(o).join(" | ")}"`;
      })
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bayi-siparisler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="referans veya ürün ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" className="font-mono" onClick={exportCsv} disabled={!rows.length}>
          <Download className="mr-1 h-3.5 w-3.5" /> csv indir
        </Button>
      </div>

      {rows.length === 0 && (
        <p className="glass-card rounded-xl border border-border/60 p-6 text-center font-mono text-xs text-muted-foreground">
          henüz sipariş yok
        </p>
      )}

      {rows.map((o) => {
        const keys = allKeys(o);
        return (
          <div key={o.id} className="glass-card rounded-xl border border-border/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-sm text-primary">
                  <Receipt className="h-4 w-4" /> {o.reference_code}
                </div>
                <div className="mt-1 text-sm">
                  {o.product_name ??
                    o.items.map((i) => `${i.quantity}x ${i.product_name_snapshot}`).join(", ") ??
                    "—"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("tr-TR")} · {o.item_count} adet
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">{try_(o.price_try)}</div>
                <span
                  className={`mt-1 inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase ${
                    o.status === "approved"
                      ? "border-primary/50 text-primary"
                      : o.status === "pending" || o.status === "reviewing"
                        ? "border-warn/50 text-warn"
                        : "border-destructive/50 text-destructive"
                  }`}
                >
                  {o.status}
                </span>
              </div>
            </div>

            {keys.length > 0 && (
              <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-background/60 p-3">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>teslim edilen anahtarlar ({keys.length})</span>
                  <button
                    className="text-primary hover:underline"
                    onClick={() => {
                      navigator.clipboard.writeText(keys.join("\n"));
                      toast.success("Tüm anahtarlar kopyalandı");
                    }}
                  >
                    tümünü kopyala
                  </button>
                </div>
                {keys.map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{k}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 font-mono text-[11px]"
                      onClick={() => {
                        navigator.clipboard.writeText(k);
                        toast.success("Kopyalandı");
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" /> kopyala
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


function Customers() {
  const customersFn = useServerFn(getDealerCustomers);
  const { data, isLoading } = useQuery<DealerCustomerRow[]>({
    queryKey: ["dealer-customers"],
    queryFn: () => customersFn(),
  });

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="p-2 text-left">müşteri</th>
            <th className="p-2 text-left">e-posta</th>
            <th className="p-2 text-right">sipariş</th>
            <th className="p-2 text-right">harcama</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c, i) => (
            <tr key={c.user_id} className={i % 2 ? "bg-card/30" : ""}>
              <td className="p-2">{c.display_name}</td>
              <td className="p-2 font-mono text-xs text-muted-foreground">{c.email_masked ?? "—"}</td>
              <td className="p-2 text-right">{c.order_count}</td>
              <td className="p-2 text-right font-mono">{try_(c.total_spent)}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center font-mono text-xs text-muted-foreground">
                henüz müşterin yok — bayi linkini paylaş
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ApiAccess() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const listKeysFn = useServerFn(listDealerApiKeys);
  const issueKeyFn = useServerFn(issueDealerApiKey);
  const revokeKeyFn = useServerFn(revokeDealerApiKey);

  const { data: keys } = useQuery<DealerApiKeyRow[]>({
    queryKey: ["dealer-api-keys"],
    queryFn: () => listKeysFn(),
  });

  const base = typeof window !== "undefined" ? window.location.origin : "https://siberlisans.com";

  const issue = async () => {
    setBusy(true);
    try {
      const row = await issueKeyFn({ data: { label: label || "API anahtarı" } });
      setFresh(row.api_key);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["dealer-api-keys"] });
      toast.success("Anahtar oluşturuldu — sadece bir kez gösterilir!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await revokeKeyFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["dealer-api-keys"] });
      toast.success("Anahtar iptal edildi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card rounded-xl border border-border/60 p-4">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> api anahtarların
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Kendi sitenden veya botundan toptan fiyat çekebilir, sipariş açıp anahtarı anında teslim alabilirsin.
          En fazla 5 aktif anahtar tutabilirsin.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="anahtar adı (örn. site-entegrasyon)"
            maxLength={40}
            className="max-w-xs font-mono text-sm"
          />
          <Button onClick={issue} disabled={busy} className="font-mono">
            {busy ? "oluşturuluyor…" : "$ yeni anahtar"}
          </Button>
        </div>

        {fresh && (
          <div className="mt-4 rounded-lg border border-primary/50 bg-primary/10 p-3">
            <div className="font-mono text-[11px] uppercase tracking-wider text-primary">
              anahtarını şimdi kopyala — tekrar gösterilmeyecek
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background/70 px-2 py-1.5 font-mono text-xs">
                {fresh}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="font-mono"
                onClick={() => {
                  navigator.clipboard.writeText(fresh);
                  toast.success("Kopyalandı");
                }}
              >
                <Copy className="mr-1 h-3 w-3" /> kopyala
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/60 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="p-2 text-left">ad</th>
                <th className="p-2 text-left">önek</th>
                <th className="p-2 text-right">çağrı</th>
                <th className="p-2 text-left">son kullanım</th>
                <th className="p-2 text-right">işlem</th>
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((k) => (
                <tr key={k.id} className="border-b border-border/30">
                  <td className="p-2">{k.label}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{k.key_prefix}…</td>
                  <td className="p-2 text-right font-mono text-xs">{k.call_count}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td className="p-2 text-right">
                    {k.revoked ? (
                      <span className="font-mono text-[11px] text-muted-foreground">iptal</span>
                    ) : (
                      <Button size="sm" variant="ghost" className="font-mono text-xs text-destructive" onClick={() => revoke(k.id)}>
                        iptal et
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(keys ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center font-mono text-xs text-muted-foreground">
                    henüz anahtar yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card rounded-xl border border-border/60 p-4">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">dokümantasyon</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Tüm isteklerde <code className="font-mono text-primary">Authorization: Bearer &lt;api_key&gt;</code> başlığı
          gönderilmeli. Temel adres: <code className="font-mono text-primary">{base}/api/public/dealer</code>
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
{`# toptan fiyat listesi + stok
GET  /api/public/dealer/products

# bakiye ve seviye durumu
GET  /api/public/dealer/balance

# sipariş oluştur + cüzdandan öde + anahtarı al
POST /api/public/dealer/orders
{ "product_id": "uuid", "quantity": 1 }
# ödemeden sadece sipariş açmak için: "pay": false

# sipariş sorgula (teslim edilen anahtarlarla birlikte)
GET  /api/public/dealer/orders/SBR-XXXXXXXX

# örnek
curl -H "Authorization: Bearer sbr_live_..." \\
  ${base}/api/public/dealer/products`}
        </pre>
      </div>

      <div className="glass-card rounded-xl border border-border/60 p-4">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          katalog akışı (anahtarsız)
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Ürünleri kendi sitende listelemek için anahtara gerek yok. <code className="font-mono text-primary">code</code>{" "}
          parametresine bayi kodunu ver; tıklamalar sana bağlanır.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
{`# JSON akışı
GET ${base}/api/public/catalog.json?limit=50&code=BAYIKODU
# kategori filtresi: &category=Dijital%20Ürünler

# XML / RSS akışı (Google Merchant uyumlu)
GET ${base}/api/public/catalog.xml?code=BAYIKODU`}
        </pre>
      </div>

      <div className="glass-card rounded-xl border border-border/60 p-4">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">hazır vitrin (embed)</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Tek satır kodu sitene yapıştır, ürün vitrini otomatik gelsin. Tıklayan müşteri senin referansınla siteye gelir.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/50 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
{`<script src="${base}/api/public/embed.js"
  data-code="BAYIKODU"
  data-limit="8"
  data-theme="dark"
  data-title="Popüler Lisanslar"></script>`}
        </pre>
      </div>

      <Webhooks />
    </div>
  );
}

function Webhooks() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const listHooksFn = useServerFn(listDealerWebhooks);
  const addHookFn = useServerFn(addDealerWebhook);
  const removeHookFn = useServerFn(removeDealerWebhook);

  const { data: hooks } = useQuery<DealerWebhookRow[]>({
    queryKey: ["dealer-webhooks"],
    queryFn: () => listHooksFn(),
  });

  const add = async () => {
    if (!/^https:\/\/.+/i.test(url)) return toast.error("https:// ile başlayan bir adres gir");
    if ((hooks ?? []).length >= 3) return toast.error("En fazla 3 webhook ekleyebilirsin");
    setBusy(true);
    try {
      await addHookFn({ data: { url: url.trim() } });
      setUrl("");
      qc.invalidateQueries({ queryKey: ["dealer-webhooks"] });
      toast.success("Webhook eklendi");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await removeHookFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["dealer-webhooks"] });
      toast.success("Silindi");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="glass-card rounded-xl border border-border/60 p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        webhook · fiyat &amp; stok senkronu
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Ürün fiyatı, durumu veya stoğu değişince sitene otomatik bildirim göndeririz. Gövde imzası{" "}
        <code className="font-mono text-primary">X-SiberLisans-Signature</code> başlığında HMAC-SHA256 olarak gelir.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://siten.com/webhook/siberlisans"
          maxLength={300}
          className="max-w-sm font-mono text-sm"
        />
        <Button onClick={add} disabled={busy} className="font-mono">
          {busy ? "ekleniyor…" : "$ webhook ekle"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {(hooks ?? []).map((h) => (
          <div key={h.id} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{h.url}</code>
              <span className="font-mono text-[11px] text-muted-foreground">
                {h.active ? `durum: ${h.last_status ?? "—"}` : "pasif"}
                {h.fail_count > 0 ? ` · hata: ${h.fail_count}` : ""}
              </span>
              <Button size="sm" variant="ghost" className="font-mono text-xs text-destructive" onClick={() => remove(h.id)}>
                sil
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                secret: {h.secret}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="font-mono text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(h.secret);
                  toast.success("Kopyalandı");
                }}
              >
                <Copy className="mr-1 h-3 w-3" /> kopyala
              </Button>
            </div>
          </div>
        ))}
        {(hooks ?? []).length === 0 && (
          <div className="p-4 text-center font-mono text-xs text-muted-foreground">henüz webhook yok</div>
        )}
      </div>

      <pre className="mt-4 overflow-x-auto rounded-lg border border-border/50 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
{`// gelen istek gövdesi
{ "sent_at": "...", "events": [
  { "id": 12, "type": "product.price_changed",
    "data": { "id": "uuid", "slug": "...", "price_try": 1290, "in_stock": true } }
]}`}
      </pre>
    </div>
  );
}

