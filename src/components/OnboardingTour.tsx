import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Terminal, Package, ShoppingCart, ShieldCheck, ChevronRight, X, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getOnboardingStatus, markOnboarded } from "@/lib/storefront.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: Terminal,
    title: "Hoş geldin, operatör.",
    body: "SiberPHP; havale/EFT, cüzdan ve kripto ile anında lisans teslimatı yapan güvenli bir platform. Terminal DNA'sı, otomatik teslimat, gerçek zamanlı destek.",
    cta: { to: "/urunler", label: "ürünlere göz at" },
  },
  {
    icon: Package,
    title: "Ürünleri keşfet.",
    body: "Uniquelisans havuzumuzdaki tüm lisansları, indirimleri (flash), retail fiyat karşılaştırmalarını ve stok bildirimlerini tek sayfada bulacaksın.",
    cta: { to: "/urunler", label: "kataloğa git" },
  },
  {
    icon: ShoppingCart,
    title: "Sepet & Ödeme.",
    body: "Sepete ekle → cüzdan bakiyesiyle ya da Shopier ile öde. Onay sonrası anahtar/mail:şifre otomatik teslim edilir teslim edilir.",
    cta: { to: "/paketler", label: "paketleri gör" },
  },
  {
    icon: ShieldCheck,
    title: "Hesabını güvene al.",
    body: "2FA (Google Authenticator), Trusted Devices ve IP değişim korumasını Güvenlik menüsünden açık tut. Sana özel puan/tier avantajları için Davet sayfasını dene.",
    cta: { to: "/guvenlik", label: "güvenlik ayarları" },
  },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const getStatus = useServerFn(getOnboardingStatus);
  const markOnboardedFn = useServerFn(markOnboarded);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // Skip if session flag or profile already onboarded
      if (typeof window !== "undefined" && sessionStorage.getItem("onb-skip") === "1") return;
      const data = await getStatus();
      if (cancelled) return;
      if (!data?.onboarded) {
        // brief delay so user sees the page first
        setTimeout(() => setOpen(true), 800);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const finish = async () => {
    setBusy(true);
    try {
      await markOnboardedFn();
    } catch {
      // ignore
    }
    sessionStorage.setItem("onb-skip", "1");
    setOpen(false);
    setBusy(false);
  };

  const skip = () => {
    sessionStorage.setItem("onb-skip", "1");
    setOpen(false);
    // fire-and-forget mark so it doesn't re-appear next login
    markOnboardedFn().then(() => {});
  };

  if (!open || !user) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="glass-card corner-cut relative w-full max-w-lg rounded-lg border border-primary/40 bg-background/95 p-6 shadow-[0_0_60px_rgba(0,255,157,0.25)]">
        <button
          type="button"
          aria-label="Kapat"
          onClick={skip}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          $ ./onboarding --step={step + 1}/{STEPS.length}
        </div>

        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-md border border-primary/30 bg-primary/10 p-3 neon-glow">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-mono text-xl neon-text">{s.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
          </div>
        </div>

        {/* progress dots */}
        <div className="mt-6 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded transition-all ${
                i === step
                  ? "bg-primary neon-glow"
                  : i < step
                    ? "bg-primary/60"
                    : "bg-border/50"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:items-center">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={skip} className="font-mono text-muted-foreground">
              atla
            </Button>
            {s.cta && (
              <Button asChild variant="outline" size="sm" className="font-mono">
                <Link to={s.cta.to} onClick={skip}>
                  {s.cta.label} →
                </Link>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((v) => v - 1)} className="font-mono">
                geri
              </Button>
            )}
            {!isLast ? (
              <Button size="sm" onClick={() => setStep((v) => v + 1)} className="font-mono neon-glow">
                devam <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={finish} disabled={busy} className="font-mono neon-glow">
                <Check className="h-4 w-4 mr-1" /> başlayalım
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
