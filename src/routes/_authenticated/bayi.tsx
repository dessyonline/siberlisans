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
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { QRCodeSVG } from "qrcode.react";
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
  Sparkles,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Code2,
  Globe,
  ExternalLink,
  Share2,
  Layers,
  Search,
  Check,
  BarChart3,
  Calculator,
  Award,
  Star,
  MessageSquare,
  Plus,
  ArrowRight,
  FileText,
  Smartphone,
  Send,
  LayoutGrid,
  List,
  Info,
  ChevronRight,
  Filter,
  Trash2,
  Terminal,
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
      { title: "Bayi Komuta Merkezi | SiberLisans B2B Terminal" },
      { name: "description", content: "Toptan lisans alımı, otomatik API teslimatı, müşteri yönetimi ve yüksek kâr marjlı bayi komuta merkezi." },
      { property: "og:title", content: "Bayi Komuta Merkezi | SiberLisans B2B Terminal" },
      { property: "og:description", content: "SiberLisans toptan fiyat listesi, API entegrasyonu ve bayi kazanç simülatörü." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealerPanel,
});

type Stats = NonNullable<DealerStatsResult>;

const try_ = (n: number | string | null | undefined) => `₺${Number(n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tryInt = (n: number | string | null | undefined) => `₺${Math.round(Number(n ?? 0)).toLocaleString("tr-TR")}`;

function DealerPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ozet" | "fiyat" | "siparis" | "simulator" | "musteri" | "api" | "guvence">("ozet");

  const statsFn = useServerFn(getDealerStats);
  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dealer-stats"],
    queryFn: () => statsFn(),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <div className="h-12 w-12 rounded-2xl border border-primary/40 bg-primary/10 flex items-center justify-center">
              <Handshake className="h-6 w-6 text-primary animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="font-mono text-base font-semibold tracking-wide text-foreground">B2B Bayi Terminali Yükleniyor</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Finansal veriler ve bayi fiyatları senkronize ediliyor…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 shadow-2xl shadow-primary/10">
          <Handshake className="h-10 w-10 text-primary" />
          <div className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-primary animate-pulse" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">SiberLisans Bayilik Programı</h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Türkiye'nin en gelişmiş dijital lisans dağıtım altyapısına katılın. Toptan fiyatlarla anında lisans temin edin,
          kendi e-ticaret sitenize API ile bağlayın ve yüksek kâr marjıyla satış yapmaya başlayın.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3 text-left">
          <div className="glass-card rounded-2xl border border-border/60 p-4">
            <Zap className="h-5 w-5 text-primary mb-2" />
            <h4 className="font-semibold text-sm">0sn Otomatik Teslimat</h4>
            <p className="mt-1 text-xs text-muted-foreground">API veya panelden tek tıkla anında çalışan lisans anahtarı.</p>
          </div>
          <div className="glass-card rounded-2xl border border-border/60 p-4">
            <TrendingUp className="h-5 w-5 text-primary mb-2" />
            <h4 className="font-semibold text-sm">%30'a Varan İskonto</h4>
            <p className="mt-1 text-xs text-muted-foreground">Kademeli toptan indirim oranlarıyla maksimum net kâr.</p>
          </div>
          <div className="glass-card rounded-2xl border border-border/60 p-4">
            <Code2 className="h-5 w-5 text-primary mb-2" />
            <h4 className="font-semibold text-sm">REST API & Webhook</h4>
            <p className="mt-1 text-xs text-muted-foreground">WooCommerce, OpenCart ve özel yazılımlara anında entegrasyon.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="font-mono shadow-lg shadow-primary/20">
            <Link to="/bayilik">
              <Sparkles className="mr-2 h-4 w-4" /> Bayilik Başvurusu Yap
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="font-mono">
            <Link to="/urunler">Kataloğu İncele</Link>
          </Button>
        </div>
      </div>
    );
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/b/${stats.code}` : `/b/${stats.code}`;
  const progress = stats.next_tier
    ? Math.min(100, Math.round((Number(stats.total_volume_try) / Number(stats.next_tier.min_volume_try)) * 100))
    : 100;
  const remainingForNext = stats.next_tier
    ? Math.max(0, Number(stats.next_tier.min_volume_try) - Number(stats.total_volume_try))
    : 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      {/* TOP HEADER & COMMAND CENTER IDENTITY */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-card/90 via-card/70 to-primary/10 p-6 md:p-8 backdrop-blur-2xl shadow-2xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-cyan/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant="outline" className="border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                B2B RESELLER TERMINAL
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                {stats.tier_name}
              </Badge>
              <Badge className="bg-primary text-primary-foreground font-mono text-xs font-bold">
                %{Number(stats.discount_percent)} TOPTAN İSKONTO
              </Badge>
              {!stats.active && (
                <Badge variant="destructive" className="font-mono text-xs">
                  HESAP PASİF
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                <Handshake className="h-8 w-8 text-primary shrink-0" />
                <span>{stats.company_name || "Bayi Paneli"}</span>
              </h1>
            </div>

            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Toptan lisans tedariki, 0 saniye API anahtar teslimatı, kâr simülatörü ve e-ticaret otomasyonu tek ekranda.
            </p>
          </div>

          {/* Quick Actions & Wallet Card */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:self-center">
            <div className="rounded-2xl border border-border/80 bg-background/80 p-4 backdrop-blur-md flex items-center justify-between sm:justify-start gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Kullanılabilir Bakiye</div>
                  <div className="font-mono text-xl font-bold text-foreground">{try_(stats.wallet_balance_try)}</div>
                </div>
              </div>
              <Button asChild size="sm" className="font-mono h-8 shadow-sm">
                <Link to="/cuzdan">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Bakiye Yükle
                </Link>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 font-mono text-xs">
                <span className="text-muted-foreground mr-2 text-[11px]">KOD:</span>
                <span className="font-bold text-primary tracking-wider">{stats.code}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="font-mono h-9"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  toast.success("Bayi davet linki kopyalandı!");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Linki Kopyala
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => refetch()}
                disabled={isRefetching}
                title="Yenile"
              >
                <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin text-primary" : ""}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* TIER PROGRESSION MILESTONE */}
        {stats.next_tier && (
          <div className="mt-6 pt-5 border-t border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-mono">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Award className="h-4 w-4 text-primary" />
                <span>
                  Sonraki VIP Seviyesi: <strong className="text-foreground">{stats.next_tier.name}</strong>
                  {" "}(Toptan İndirim: <span className="text-primary font-bold">%{Number(stats.next_tier.discount_percent)}</span>)
                </span>
              </div>
              <div className="text-muted-foreground text-right">
                <span className="text-primary font-bold">{tryInt(stats.total_volume_try)}</span> / {tryInt(stats.next_tier.min_volume_try)}
                {" "}<span className="text-[11px] opacity-80">(Kalan: {tryInt(remainingForNext)})</span>
              </div>
            </div>
            <div className="mt-2.5 relative h-2.5 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/80 via-primary to-emerald-400 transition-all duration-700 shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 4 HIGH IMPACT BENTO KPI CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1 */}
        <div className="glass-card rounded-2xl border border-border/70 p-5 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Cüzdan Bakiyesi</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-black text-foreground">{try_(stats.wallet_balance_try)}</div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Anında lisans çekimi</span>
            <Link to="/cuzdan" className="font-mono text-primary hover:underline text-[11px] flex items-center">
              + Yükle <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-card rounded-2xl border border-border/70 p-5 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Toplam Bayi Cirosu</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/10 text-cyan border border-cyan/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-black text-foreground">{try_(stats.total_volume_try)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Kademeli ciro seviyenize katkı sağlar</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-card rounded-2xl border border-border/70 p-5 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Teslim Edilen Sipariş</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-black text-foreground">{stats.order_count} <span className="text-sm font-normal text-muted-foreground">adet</span></div>
          <div className="mt-2 flex items-center gap-1 text-xs text-emerald-400 font-mono">
            <Zap className="h-3.5 w-3.5" /> 0 saniye otomatik teslimat
          </div>
        </div>

        {/* KPI 4 */}
        <div className="glass-card rounded-2xl border border-border/70 p-5 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Müşteri Ağı</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono text-2xl font-black text-foreground">{stats.customer_count} <span className="text-sm font-normal text-muted-foreground">müşteri</span></div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Bekleyen komisyon</span>
            <span className="font-mono font-bold text-primary">{try_(stats.pending_commission_try)}</span>
          </div>
        </div>
      </div>

      {/* QUICK FIRST SALE PROMPT IF NO ORDERS YET */}
      {stats.order_count === 0 && (
        <div className="rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/10 via-card to-background p-6 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-primary uppercase tracking-wider">
                <Sparkles className="h-4 w-4" /> İlk Toptan Satışınıza 3 Adımda Başlayın
              </div>
              <p className="text-sm text-muted-foreground">
                Toptan fiyat listesinden indirimli ürünleri görün, cüzdanınızdan tek tıkla anında lisans çekin veya kendi siteniz için otomatik API bağlayın.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 shrink-0">
              <Button size="sm" onClick={() => setTab("fiyat")} className="font-mono">
                <Package className="mr-1.5 h-3.5 w-3.5" /> Ürün Kataloğu
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTab("simulator")} className="font-mono">
                <Calculator className="mr-1.5 h-3.5 w-3.5" /> Kârını Hesapla
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setTab("api")} className="font-mono">
                <Code2 className="mr-1.5 h-3.5 w-3.5" /> API Anahtarı Al
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN NAVIGATION TABS */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card/60 p-1.5 backdrop-blur-xl">
        {[
          { key: "ozet", label: "Finansal Özet", icon: BarChart3 },
          { key: "fiyat", label: "Toptan Ürün Kataloğu", icon: Package, badge: "İndirimli" },
          { key: "siparis", label: "Lisans Kasası & Siparişler", icon: KeyRound },
          { key: "simulator", label: "Kâr & Kazanç Simülatörü", icon: Calculator, badge: "Yeni" },
          { key: "musteri", label: "Müşterilerim & QR Davet", icon: Users },
          { key: "api", label: "API & Otomasyon Merkezi", icon: Code2 },
          { key: "guvence", label: "VIP Bayi Güvencesi", icon: ShieldCheck },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 font-mono text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? "border border-primary/40 bg-primary/15 text-primary shadow-sm shadow-primary/10"
                  : "text-muted-foreground hover:bg-card hover:text-foreground border border-transparent"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              <span>{t.label}</span>
              {t.badge && (
                <span className={`rounded-full px-1.5 py-0.2 text-[9px] uppercase font-bold tracking-wider ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT VIEWS */}
      <div className="pt-2">
        {tab === "ozet" && <MonthlyTable monthly={stats.monthly ?? []} inviteUrl={inviteUrl} stats={stats} />}
        {tab === "fiyat" && <PriceList onOrdered={() => qc.invalidateQueries({ queryKey: ["dealer-stats"] })} userBalance={Number(stats.wallet_balance_try)} discountPercent={Number(stats.discount_percent)} />}
        {tab === "siparis" && <DealerOrders />}
        {tab === "simulator" && <ProfitSimulator discountPercent={Number(stats.discount_percent)} />}
        {tab === "musteri" && <Customers inviteUrl={inviteUrl} code={stats.code} />}
        {tab === "api" && <ApiAccess code={stats.code} />}
        {tab === "guvence" && <DealerPerks />}
      </div>
    </div>
  );
}

// ==========================================
// TAB 1: FINANSAL OZET & CIRO RAPORLARI
// ==========================================

function MonthlyTable({ monthly, inviteUrl, stats }: { monthly: Stats["monthly"]; inviteUrl: string; stats: Stats }) {
  const [chartMode, setChartMode] = useState<"ciro" | "siparis">("ciro");

  const totalVol = useMemo(() => monthly.reduce((s, m) => s + Number(m.volume), 0), [monthly]);
  const totalOrders = useMemo(() => monthly.reduce((s, m) => s + Number(m.orders), 0), [monthly]);
  const avgOrder = totalOrders > 0 ? totalVol / totalOrders : 0;

  return (
    <div className="space-y-6">
      {/* QUICK LINK CARD */}
      <div className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
              <Share2 className="h-4 w-4" /> Bayi Davet &amp; Satış Linkiniz
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Bu bağlantı üzerinden kayıt olan veya alışveriş yapan tüm müşteriler hesabınıza bağlanır, tüm alışverişlerinden komisyon kazanırsınız.
            </p>
          </div>
          <div className="flex items-center gap-2 max-w-md w-full">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-border/80 bg-background/80 px-3 py-2 font-mono text-xs text-foreground">
              {inviteUrl}
            </code>
            <Button
              size="sm"
              className="font-mono shrink-0 shadow-sm"
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                toast.success("Davet linkiniz kopyalandı!");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Kopyala
            </Button>
          </div>
        </div>
      </div>

      {/* CHARTS CONTAINER */}
      <div className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Finansal Performans &amp; Ciro Analitiği</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">Son 6 aylık sipariş ve ciro ivmeniz</p>
          </div>
          <div className="flex items-center rounded-xl border border-border/70 bg-background/60 p-1">
            <button
              onClick={() => setChartMode("ciro")}
              className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
                chartMode === "ciro" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ciro Grafiği (₺)
            </button>
            <button
              onClick={() => setChartMode("siparis")}
              className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
                chartMode === "siparis" ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sipariş Adedi
            </button>
          </div>
        </div>

        {monthly.length > 0 ? (
          <div className="space-y-6">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === "ciro" ? (
                  <AreaChart data={[...monthly].reverse()} margin={{ left: -10, right: 10, top: 10 }}>
                    <defs>
                      <linearGradient id="dlrVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={70} tickFormatter={(v) => `₺${v}`} />
                    <RTooltip
                      contentStyle={{
                        background: "oklch(0.16 0.02 220 / 0.95)",
                        border: "1px solid var(--primary)",
                        borderRadius: 14,
                        fontSize: 12,
                        color: "#fff",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                      }}
                      formatter={(v: number) => [try_(v), "Toplam Ciro"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="var(--primary)"
                      strokeWidth={3}
                      fill="url(#dlrVol)"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={[...monthly].reverse()} margin={{ left: -10, right: 10, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={45} />
                    <RTooltip
                      contentStyle={{
                        background: "oklch(0.16 0.02 220 / 0.95)",
                        border: "1px solid var(--primary)",
                        borderRadius: 14,
                        fontSize: 12,
                        color: "#fff",
                      }}
                      formatter={(v: number) => [`${v} adet`, "Sipariş Sayısı"]}
                    />
                    <Bar dataKey="orders" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid gap-3 sm:grid-cols-3 pt-4 border-t border-border/60">
              <div className="rounded-xl border border-border/50 bg-background/50 p-3.5">
                <div className="font-mono text-[10px] uppercase text-muted-foreground">6 Aylık Ciro Hacmi</div>
                <div className="mt-1 font-mono text-lg font-bold text-foreground">{try_(totalVol)}</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/50 p-3.5">
                <div className="font-mono text-[10px] uppercase text-muted-foreground">Toplam Sipariş Adedi</div>
                <div className="mt-1 font-mono text-lg font-bold text-foreground">{totalOrders} sipariş</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/50 p-3.5">
                <div className="font-mono text-[10px] uppercase text-muted-foreground">Ortalama Sipariş Tutarı</div>
                <div className="mt-1 font-mono text-lg font-bold text-primary">{try_(avgOrder)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h4 className="font-mono text-sm font-semibold">Henüz Ciro Grafiği Oluşmadı</h4>
            <p className="mt-1 font-mono text-xs text-muted-foreground max-w-sm">
              İlk toptan alımınızı gerçekleştirdiğinizde veya davet linkinizle sipariş verildiğinde aylık ciro tablonuz burada listelenecektir.
            </p>
          </div>
        )}
      </div>

      {/* MONTHLY BREAKDOWN TABLE */}
      <div className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl">
        <h3 className="font-bold text-base mb-4">Aylık Finansal Detay Tablosu</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/70 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left">Dönem</th>
                <th className="pb-3 text-right">Sipariş Sayısı</th>
                <th className="pb-3 text-right">Ciro Tutarı</th>
                <th className="pb-3 text-right">Komisyon Kazancı</th>
                <th className="pb-3 text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono text-xs">
              {monthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Kayıtlı ciro geçmişi bulunmamaktadır.
                  </td>
                </tr>
              ) : (
                monthly.map((m) => (
                  <tr key={m.month} className="hover:bg-primary/5 transition-colors">
                    <td className="py-3 font-semibold text-foreground">{m.month}</td>
                    <td className="py-3 text-right text-muted-foreground">{m.orders} adet</td>
                    <td className="py-3 text-right font-bold text-foreground">{try_(m.volume)}</td>
                    <td className="py-3 text-right font-bold text-primary">{try_(m.commission)}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        <CheckCircle2 className="h-3 w-3" /> İşlendi
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB 2: TOPTAN URUN KATALOGU & HIZLI ALIM
// ==========================================

function PriceList({ onOrdered, userBalance, discountPercent }: { onOrdered: () => void; userBalance: number; discountPercent: number }) {
  const [q, setQ] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const priceListFn = useServerFn(getDealerPriceList);
  const { data, isLoading } = useQuery<DealerPriceListItem[]>({
    queryKey: ["dealer-price-list"],
    queryFn: () => priceListFn(),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [data]);

  const rows = useMemo(() => {
    return (data ?? []).filter((p) => {
      const matchQuery = p.name.toLowerCase().includes(q.toLowerCase()) || p.slug.toLowerCase().includes(q.toLowerCase());
      const matchCat = selectedCategory === "all" || p.category === selectedCategory;
      return matchQuery && matchCat;
    });
  }, [data, q, selectedCategory]);

  const selected = useMemo(
    () => (data ?? []).filter((p) => sel[p.id]),
    [data, sel],
  );

  const cartTotal = selected.reduce(
    (s, p) => s + Number(p.dealer_price_try) * Math.max(1, Math.min(50, qty[p.id] || 1)),
    0,
  );
  const cartQty = selected.reduce((s, p) => s + Math.max(1, Math.min(50, qty[p.id] || 1)), 0);
  const cartSavings = selected.reduce(
    (s, p) => s + (Number(p.price_try) - Number(p.dealer_price_try)) * Math.max(1, Math.min(50, qty[p.id] || 1)),
    0,
  );

  const purchaseFn = useServerFn(dealerPurchaseProduct);
  const purchase = async (productId: string) => {
    const n = Math.max(1, Math.min(50, qty[productId] || 1));
    return purchaseFn({ data: { productId, quantity: n } });
  };

  const buy = async (productId: string, name: string) => {
    const count = qty[productId] ?? 1;
    setBusy(productId);
    try {
      const order = await purchase(productId);
      toast.success(`${count} adet ${name} başarıyla satın alındı ve kasaya eklendi!`, {
        description: `Toplam: ${try_(order.total_try)} — Sipariş No: ${order.order_id.slice(0, 8)}`,
      });
      onOrdered();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const buyBulk = async () => {
    if (!selected.length) return;
    if (userBalance < cartTotal) {
      toast.error("Cüzdan bakiyeniz yetersiz. Lütfen bakiye yükleyin.", {
        description: `Gereken: ${try_(cartTotal)} | Mevcut: ${try_(userBalance)}`,
      });
      return;
    }

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
    if (ok) {
      toast.success(`${ok} farklı üründen toplam ${cartQty} adet lisans başarıyla çekildi!`, {
        description: `Cüzdandan düşülen toplam: ${try_(spent)}`,
      });
    }
    if (failed.length) toast.error(failed.slice(0, 3).join(" · "));
    onOrdered();
  };

  const exportCsv = () => {
    const head = "urun_adi;kategori;liste_fiyat;bayi_alis_fiyat;tasarruf_tl;stok_durumu\n";
    const body = rows
      .map(
        (p) =>
          `"${p.name.replace(/"/g, "'")}";"${p.category ?? "Genel"}";${Number(p.price_try)};${Number(p.dealer_price_try)};${
            Number(p.price_try) - Number(p.dealer_price_try)
          };${p.unlimited_stock ? "sinirsiz" : p.available}`,
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `siberlisans-bayi-fiyat-listesi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Package className="h-8 w-8 text-primary animate-bounce mb-3" />
        <p className="font-mono text-sm text-muted-foreground">Toptan fiyat listesi ve stok durumları çekiliyor…</p>
      </div>
    );
  }

  const allSelected = rows.length > 0 && rows.every((p) => sel[p.id]);

  return (
    <div className="space-y-6">
      {/* FILTER & SEARCH BAR */}
      <div className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ürün adı veya lisans ara (örn. Windows 11, Office, ESET)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 font-mono text-sm h-10 rounded-xl"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="font-mono h-10 rounded-xl" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Fiyat Listesi CSV İndir
            </Button>

            <div className="flex items-center rounded-xl border border-border/70 bg-background/60 p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title="Görsel Vitrin"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title="Borsa / Tablo Görünümü"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CATEGORY CHIPS */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
          <span className="font-mono text-xs text-muted-foreground mr-1 flex items-center">
            <Filter className="h-3 w-3 mr-1" /> Kategori:
          </span>
          <button
            onClick={() => setSelectedCategory("all")}
            className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
              selectedCategory === "all" ? "bg-primary text-primary-foreground font-bold" : "bg-card/60 text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            Tümü ({data?.length ?? 0})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
                selectedCategory === cat ? "bg-primary text-primary-foreground font-bold" : "bg-card/60 text-muted-foreground hover:text-foreground border border-border/60"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* FLOATING BULK CHECKOUT BAR IF ITEMS SELECTED */}
      {selected.length > 0 && (
        <div className="sticky top-20 z-30 rounded-2xl border border-primary/50 bg-gradient-to-r from-card via-card to-primary/10 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <div className="font-mono text-xs">
                  <span className="font-bold text-primary">{selected.length}</span> farklı ürün ·{" "}
                  <span className="font-bold text-primary">{cartQty}</span> adet lisans
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  Toplam Toptan Tutar: <strong className="text-foreground text-sm">{try_(cartTotal)}</strong>
                  {" "}<span className="text-emerald-400 font-semibold">(₺{Math.round(cartSavings)} Tasarruf)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="font-mono text-xs text-muted-foreground" onClick={() => setSel({})}>
                Seçimi Temizle
              </Button>
              {userBalance < cartTotal ? (
                <Button asChild size="sm" variant="destructive" className="font-mono">
                  <Link to="/cuzdan">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Bakiye Yetersiz (Yükle)
                  </Link>
                </Button>
              ) : (
                <Button size="sm" className="font-mono shadow-md shadow-primary/20" disabled={bulkBusy} onClick={buyBulk}>
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  {bulkBusy ? "Lisanslar Çekiliyor…" : "Toplu Satın Al ve Kasaya Ekle"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRODUCTS DISPLAY: GRID VIEW */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const count = qty[p.id] ?? 1;
            const itemTotal = Number(p.dealer_price_try) * count;
            const retailTotal = Number(p.price_try) * count;
            const profit = retailTotal - itemTotal;
            const isSelected = !!sel[p.id];

            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between rounded-3xl border p-5 backdrop-blur-xl transition-all duration-300 ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                    : "glass-card border-border/70 hover:border-primary/40 hover:-translate-y-1 shadow-md"
                }`}
              >
                {/* Header chip */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md border border-border/80 bg-background/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                        {p.category ?? "Yazılım"}
                      </span>
                      {p.unlimited_stock ? (
                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                          Sonsuz Stok
                        </span>
                      ) : p.available > 0 ? (
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                          {p.available} Adet Stok
                        </span>
                      ) : (
                        <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
                          Stok Tükendi
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-base leading-snug line-clamp-2 text-foreground">{p.name}</h4>
                  </div>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(v) => setSel({ ...sel, [p.id]: !!v })}
                    className="mt-1"
                  />
                </div>

                {/* Price Matrix */}
                <div className="mt-5 rounded-2xl border border-border/60 bg-background/60 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Piyasa / Liste Fiyatı:</span>
                    <span className="text-muted-foreground line-through">{try_(p.price_try)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-mono font-bold">
                    <span className="text-foreground">Özel Bayi Alış Fiyatınız:</span>
                    <span className="text-primary text-base">{try_(p.dealer_price_try)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] font-mono">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Net Tasarruf / Kâr:
                    </span>
                    <span className="text-emerald-400 font-bold">+{try_(profit)} (%{discountPercent})</span>
                  </div>
                </div>

                {/* Quantity Stepper & Buy Action */}
                <div className="mt-4 pt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center rounded-xl border border-border/70 bg-background/80 p-1 font-mono text-xs">
                    <button
                      onClick={() => setQty({ ...qty, [p.id]: Math.max(1, count - 1) })}
                      className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground flex items-center justify-center font-bold"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold text-foreground">{count}</span>
                    <button
                      onClick={() => setQty({ ...qty, [p.id]: Math.min(50, count + 1) })}
                      className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground flex items-center justify-center font-bold"
                    >
                      +
                    </button>
                  </div>

                  <Button
                    size="sm"
                    className="font-mono flex-1 h-9 shadow-sm"
                    disabled={busy === p.id || bulkBusy || (!p.unlimited_stock && p.available <= 0)}
                    onClick={() => buy(p.id, p.name)}
                  >
                    <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                    {busy === p.id ? "Çekiliyor…" : `Hemen Al (${try_(itemTotal)})`}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW FOR POWER DEALERS */
        <div className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl overflow-x-auto shadow-xl">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border/70 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="p-3 text-left w-10">
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
                <th className="p-3 text-left">Ürün &amp; Kategori</th>
                <th className="p-3 text-right">Liste Fiyatı</th>
                <th className="p-3 text-right">Bayi Alış</th>
                <th className="p-3 text-right">Kâr / İndirim</th>
                <th className="p-3 text-right">Stok</th>
                <th className="p-3 text-right">Miktar</th>
                <th className="p-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono text-xs">
              {rows.map((p) => {
                const count = qty[p.id] ?? 1;
                const isSelected = !!sel[p.id];
                const profit = Number(p.price_try) - Number(p.dealer_price_try);

                return (
                  <tr key={p.id} className={`hover:bg-primary/5 transition-colors ${isSelected ? "bg-primary/10" : ""}`}>
                    <td className="p-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => setSel({ ...sel, [p.id]: !!v })}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <span className="font-semibold text-foreground line-clamp-1">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{p.category ?? "Genel"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right text-muted-foreground line-through">{try_(p.price_try)}</td>
                    <td className="p-3 text-right font-bold text-primary text-sm">{try_(p.dealer_price_try)}</td>
                    <td className="p-3 text-right text-emerald-400 font-semibold">+{try_(profit)}</td>
                    <td className="p-3 text-right">
                      {p.unlimited_stock ? (
                        <span className="text-emerald-400">∞ Sonsuz</span>
                      ) : (
                        <span className={p.available > 0 ? "text-foreground" : "text-destructive"}>{p.available} adet</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={count}
                        onChange={(e) => setQty({ ...qty, [p.id]: Math.max(1, Math.min(50, Number(e.target.value))) })}
                        className="ml-auto h-8 w-16 text-right font-mono text-xs rounded-lg"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        className="font-mono h-8 text-xs"
                        disabled={busy === p.id || bulkBusy || (!p.unlimited_stock && p.available <= 0)}
                        onClick={() => buy(p.id, p.name)}
                      >
                        {busy === p.id ? "…" : "Al"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-3xl border border-border/70 bg-card/50 p-12 text-center font-mono">
          <Package className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <h4 className="text-base font-semibold">Aranan kriterde ürün bulunamadı</h4>
          <p className="mt-1 text-xs text-muted-foreground">Filtreleri temizleyerek veya farklı bir arama yaparak tekrar deneyin.</p>
          <Button variant="outline" size="sm" className="mt-4 font-mono" onClick={() => { setQ(""); setSelectedCategory("all"); }}>
            Tüm Kataloğu Göster
          </Button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// TAB 3: LISANS KASASI & SIPARISLER
// ==========================================

function DealerOrders() {
  const [q, setQ] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const ordersFn = useServerFn(getDealerOrders);
  const { data, isLoading } = useQuery<DealerOrderRowType[]>({
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
        o.items.some((i) => i.product_name_snapshot.toLowerCase().includes(term)) ||
        o.keys.some((k) => k.toLowerCase().includes(term)),
    );
  }, [data, q]);

  const allDeliveredKeys = useMemo(() => {
    return rows.flatMap((o) => o.keys);
  }, [rows]);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("Lisans anahtarı panoya kopyalandı!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportAllKeysTxt = () => {
    if (!allDeliveredKeys.length) return toast.error("İndirilecek anahtar bulunamadı.");
    const content = allDeliveredKeys.join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `siberlisans-tum-anahtarlar-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const head = "referans_kodu;tarih;durum;tutar;urunler;anahtarlar\n";
    const body = rows
      .map((o) => {
        const name = o.product_name ?? o.items.map((i) => `${i.quantity}x ${i.product_name_snapshot}`).join(" | ");
        return `${o.reference_code};${new Date(o.created_at).toLocaleString("tr-TR")};${o.status};${Number(
          o.price_try,
        )};"${name.replace(/"/g, "'")}";"${o.keys.join(" | ")}"`;
      })
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `siberlisans-bayi-siparisler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 font-mono text-sm text-muted-foreground">
        <KeyRound className="h-8 w-8 text-primary animate-pulse mb-3" />
        Lisans kasası taranıyor…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* FILTER & ACTIONS */}
      <div className="glass-card rounded-3xl border border-border/70 p-5 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sipariş referansı, ürün veya lisans anahtarı ara..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 font-mono text-sm h-10 rounded-xl"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="font-mono h-10 rounded-xl" onClick={exportAllKeysTxt} disabled={!allDeliveredKeys.length}>
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Tüm Anahtarları TXT İndir ({allDeliveredKeys.length})
          </Button>
          <Button variant="outline" size="sm" className="font-mono h-10 rounded-xl" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV İndir
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-border/70 bg-card/50 p-12 text-center font-mono">
          <KeyRound className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h4 className="text-base font-semibold">Henüz sipariş kaydı yok</h4>
          <p className="mt-1 text-xs text-muted-foreground">Toptan ürün kataloğundan dilediğiniz lisansı aldığınızda anahtarlar anında bu kasaya tanımlanır.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((o) => {
            const keys = o.keys;
            return (
              <div key={o.id} className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl shadow-lg space-y-4 hover:border-primary/40 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      <span className="font-mono text-sm font-bold text-primary tracking-wider">{o.reference_code}</span>
                      <span
                        className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase font-bold ${
                          o.status === "approved"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-warn/40 bg-warn/10 text-warn"
                        }`}
                      >
                        {o.status === "approved" ? "Teslim Edildi" : o.status}
                      </span>
                    </div>
                    <h4 className="font-semibold text-base text-foreground">
                      {o.product_name ?? o.items.map((i) => `${i.quantity}x ${i.product_name_snapshot}`).join(", ")}
                    </h4>
                    <p className="font-mono text-xs text-muted-foreground">
                      Tarih: {new Date(o.created_at).toLocaleString("tr-TR")} · Toplam {o.item_count} adet lisans
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-xl font-black text-foreground">{try_(o.price_try)}</div>
                    <span className="font-mono text-[11px] text-muted-foreground">Bakiye ile ödendi</span>
                  </div>
                </div>

                {/* DELIVERED KEYS SECTION */}
                {keys.length > 0 && (
                  <div className="rounded-2xl border border-border/60 bg-background/80 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span className="flex items-center gap-1.5 uppercase font-bold tracking-wider">
                        <KeyRound className="h-3.5 w-3.5 text-primary" /> Teslim Edilen Anahtarlar ({keys.length})
                      </span>
                      <button
                        className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                        onClick={() => {
                          navigator.clipboard.writeText(keys.join("\n"));
                          toast.success("Bu siparişteki tüm anahtarlar kopyalandı!");
                        }}
                      >
                        <Copy className="h-3 w-3" /> Tümünü Kopyala
                      </button>
                    </div>

                    <div className="grid gap-2">
                      {keys.map((k, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/60 px-3.5 py-2">
                          <code className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-foreground tracking-wide">
                            {k}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2.5 font-mono text-xs text-primary hover:bg-primary/10"
                            onClick={() => copyKey(k)}
                          >
                            {copiedKey === k ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span className="ml-1 text-[11px]">{copiedKey === k ? "Kopyalandı" : "Kopyala"}</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// TAB 4: KAR & KAZANC SIMULATORU (NEW!)
// ==========================================

function ProfitSimulator({ discountPercent }: { discountPercent: number }) {
  const [costPrice, setCostPrice] = useState<number>(200);
  const [salePrice, setSalePrice] = useState<number>(350);
  const [monthlyVolume, setMonthlyVolume] = useState<number>(50);

  const unitCost = Math.round(costPrice * (1 - discountPercent / 100));
  const unitProfit = Math.max(0, salePrice - unitCost);
  const profitMargin = salePrice > 0 ? Math.round((unitProfit / salePrice) * 100) : 0;
  const totalRevenue = salePrice * monthlyVolume;
  const totalCost = unitCost * monthlyVolume;
  const totalProfit = unitProfit * monthlyVolume;

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
              <Calculator className="h-4 w-4" /> Bayi Kâr Marjı &amp; Gelir Projeksiyonu
            </div>
            <h3 className="text-xl md:text-2xl font-black tracking-tight mt-1">Aylık Ne Kadar Net Kâr Edebilirsiniz?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              SiberLisans toptan fiyat avantajı sayesinde her lisans satışında doğrudan yüksek nakit akışı sağlayın.
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary border border-primary/30 font-mono text-xs px-3 py-1 self-start md:self-auto">
            Mevcut İskontonuz: %{discountPercent}
          </Badge>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 mt-6">
          {/* CONTROLS */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground">Ürün Liste / Piyasa Fiyatı:</span>
                <span className="font-bold text-foreground">{try_(costPrice)}</span>
              </div>
              <Slider
                value={[costPrice]}
                min={50}
                max={2500}
                step={25}
                onValueChange={(val) => {
                  const cp = val[0];
                  setCostPrice(cp);
                  if (salePrice < cp) setSalePrice(Math.round(cp * 1.3));
                }}
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Özel Bayi Alışınız: <strong className="text-primary">{try_(unitCost)}</strong></span>
                <span>(İskonto: %{discountPercent})</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground">Müşterinize Satış Fiyatınız:</span>
                <span className="font-bold text-foreground text-sm">{try_(salePrice)}</span>
              </div>
              <Slider
                value={[salePrice]}
                min={unitCost}
                max={3500}
                step={25}
                onValueChange={(val) => setSalePrice(val[0])}
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Birim Başına Net Kâr: <strong className="text-emerald-400">+{try_(unitProfit)}</strong></span>
                <span>Kâr Marjı: <strong className="text-emerald-400">%{profitMargin}</strong></span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground">Aylık Tahmini Satış Adediniz:</span>
                <span className="font-bold text-foreground text-sm">{monthlyVolume} Lisans</span>
              </div>
              <Slider
                value={[monthlyVolume]}
                min={5}
                max={500}
                step={5}
                onValueChange={(val) => setMonthlyVolume(val[0])}
              />
              <div className="flex items-center gap-2 pt-1">
                {[10, 25, 50, 100, 250].map((v) => (
                  <button
                    key={v}
                    onClick={() => setMonthlyVolume(v)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                      monthlyVolume === v ? "border-primary bg-primary text-primary-foreground font-bold" : "border-border/60 hover:border-primary/40 text-muted-foreground"
                    }`}
                  >
                    {v} Adet
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SIMULATOR SUMMARY RESULT */}
          <div className="lg:col-span-6 rounded-3xl border border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-6 flex flex-col justify-between space-y-6 shadow-xl">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Tahmini Aylık Net Kârınız</span>
              <div className="mt-2 font-mono text-4xl md:text-5xl font-black text-emerald-400 tracking-tight flex items-baseline gap-2">
                <span>+{tryInt(totalProfit)}</span>
                <span className="text-xs text-muted-foreground font-normal">/ ay net</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Müşterilerinize doğrudan lisans teslim ederek veya kendi e-ticaret sitenizde otomatik satarak elde edeceğiniz net kazanç.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/60 font-mono text-xs">
              <div className="rounded-xl border border-border/50 bg-background/50 p-3">
                <span className="text-muted-foreground text-[10px] uppercase">Aylık Cironuz</span>
                <div className="mt-1 font-bold text-foreground text-sm">{try_(totalRevenue)}</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/50 p-3">
                <span className="text-muted-foreground text-[10px] uppercase">Toptan Maliyet</span>
                <div className="mt-1 font-bold text-muted-foreground text-sm">{try_(totalCost)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <p className="text-xs text-foreground leading-relaxed">
                Yüksek adetli alımlarda bir üst bayi kademesine geçerek toptan alış fiyatınızı daha da düşürebilir ve kârınızı artırabilirsiniz.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB 5: MUSTERILERIM & QR DAVET RADARI
// ==========================================

function Customers({ inviteUrl, code }: { inviteUrl: string; code: string }) {
  const customersFn = useServerFn(getDealerCustomers);
  const { data, isLoading } = useQuery<DealerCustomerRow[]>({
    queryKey: ["dealer-customers"],
    queryFn: () => customersFn(),
  });

  const totalSpent = useMemo(() => (data ?? []).reduce((s, c) => s + Number(c.total_spent), 0), [data]);
  const totalOrders = useMemo(() => (data ?? []).reduce((s, c) => s + Number(c.order_count), 0), [data]);

  const shareWhatsapp = () => {
    const text = encodeURIComponent(`Merhaba! En popüler orijinal yazılım ve lisansları SiberLisans güvencesiyle uygun fiyata satın almak için bağlantım: ${inviteUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const shareTelegram = () => {
    const text = encodeURIComponent(`Orijinal dijital lisanslar ve güvenlik yazılımları için resmi bayi linkim:`);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`, "_blank");
  };

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground py-10 text-center">Müşteri listesi taranıyor…</p>;

  return (
    <div className="space-y-6">
      {/* REFERRAL & QR GROWTH CARD */}
      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8 glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl flex flex-col justify-between space-y-6 shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
              <Share2 className="h-4 w-4" /> Müşteri &amp; Bayi Ağı Büyütme
            </div>
            <h3 className="text-xl font-bold tracking-tight">Kendi Müşteri Portföyünüzü Oluşturun</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Müşterilerinize özel davet linkinizi veya QR kodunuzu gönderin. Sizin kodunuzla kaydolan her müşteri
              otomatik olarak ağınıza kaydedilir ve yaptıkları her alışverişten bayi cirosu ve komisyon kazanırsınız.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border/80 bg-background/80 px-3.5 py-2.5 font-mono text-xs text-foreground">
                {inviteUrl}
              </code>
              <Button
                size="sm"
                className="font-mono h-10 px-4 shrink-0 shadow-sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  toast.success("Davet linkiniz kopyalandı!");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Kopyala
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button size="sm" variant="outline" className="font-mono h-9 text-xs" onClick={shareWhatsapp}>
                <Send className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> WhatsApp'ta Paylaş
              </Button>
              <Button size="sm" variant="outline" className="font-mono h-9 text-xs" onClick={shareTelegram}>
                <Share2 className="mr-1.5 h-3.5 w-3.5 text-cyan" /> Telegram'da Paylaş
              </Button>
            </div>
          </div>
        </div>

        {/* QR CODE CARD */}
        <div className="md:col-span-4 glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-4 shadow-xl">
          <div className="rounded-2xl border border-primary/30 bg-background/90 p-4 shadow-inner">
            <QRCodeSVG
              value={inviteUrl}
              size={140}
              bgColor="transparent"
              fgColor="currentColor"
              level="M"
              className="text-primary"
            />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-foreground">Özel Bayi QR Kodu</div>
            <p className="mt-1 text-[11px] text-muted-foreground font-mono">
              Fiziksel dükkanınızda veya kartvizitinizde sergileyin
            </p>
          </div>
        </div>
      </div>

      {/* METRICS & CUSTOMER LIST TABLE */}
      <div className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base">Bağlı Müşteri Listesi ({data?.length ?? 0})</h3>
            <p className="text-xs text-muted-foreground font-mono">Sizin yönlendirmenizle alışveriş yapan müşteriler</p>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            Toplam Müşteri Harcaması: <strong className="text-primary">{try_(totalSpent)}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border/70 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left">Müşteri</th>
                <th className="pb-3 text-left">E-Posta (Maskeli)</th>
                <th className="pb-3 text-right">Sipariş Sayısı</th>
                <th className="pb-3 text-right">Toplam Harcama</th>
                <th className="pb-3 text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono text-xs">
              {(data ?? []).map((c) => (
                <tr key={c.user_id} className="hover:bg-primary/5 transition-colors">
                  <td className="py-3 font-semibold text-foreground flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[10px]">
                      {c.display_name.slice(0, 1).toUpperCase()}
                    </div>
                    <span>{c.display_name}</span>
                  </td>
                  <td className="py-3 text-muted-foreground">{c.email_masked ?? "—"}</td>
                  <td className="py-3 text-right">{c.order_count} sipariş</td>
                  <td className="py-3 text-right font-bold text-foreground">{try_(c.total_spent)}</td>
                  <td className="py-3 text-right">
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                      Aktif
                    </span>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    Henüz kayıtlı müşteriniz bulunmamaktadır. Davet linkinizi paylaşarak ilk müşterilerinizi ekleyin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB 6: API & OTOMASYON MERKEZI
// ==========================================

function ApiAccess({ code }: { code: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [langTab, setLangTab] = useState<"curl" | "node" | "python" | "php">("curl");

  const listKeysFn = useServerFn(listDealerApiKeys);
  const issueKeyFn = useServerFn(issueDealerApiKey);
  const revokeKeyFn = useServerFn(revokeDealerApiKey);

  const { data: keys } = useQuery<DealerApiKeyRow[]>({
    queryKey: ["dealer-api-keys"],
    queryFn: () => listKeysFn(),
  });

  const base = typeof window !== "undefined" ? window.location.origin : "https://siberlisans.com";
  const activeKeySample = fresh || (keys && keys.length > 0 && !keys[0].revoked ? `${keys[0].key_prefix}****************` : "sbr_live_xxxxxxxxxxxxxxxx");

  const issue = async () => {
    setBusy(true);
    try {
      const row = await issueKeyFn({ data: { label: label || "E-Ticaret Entegrasyonu" } });
      setFresh(row.api_key);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["dealer-api-keys"] });
      toast.success("API Anahtarı başarıyla oluşturuldu! Lütfen güvenli bir yere kaydedin.");
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
      toast.success("API Anahtarı iptal edildi.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* API KEYS MANAGER */}
      <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
              <KeyRound className="h-4 w-4" /> B2B REST API Anahtarlarınız
            </div>
            <h3 className="text-xl font-bold tracking-tight">Kendi Web Sitenize veya Botunuza Bağlayın</h3>
            <p className="text-sm text-muted-foreground">
              Toptan fiyatları anlık çekin, sipariş açın ve lisans anahtarlarını 0 saniye gecikmeyle otomatik teslim alın.
            </p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs self-start md:self-auto">
            Maks. 5 Aktif Anahtar
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Anahtar etiketi (örn. WooCommerce Sitem, Telegram Botu)..."
            maxLength={40}
            className="max-w-md font-mono text-sm h-10 rounded-xl"
          />
          <Button onClick={issue} disabled={busy} className="font-mono h-10 shadow-sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Oluşturuluyor…" : "Yeni API Anahtarı Oluştur"}
          </Button>
        </div>

        {fresh && (
          <div className="rounded-2xl border border-primary/50 bg-primary/10 p-5 space-y-2 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center gap-2 font-mono text-xs uppercase font-bold text-primary">
              <ShieldCheck className="h-4 w-4" /> Yeni API Anahtarınızı Şimdi Kopyalayın
            </div>
            <p className="text-xs text-muted-foreground">
              Bu anahtar güvenlik nedeniyle veritabanında şifrelenir ve bir daha tam olarak görüntülenemez!
            </p>
            <div className="flex items-center gap-2 pt-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-primary/30 bg-background/90 px-3.5 py-2 font-mono text-xs font-bold text-foreground">
                {fresh}
              </code>
              <Button
                size="sm"
                className="font-mono h-9 shrink-0 shadow-sm"
                onClick={() => {
                  navigator.clipboard.writeText(fresh);
                  toast.success("API Anahtarı kopyalandı!");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Kopyala
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/70 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left">Etiket / İsim</th>
                <th className="pb-3 text-left">Önek</th>
                <th className="pb-3 text-right">Toplam Çağrı</th>
                <th className="pb-3 text-left">Son Kullanım</th>
                <th className="pb-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono text-xs">
              {(keys ?? []).map((k) => (
                <tr key={k.id} className="hover:bg-primary/5 transition-colors">
                  <td className="py-3 font-semibold text-foreground">{k.label}</td>
                  <td className="py-3 text-muted-foreground">{k.key_prefix}••••••••</td>
                  <td className="py-3 text-right font-bold text-primary">{k.call_count} istek</td>
                  <td className="py-3 text-muted-foreground">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString("tr-TR") : "Henüz kullanılmadı"}
                  </td>
                  <td className="py-3 text-right">
                    {k.revoked ? (
                      <span className="text-muted-foreground">İptal Edildi</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs font-mono text-destructive hover:bg-destructive/10"
                        onClick={() => revoke(k.id)}
                      >
                        İptal Et
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(keys ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Henüz aktif bir API anahtarınız yok. Yukarıdaki butondan anında oluşturabilirsiniz.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CODE GENERATOR & INTERACTIVE PLAYGROUND */}
      <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
              <Terminal className="h-4 w-4" /> Canlı Kod Entegrasyon Örnekleri
            </div>
            <h4 className="text-base font-bold mt-1">İstediğiniz Dilde Tek Tıkla Bağlanın</h4>
          </div>
          <div className="flex items-center rounded-xl border border-border/70 bg-background/60 p-1">
            {(["curl", "node", "python", "php"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLangTab(l)}
                className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors uppercase ${
                  langTab === l ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="relative rounded-2xl border border-border/60 bg-background/90 p-4 font-mono text-xs overflow-x-auto">
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-3 top-3 h-7 text-xs font-mono text-primary"
            onClick={() => {
              const codeEl = document.getElementById("api-code-snippet");
              if (codeEl) {
                navigator.clipboard.writeText(codeEl.innerText);
                toast.success("Kod örneği panoya kopyalandı!");
              }
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" /> Kopyala
          </Button>

          <pre id="api-code-snippet" className="leading-relaxed text-muted-foreground">
            {langTab === "curl" && `# 1. Toptan Ürün ve Stok Listesini Çek
curl -X GET "${base}/api/public/dealer/products" \\
  -H "Authorization: Bearer ${activeKeySample}"

# 2. Cüzdan Bakiyesi ile Anında Lisans Siparişi Ver (0 saniye teslimat)
curl -X POST "${base}/api/public/dealer/orders" \\
  -H "Authorization: Bearer ${activeKeySample}" \\
  -H "Content-Type: application/json" \\
  -d '{"product_id": "URUN_UUID", "quantity": 1}'`}

            {langTab === "node" && `// Node.js / TypeScript Entegrasyonu
const API_KEY = "${activeKeySample}";
const BASE_URL = "${base}/api/public/dealer";

// Ürünleri Listele
async function getProducts() {
  const res = await fetch(\`\${BASE_URL}/products\`, {
    headers: { Authorization: \`Bearer \${API_KEY}\` }
  });
  return await res.json();
}

// Otomatik Lisans Siparişi Ver
async function orderLicense(productId, quantity = 1) {
  const res = await fetch(\`\${BASE_URL}/orders\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ product_id: productId, quantity })
  });
  const data = await res.json();
  console.log("Teslim Edilen Lisans Anahtarları:", data.keys);
  return data;
}`}

            {langTab === "python" && `# Python (requests) Entegrasyonu
import requests

API_KEY = "${activeKeySample}"
BASE_URL = "${base}/api/public/dealer"
headers = {"Authorization": f"Bearer {API_KEY}"}

# 1. Toptan Ürünleri Listele
products = requests.get(f"{BASE_URL}/products", headers=headers).json()

# 2. Otomatik Lisans Al
order = requests.post(f"{BASE_URL}/orders", headers=headers, json={
    "product_id": "URUN_UUID",
    "quantity": 1
}).json()

print("Teslim Edilen Anahtarlar:", order.get("keys"))`}

            {langTab === "php" && `<?php
// PHP / WooCommerce / cURL Entegrasyonu
$apiKey = "${activeKeySample}";
$ch = curl_init("${base}/api/public/dealer/orders");

$payload = json_encode([
    "product_id" => "URUN_UUID",
    "quantity" => 1
]);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . $apiKey,
        "Content-Type: application/json"
    ]
]);

$response = json_decode(curl_exec($ch), true);
curl_close($ch);

// Teslim edilen anahtarı müşteriye otomatik ilet
$deliveredKeys = $response['keys'];
?>`}
          </pre>
        </div>
      </div>

      {/* CATALOG FEEDS & EMBED */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl shadow-xl space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
            <Globe className="h-4 w-4" /> E-Ticaret Katalog Akışları (XML / JSON)
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Google Merchant, Facebook Catalog veya kendi e-ticaret sitenize ürünleri otomatik aktarmak için hazır akış linkleri.
          </p>
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-xs">
                {`${base}/api/public/catalog.json?code=${code}`}
              </code>
              <Button size="sm" variant="outline" className="font-mono text-xs h-8" onClick={() => {
                navigator.clipboard.writeText(`${base}/api/public/catalog.json?code=${code}`);
                toast.success("JSON Akış Linki Kopyalandı!");
              }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border/60 bg-background/80 px-3 py-1.5 font-mono text-xs">
                {`${base}/api/public/catalog.xml?code=${code}`}
              </code>
              <Button size="sm" variant="outline" className="font-mono text-xs h-8" onClick={() => {
                navigator.clipboard.writeText(`${base}/api/public/catalog.xml?code=${code}`);
                toast.success("XML Akış Linki Kopyalandı!");
              }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-3xl border border-border/70 p-6 backdrop-blur-xl shadow-xl space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
            <Code2 className="h-4 w-4" /> 1-Satır Hazır Vitrin (Embed Widget)
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kendi blogunuza veya web sitenize tek satır JS ekleyin, SiberLisans ürün vitrini sizin referansınızla otomatik açılsın.
          </p>
          <div className="pt-2">
            <div className="rounded-xl border border-border/60 bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {`<script src="${base}/api/public/embed.js" data-code="${code}" data-theme="dark" data-limit="8"></script>`}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 font-mono text-xs h-8 w-full"
              onClick={() => {
                navigator.clipboard.writeText(`<script src="${base}/api/public/embed.js" data-code="${code}" data-theme="dark" data-limit="8"></script>`);
                toast.success("Embed Kodu Kopyalandı!");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Hazır Vitrin Kodunu Kopyala
            </Button>
          </div>
        </div>
      </div>

      {/* WEBHOOKS MANAGER */}
      <Webhooks />
    </div>
  );
}

// ==========================================
// WEBHOOKS COMPONENT
// ==========================================

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
    if (!/^https:\/\/.+/i.test(url)) return toast.error("Güvenlik gereği https:// ile başlayan bir webhook adresi giriniz.");
    if ((hooks ?? []).length >= 3) return toast.error("En fazla 3 aktif webhook adresi tanımlayabilirsiniz.");
    setBusy(true);
    try {
      await addHookFn({ data: { url: url.trim() } });
      setUrl("");
      qc.invalidateQueries({ queryKey: ["dealer-webhooks"] });
      toast.success("Webhook başarıyla kaydedildi!");
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
      toast.success("Webhook silindi.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-xl space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-primary">
            <Zap className="h-4 w-4" /> Anlık Webhook Bildirimleri
          </div>
          <h3 className="text-xl font-bold tracking-tight">Fiyat ve Stok Değişimlerini Sitenize Otomatik Yansıtın</h3>
          <p className="text-sm text-muted-foreground">
            Bir ürünün fiyatı veya stok durumu değiştiğinde sistemimiz sunucunuza anında HMAC-SHA256 imzalı POST isteği gönderir.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://siteniz.com/api/siberlisans-webhook..."
          maxLength={300}
          className="max-w-md font-mono text-sm h-10 rounded-xl"
        />
        <Button onClick={add} disabled={busy} className="font-mono h-10 shadow-sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Kaydediliyor…" : "Webhook Ekle"}
        </Button>
      </div>

      <div className="space-y-3">
        {(hooks ?? []).map((h) => (
          <div key={h.id} className="rounded-2xl border border-border/60 bg-background/80 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs font-bold text-foreground">{h.url}</code>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {h.active ? `Durum: ${h.last_status ?? "Aktif"}` : "Pasif"}
                  {h.fail_count > 0 && <span className="text-destructive"> · Hata: {h.fail_count}</span>}
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs font-mono text-destructive hover:bg-destructive/10" onClick={() => remove(h.id)}>
                  Sil
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                HMAC Secret: {h.secret}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-7 font-mono text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(h.secret);
                  toast.success("Secret kopyalandı!");
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {(hooks ?? []).length === 0 && (
          <div className="rounded-2xl border border-border/40 bg-card/40 p-6 text-center font-mono text-xs text-muted-foreground">
            Henüz kayıtlı bir webhook adresiniz bulunmamaktadır.
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// TAB 7: VIP BAYI GUVENCESI & SÖZLEŞME
// ==========================================

function DealerPerks() {
  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl border border-border/70 p-6 md:p-8 backdrop-blur-xl shadow-2xl space-y-8">
        <div>
          <Badge className="bg-primary/10 text-primary border border-primary/30 font-mono text-xs mb-2">
            SIBERLISANS B2B TAAHHÜTNAMESİ
          </Badge>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Neden Bayilerimiz Bizi Tercih Ediyor &amp; Asla Vazgeçmiyor?
          </h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-relaxed">
            SiberLisans, sıradan bir e-ticaret sitesi değil; B2B bayileri ve ajanslar için özel olarak inşa edilmiş yüksek hızlı bir dijital tedarik terminalidir.
          </p>
        </div>

        {/* 4 PILLARS */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/20">
              <Zap className="h-6 w-6" />
            </div>
            <h4 className="text-lg font-bold text-foreground">0 Saniye Otomatik Lisans Teslimatı</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Müşterinizi bekletmeyin. Panelden veya API'nizden sipariş verildiği salise, lisans anahtarı doğrudan tahsis edilir. Bekleme, manuel onay veya gecikme yoktur.
            </p>
          </div>

          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h4 className="text-lg font-bold text-foreground">%100 Birebir Değişim &amp; Çalışma Garantisi</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tedarik ettiğiniz anahtarlarda oluşabilecek nadir aktivasyon problemlerinde destek ekibimiz sorgusuz sualsiz anında telafi anahtarı sağlar. Müşterinize karşı asla mahcup olmazsınız.
            </p>
          </div>

          <div className="rounded-3xl border border-cyan/30 bg-cyan/5 p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan/15 text-cyan border border-cyan/20">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h4 className="text-lg font-bold text-foreground">Garantili Toptan Fiyat &amp; İskonto Koruması</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bayilerimize her zaman piyasadaki en rekabetçi toptan fiyatlar sunulur. Yüksek ciro yapan bayilerimiz otomatik olarak daha üst seviyeye yükselir ve kâr marjları artar.
            </p>
          </div>

          <div className="rounded-3xl border border-purple-500/30 bg-purple-500/5 p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/20">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h4 className="text-lg font-bold text-foreground">Öncelikli 7/24 B2B Destek Hattı</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bayilerimiz standart destek sıralarında beklemez. WhatsApp ve özel B2B destek kanallarımız üzerinden teknik ekibimizle anında iletişime geçebilirsiniz.
            </p>
          </div>
        </div>

        {/* B2B CONTACT BANNER */}
        <div className="rounded-3xl border border-border/80 bg-gradient-to-r from-card via-card to-primary/10 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-bold text-base text-foreground">Özel Toplu Alım veya Kurumsal Entegrasyon Talebiniz mi Var?</h4>
            <p className="text-xs text-muted-foreground">
              Aylık 500+ üzeri lisans alımları veya özel yazılım entegrasyonları için doğrudan B2B yöneticimizle görüşebilirsiniz.
            </p>
          </div>
          <Button asChild size="lg" className="font-mono shrink-0 shadow-lg shadow-primary/20">
            <Link to="/iletisim">
              <MessageSquare className="mr-2 h-4 w-4" /> B2B Destek ile İletişime Geç
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
