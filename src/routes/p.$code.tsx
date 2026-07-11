import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getPartnerLanding, recordReferralClick } from "@/lib/partner.functions";
import { Button } from "@/components/ui/button";
import { Gift, Shield, Zap, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/p/$code")({
  loader: ({ params }) => getPartnerLanding({ data: { code: params.code } }),
  head: ({ loaderData }) => {
    const name = loaderData?.found ? loaderData.partnerName : "SiberPHP";
    return {
      meta: [
        { title: `${name} seni davet ediyor — SiberPHP` },
        {
          name: "description",
          content: `${name} davet linki ile kayıt ol, ilk ₺300+ siparişinde %5 indirim kuponu (max ₺40) senin olsun.`,
        },
        { property: "og:title", content: `${name} · SiberPHP davet` },
        {
          property: "og:description",
          content: "Kayıt ol, ilk ₺300+ siparişinde %5 indirim kuponu kazan.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PartnerLanding,
  notFoundComponent: () => (
    <div className="min-h-[70vh] grid place-items-center text-center px-4">
      <div>
        <div className="font-mono text-xs text-muted-foreground">./partner --not-found</div>
        <h1 className="text-2xl font-mono neon-text mt-2">Bu davet linki geçersiz</h1>
        <Link to="/" className="text-primary font-mono text-sm mt-4 inline-block">
          → ana sayfaya dön
        </Link>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="text-destructive font-mono">bir hata oluştu</div>
    </div>
  ),
});

function PartnerLanding() {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!data?.found) return;
    // persist referral for signup
    try {
      localStorage.setItem("sp_ref", data.code);
      localStorage.setItem("sp_ref_at", String(Date.now()));
    } catch {
      /* ignore */
    }
    // fire-and-forget click log
    recordReferralClick({
      data: {
        code: data.code,
        source: (typeof document !== "undefined" && document.referrer) || "direct",
      },
    }).catch(() => {});
  }, [data]);

  if (!data?.found) return null;

  return (
    <div className="relative min-h-[80vh] overflow-hidden">
      <div className="cyber-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="hero-orb absolute -top-32 -left-24 w-96 h-96" aria-hidden />
      <div className="hero-orb absolute -bottom-32 -right-24 w-96 h-96" aria-hidden />

      <div className="relative mx-auto max-w-4xl px-4 py-14 md:py-20">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] text-primary">
            <Gift className="h-3 w-3" /> özel davet linki
          </div>
          <h1 className="font-mono text-3xl md:text-5xl neon-text tracking-tight">
            <span className="text-foreground">$</span> {data.partnerName}{" "}
            <span className="text-muted-foreground">→</span>{" "}
            <span className="text-primary">seni davet ediyor</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
            SiberPHP güvenli lisans dağıtım sistemi. Bu link ile kayıt ol, ilk{" "}
            <span className="text-primary font-mono">₺300+</span> siparişinde sana özel{" "}
            <span className="text-primary font-mono">%5 indirim kuponu</span> (max ₺40) hediye.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Button
              size="lg"
              className="neon-glow font-mono"
              onClick={() =>
                navigate({ to: "/auth", search: { ref: data.code } as never })
              }
            >
              Hemen Kayıt Ol <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Link
              to="/urunler"
              className="font-mono text-xs text-muted-foreground hover:text-primary"
            >
              → önce ürünleri incele
            </Link>
          </div>

          <div className="pt-2 font-mono text-[11px] text-muted-foreground">
            davet kodu: <span className="text-primary">{data.code}</span>
            {params.code.toLowerCase() !== data.code.toLowerCase() && (
              <span className="ml-2">· slug: {params.code}</span>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mt-12">
          <Perk icon={Gift} title="₺10 hoşgeldin" desc="İlk ₺300 alışverişte cüzdan bakiyesi" />
          <Perk icon={Zap} title="Anında teslim" desc="Ödeme sonrası saniyeler içinde lisans" />
          <Perk icon={Shield} title="Güvenli" desc="HWID koruma + garanti" />
        </div>

        <div className="mt-10 glass-card rounded-xl p-5 md:p-6">
          <div className="font-mono text-xs text-muted-foreground mb-3">./nasil-calisir</div>
          <ol className="space-y-2 text-sm">
            {[
              "Kayıt ol butonuna tıkla, davet kodu otomatik uygulanır",
              "E-posta ile hesap oluştur ve doğrula",
              "İlk ₺300+ alışverişini tamamla",
              "₺10 bakiye anında cüzdanına yatar",
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Perk({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 corner-cut">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-2 font-mono text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
    </div>
  );
}
