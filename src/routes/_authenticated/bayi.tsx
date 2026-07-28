import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  const [tab, setTab] = useState<"ozet" | "fiyat" | "siparis" | "musteri" | "kazanc" | "api">("ozet");

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
            ["siparis", "siparişlerim & anahtarlar"],
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

function ApiAccess() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: keys } = useQuery({
    queryKey: ["dealer-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealer_api_keys")
        .select("id, label, key_prefix, revoked, call_count, last_used_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const base = typeof window !== "undefined" ? window.location.origin : "https://siberlisans.com";

  const issue = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("dealer_issue_api_key", { _label: label || "API anahtarı" });
    setBusy(false);
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    setFresh(row?.api_key ?? null);
    setLabel("");
    qc.invalidateQueries({ queryKey: ["dealer-api-keys"] });
    toast.success("Anahtar oluşturuldu — sadece bir kez gösterilir!");
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.rpc("dealer_revoke_api_key", { _id: id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["dealer-api-keys"] });
    toast.success("Anahtar iptal edildi");
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

# bakiye, seviye, komisyon durumu
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

  const { data: hooks } = useQuery({
    queryKey: ["dealer-webhooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealer_webhooks")
        .select("id, url, secret, active, last_status, last_sent_at, fail_count, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = async () => {
    if (!/^https:\/\/.+/i.test(url)) return toast.error("https:// ile başlayan bir adres gir");
    if ((hooks ?? []).length >= 3) return toast.error("En fazla 3 webhook ekleyebilirsin");
    setBusy(true);
    const { error } = await supabase.from("dealer_webhooks").insert({
      url: url.trim(),
      user_id: (await supabase.auth.getUser()).data.user?.id as string,
      events: ["product.created", "product.price_changed", "product.stock_changed"],
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setUrl("");
    qc.invalidateQueries({ queryKey: ["dealer-webhooks"] });
    toast.success("Webhook eklendi");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("dealer_webhooks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["dealer-webhooks"] });
    toast.success("Silindi");
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

