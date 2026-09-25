import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { listAiPlans, purchaseAiSubscription, getMyAiSubscription } from "@/lib/ai-subscriptions.functions";
import { getMyWallet } from "@/lib/wallet-read.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Check, Zap, Crown, Rocket, Wallet, Info } from "lucide-react";

export const Route = createFileRoute("/paketler/ai")({
  component: Page,
  head: () => ({
    meta: [
      { title: "AI Video Paketleri — En Uygun Fiyat | SiberPHP" },
      { name: "description", content: "AI video üretimi için aylık paketler. Yurtdışı platformlardan çok daha uygun, TL fiyatlama, 30 gün kredi havuzu." },
      { property: "og:title", content: "AI Video Paketleri — SiberPHP" },
      { property: "og:description", content: "₺149'dan başlayan aylık AI video paketleri. Video başına ₺3'ten fiyatlar." },
    ],
  }),
});

type Plan = {
  slug: string;
  name: string;
  price_try: number;
  credits: number;
  yearly_price_try: number | null;
  yearly_credits: number | null;
  perks: string[];
};

const ICONS: Record<string, typeof Zap> = { starter: Zap, pro: Rocket, studio: Crown };

function Page() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [current, setCurrent] = useState<{ plan_slug: string; credits_remaining: number; expires_at: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const nav = useNavigate();
  const { user, ensureUser } = useAuth();
  const fetchWallet = useServerFn(getMyWallet);

  useEffect(() => {
    (async () => {
      const list = (await listAiPlans()) as unknown as Plan[];
      setPlans(list);
      if (user) {
        const [sub, w] = await Promise.all([
          getMyAiSubscription().catch(() => null),
          fetchWallet({ data: undefined as never }).catch(() => null),
        ]);
        setCurrent(sub as typeof current);
        setBalance(w ? w.balance : 0);
      }
    })();
  }, [user]);

  const buy = async (slug: "starter" | "pro" | "studio") => {
    const plan = plans.find((p) => p.slug === slug);
    if (!plan) return;
    const price = billing === "yearly" ? plan.yearly_price_try ?? plan.price_try * 12 : plan.price_try;
    if (!(user ?? (await ensureUser()))) {
      toast.error("Önce giriş yapmalısın");
      nav({ to: "/auth" });
      return;
    }
    if ((balance ?? 0) < price) {
      toast.error(`Cüzdan bakiyen yetersiz. ₺${price} gerekli, ₺${balance?.toFixed(2)} var.`);
      nav({ to: "/cuzdan" as never });
      return;
    }
    if (!confirm(`${plan.name} paketi (${billing === "yearly" ? "yıllık" : "aylık"}) — ₺${price} düşülecek. Onaylıyor musun?`)) return;
    setBusy(slug);
    try {
      await purchaseAiSubscription({ data: { planSlug: slug, billing } });
      toast.success("Paket aktif! Şimdi video üret.");
      nav({ to: "/araclar/video" as never });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-xs text-primary">
          <Sparkles className="h-3 w-3" /> Yeni · AI Aboneliği
        </div>
        <h1 className="font-mono text-3xl sm:text-5xl neon-text">AI Video Paketleri</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Tek kredi havuzu — <span className="text-primary font-semibold">video + görsel + HD upscale</span> aynı paketten harcanır.
          <span className="text-primary font-semibold"> ₺149'dan başlıyor, kullanmasan tek seferlik de alabilirsin</span>. Abonelik zorunlu değil.
        </p>


        <div className="inline-flex rounded-lg border border-border/60 p-1 mt-3">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-4 py-1.5 rounded font-mono text-sm ${billing === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Aylık
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`px-4 py-1.5 rounded font-mono text-sm ${billing === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Yıllık <span className="ml-1 text-[10px] opacity-80">-%17</span>
          </button>
        </div>
      </div>

      {current && (
        <div className="glass-card rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm">
            <div className="font-mono text-primary">Aktif paket: {current.plan_slug.toUpperCase()}</div>
            <div className="text-xs text-muted-foreground">
              Kalan: ₺{Number(current.credits_remaining).toFixed(0)} · {new Date(current.expires_at).toLocaleDateString("tr-TR")} tarihinde biter
            </div>
          </div>
          <Link to={"/araclar/video" as never} className="text-xs font-mono text-primary hover:underline">
            → Video üret
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => {
          const Icon = ICONS[p.slug] ?? Zap;
          const price = billing === "yearly" ? p.yearly_price_try ?? p.price_try * 12 : p.price_try;
          const credits = billing === "yearly" ? p.yearly_credits ?? p.credits * 12 : p.credits;
          const perVideo = (price / (credits / 10)).toFixed(1);
          const popular = p.slug === "pro";
          return (
            <div
              key={p.slug}
              className={`relative glass-card rounded-lg p-6 flex flex-col ${popular ? "border-primary/60 shadow-[0_0_40px_hsl(var(--primary)/0.15)]" : "border-border/60"}`}
            >
              {popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground px-3 py-0.5 text-[10px] font-mono">
                  EN POPÜLER
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5 text-primary" />
                <span className="font-mono text-lg">{p.name}</span>
              </div>
              <div className="mb-1">
                <span className="text-4xl font-mono neon-text">₺{price}</span>
                <span className="text-muted-foreground text-sm">/{billing === "yearly" ? "yıl" : "ay"}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-4">
                ~₺{perVideo} · Hızlı video başına
              </div>
              <div className="text-xs font-mono text-primary mb-3">
                {credits} kredi · 30 gün {billing === "yearly" ? "× 12" : ""}
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => buy(p.slug as "starter" | "pro" | "studio")}
                disabled={busy === p.slug || current?.plan_slug === p.slug}
                className={`font-mono ${popular ? "neon-glow" : ""}`}
                variant={popular ? "default" : "outline"}
              >
                {current?.plan_slug === p.slug ? "Aktif Paket" : busy === p.slug ? "..." : "Satın Al"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="glass-card rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 font-mono text-sm text-primary">
          <Info className="h-4 w-4" /> Universal Kredi Sistemi — Kredi neyle harcanır?
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="text-left py-2 pr-4">Araç</th>
                <th className="text-left py-2 pr-4">Kredi</th>
                <th className="text-left py-2">Not</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/40"><td className="py-2 pr-4">🎬 Fast Video (5sn)</td><td className="text-primary">10 kredi</td><td className="text-muted-foreground text-xs">Kling/Luma turbo</td></tr>
              <tr className="border-b border-border/40"><td className="py-2 pr-4">🎬 HD Video (5sn)</td><td className="text-primary">25 kredi</td><td className="text-muted-foreground text-xs">1080p</td></tr>
              <tr className="border-b border-border/40"><td className="py-2 pr-4">🎬 Cinematic Video</td><td className="text-primary">50 kredi</td><td className="text-muted-foreground text-xs">Sinematik kalite</td></tr>
              <tr className="border-b border-border/40"><td className="py-2 pr-4">🖼️ HD Upscale / İyileştir</td><td className="text-primary">5 kredi</td><td className="text-muted-foreground text-xs">Gemini 3 Pro Image</td></tr>
              <tr className="border-b border-border/40"><td className="py-2 pr-4">🖼️ Restore / Renklendir</td><td className="text-primary">8 kredi</td><td className="text-muted-foreground text-xs">Eski foto onarımı</td></tr>
              <tr className="border-b border-border/40"><td className="py-2 pr-4">🖼️ Özel Prompt Görsel</td><td className="text-primary">6 kredi</td><td className="text-muted-foreground text-xs">Serbest talimat</td></tr>
              <tr><td className="py-2 pr-4">🎨 Arka Plan Kaldır / QR / Sıkıştır</td><td className="text-emerald-400">Ücretsiz</td><td className="text-muted-foreground text-xs">Tarayıcıda çalışır</td></tr>
            </tbody>
          </table>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside pt-2">
          <li>1 kredi = ₺1 değerinde AI aracı — video, görsel, upscale hepsi aynı havuzdan.</li>
          <li>İşlem başlarken önce paketten düşer, kredi yetmezse cüzdandan tamamlanır.</li>
          <li>30 gün sonra kalan krediler yanar (rakiplerle aynı model).</li>
          <li>Paket olmadan tek seferlik ödeme de yapabilirsin — cüzdandan düşer.</li>
        </ul>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground pt-2">
          <Wallet className="h-3 w-3" />
          Cüzdan bakiyen: <span className="text-primary">₺{balance?.toFixed(2) ?? "0.00"}</span>
        </div>
      </div>

      <div className="glass-card rounded-lg p-5">
        <h2 className="font-mono text-lg mb-3">Piyasa Karşılaştırması</h2>
        <p className="text-xs text-muted-foreground mb-3">Yurtdışı AI video platformlarının halka açık aylık ortalama fiyatları — kur & abonelik zorunluluğu dahil.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="text-left py-2 pr-4">Sağlayıcı</th>
                <th className="text-left py-2 pr-4">Aylık başlangıç</th>
                <th className="text-left py-2 pr-4">Video başına</th>
                <th className="text-left py-2">Zorunlu abonelik</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/40 bg-primary/5">
                <td className="py-2 pr-4 text-primary font-semibold">SiberPHP (biz)</td>
                <td className="py-2 pr-4">₺149/ay veya ₺10 tek</td>
                <td className="py-2 pr-4 text-primary">₺3-10</td>
                <td className="py-2">Hayır ✓</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="py-2 pr-4 text-muted-foreground">Yurtdışı rakip A</td>
                <td className="py-2 pr-4">~₺350/ay</td>
                <td className="py-2 pr-4">~₺6</td>
                <td className="py-2">Evet ✗</td>
              </tr>
              <tr className="border-b border-border/40">
                <td className="py-2 pr-4 text-muted-foreground">Yurtdışı rakip B</td>
                <td className="py-2 pr-4">~₺600/ay</td>
                <td className="py-2 pr-4">~₺180</td>
                <td className="py-2">Evet ✗</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-muted-foreground">Yurtdışı rakip C</td>
                <td className="py-2 pr-4">~₺800/ay</td>
                <td className="py-2 pr-4">~₺45</td>
                <td className="py-2">Evet ✗</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
