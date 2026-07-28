import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Handshake, Copy, Wallet, Users, TrendingUp, Package, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bayi")({
  head: () => ({
    meta: [
      { title: "Bayi Paneli | SiberLisans" },
      { name: "description", content: "Bayi cirosu, komisyon kazançların, müşteri listen ve toptan fiyat listesi." },
      { property: "og:title", content: "Bayi Paneli | SiberLisans" },
      { property: "og:description", content: "Bayi cirosu, komisyon kazançları ve toptan fiyat listesi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealerPanel,
});

type Stats = {
  code: string;
  company_name: string | null;
  active: boolean;
  tier_slug: string;
  tier_name: string;
  commission_percent: number;
  discount_percent: number;
  total_volume_try: number;
  total_commission_try: number;
  paid_commission_try: number;
  pending_commission_try: number;
  customer_count: number;
  order_count: number;
  next_tier: { name: string; min_volume_try: number; commission_percent: number; discount_percent: number } | null;
  monthly: { month: string; volume: number; commission: number; orders: number }[];
};

const try_ = (n: number | string | null | undefined) => `₺${Number(n ?? 0).toLocaleString("tr-TR")}`;

function DealerPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ozet" | "fiyat" | "musteri" | "kazanc">("ozet");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dealer-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dealer_stats");
      if (error) throw error;
      return data as unknown as Stats | null;
    },
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
            {stats.tier_name} · komisyon %{Number(stats.commission_percent)} · toptan indirim %
            {Number(stats.discount_percent)}
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
          { icon: Wallet, label: "bekleyen komisyon", value: try_(stats.pending_commission_try) },
          { icon: Wallet, label: "ödenen komisyon", value: try_(stats.paid_commission_try) },
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
              sonraki seviye: <span className="text-primary">{stats.next_tier.name}</span> (komisyon %
              {Number(stats.next_tier.commission_percent)})
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
            ["musteri", "müşterilerim"],
            ["kazanc", "kazanç geçmişi"],
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
        {tab === "musteri" && <Customers />}
        {tab === "kazanc" && <Commissions />}
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
          Bu linkten kayıt olan her müşterinin onaylanan siparişinden komisyon kazanırsın.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="p-2 text-left">ay</th>
              <th className="p-2 text-right">sipariş</th>
              <th className="p-2 text-right">ciro</th>
              <th className="p-2 text-right">komisyon</th>
            </tr>
          </thead>
          <tbody>
            {monthly.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center font-mono text-xs text-muted-foreground">
                  henüz kazanç kaydı yok
                </td>
              </tr>
            )}
            {monthly.map((m, i) => (
              <tr key={m.month} className={i % 2 ? "bg-card/30" : ""}>
                <td className="p-2 font-mono">{m.month}</td>
                <td className="p-2 text-right">{m.orders}</td>
                <td className="p-2 text-right font-mono">{try_(m.volume)}</td>
                <td className="p-2 text-right font-mono text-primary">{try_(m.commission)}</td>
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
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dealer-price-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dealer_price_list");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(
    () => (data ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  const buy = async (productId: string, name: string) => {
    const n = Math.max(1, Math.min(50, qty[productId] || 1));
    setBusy(productId);
    const { data: created, error } = await supabase.rpc("dealer_create_order", {
      _product_id: productId,
      _quantity: n,
    });
    if (error || !created?.[0]) {
      setBusy(null);
      return toast.error(error?.message ?? "Sipariş oluşturulamadı");
    }
    const order = created[0];
    const { error: payErr } = await supabase.rpc("pay_order_with_wallet", { _order_id: order.order_id });
    setBusy(null);
    if (payErr) {
      toast.error(payErr.message);
      return;
    }
    toast.success(`${n} adet ${name} alındı — ${try_(order.total_try)}`);
    onOrdered();
  };

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  return (
    <div>
      <Input placeholder="ürün ara…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
                    disabled={busy === p.id}
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
                <td colSpan={6} className="p-6 text-center font-mono text-xs text-muted-foreground">
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

function Customers() {
  const { data, isLoading } = useQuery({
    queryKey: ["dealer-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dealer_customers");
      if (error) throw error;
      return data ?? [];
    },
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
            <th className="p-2 text-right">kazancın</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c, i) => (
            <tr key={c.user_id} className={i % 2 ? "bg-card/30" : ""}>
              <td className="p-2">{c.display_name}</td>
              <td className="p-2 font-mono text-xs text-muted-foreground">{c.email_masked ?? "—"}</td>
              <td className="p-2 text-right">{c.order_count}</td>
              <td className="p-2 text-right font-mono">{try_(c.total_spent)}</td>
              <td className="p-2 text-right font-mono text-primary">{try_(c.commission_earned)}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center font-mono text-xs text-muted-foreground">
                henüz müşterin yok — bayi linkini paylaş
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Commissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["dealer-commissions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dealer_commissions")
        .select("id, base_amount_try, rate_percent, amount_try, status, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="p-2 text-left">tarih</th>
            <th className="p-2 text-right">sipariş tutarı</th>
            <th className="p-2 text-right">oran</th>
            <th className="p-2 text-right">komisyon</th>
            <th className="p-2 text-right">durum</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c, i) => (
            <tr key={c.id} className={i % 2 ? "bg-card/30" : ""}>
              <td className="p-2 font-mono text-xs">
                {new Date(c.created_at).toLocaleDateString("tr-TR")}
              </td>
              <td className="p-2 text-right font-mono">{try_(c.base_amount_try)}</td>
              <td className="p-2 text-right font-mono text-xs">%{Number(c.rate_percent)}</td>
              <td className="p-2 text-right font-mono text-primary">{try_(c.amount_try)}</td>
              <td className="p-2 text-right font-mono text-xs">
                {c.status === "paid" ? (
                  <span className="text-primary">ödendi</span>
                ) : (
                  <span className="text-muted-foreground">bekliyor</span>
                )}
              </td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center font-mono text-xs text-muted-foreground">
                henüz komisyon kaydı yok
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
