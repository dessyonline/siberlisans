import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FlaskConical,
  ExternalLink,
  Lock,
  Clock,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Search,
  BookOpen,
  Play,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getCyberlabAccess } from "@/lib/cyberlab.functions";

const SITE_URL = "https://siberlisans.com";

export const Route = createFileRoute("/cyberlab")({
  component: CyberlabPage,
  head: () => ({
    meta: [
      { title: "CyberLab — Siber Güvenlik Laboratuvarı | SiberLisans" },
      {
        name: "description",
        content:
          "OSINT araçları, etkileşimli siber güvenlik dersleri, kurs modülleri ve canlı terminal oturumları. CyberLab erişimi ile tek tıkla başla.",
      },
      { property: "og:title", content: "CyberLab — Siber Güvenlik Laboratuvarı | SiberLisans" },
      {
        property: "og:description",
        content:
          "OSINT araçları, etkileşimli siber güvenlik dersleri ve canlı terminal oturumları.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/cyberlab` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CyberLab — Siber Güvenlik Laboratuvarı | SiberLisans" },
      {
        name: "twitter:description",
        content:
          "OSINT araçları, etkileşimli siber güvenlik dersleri ve canlı terminal oturumları.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/cyberlab` }],
  }),
});

const FEATURES = [
  { icon: Search, title: "OSINT & Keşif", desc: "Domain, IP, e-posta ve sosyal medya üzerinden hedef profilleme araçları." },
  { icon: BookOpen, title: "Etkileşimli Dersler", desc: "Siber güvenlik konularında adım adım ilerleyen modüller." },
  { icon: Play, title: "Kurs Modülleri", desc: "İlerleme takibi ve quizlerle pekiştirilmiş eğitim içerikleri." },
  { icon: Terminal, title: "Canlı Terminal", desc: "Tarayıcıdan doğrudan çalışan pratik laboratuvar ortamı." },
];

const FAQ = [
  {
    q: "CyberLab nedir?",
    a: "Siber güvenlik eğitimi ve OSINT pratiği yapabileceğin harici bir Flask tabanlı laboratuvar uygulamasıdır. SiberLisans üzerinden satın aldığın paketle tek tıkla erişirsin.",
  },
  {
    q: "Erişim nasıl aktif olur?",
    a: "CyberLab erişimi veren bir paket satın aldığında otomatik olarak tanımlanır. Süreli paketlerde bitiş tarihi, ömürlük paketlerde sınırsız erişim sağlanır.",
  },
  {
    q: "Teknik bilgim olmalı mı?",
    a: "Başlangıç seviyesinden ileri seviyeye kadar farklı modüller vardır. Terminal oturumları için temel komut satırı bilgisi yeterlidir.",
  },
];

function CyberlabPage() {
  const { user } = useAuth();
  const fetchAccess = useServerFn(getCyberlabAccess);

  const { data: access, isLoading } = useQuery({
    queryKey: ["cyberlab-access-full", user?.id],
    queryFn: () => fetchAccess({ data: undefined as never }),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: products } = useQuery({
    queryKey: ["cyberlab-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, image_url, grants_app_days")
        .eq("active", true)
        .eq("grants_app", "cyberlab")
        .order("price_try");
      if (error) throw error;
      return data ?? [];
    },
  });

  const hasAccess = !!user && access?.active;

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 md:px-4 md:py-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-background via-background to-primary/10 p-6 md:p-12">
        <div className="absolute inset-0 cyber-grid opacity-20 pointer-events-none" aria-hidden />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" aria-hidden />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[11px] text-primary">
              <FlaskConical className="h-3.5 w-3.5" />
              Siber Güvenlik Laboratuvarı
            </div>
            <h1 className="mt-4 font-mono text-3xl md:text-5xl font-bold text-foreground neon-text-glow">
              CyberLab
            </h1>
            <p className="mt-3 max-w-xl text-sm md:text-base text-muted-foreground leading-relaxed">
              OSINT araçları, etkileşimli siber güvenlik dersleri ve canlı terminal oturumları —
              hepsi tek bir panelde.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {hasAccess ? (
                <LaunchPanel access={access} />
              ) : (
                <>
                  <Button asChild size="lg" className="font-mono neon-glow">
                    <Link to="/urunler" search={{ q: "cyberlab" } as never}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Paketleri incele
                    </Link>
                  </Button>
                  {!user && (
                    <Button asChild variant="outline" size="lg" className="font-mono border-primary/40">
                      <Link to="/auth">Giriş yap</Link>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="hidden md:flex relative">
            <div className="rounded-xl border border-primary/30 bg-background/80 backdrop-blur p-5 neon-glow">
              <Terminal className="h-16 w-16 text-primary" />
            </div>
          </div>
        </div>
      </section>

      {/* Active access panel (compact) for logged in users */}
      {user && !isLoading && access?.active && (
        <section className="mt-6">
          <div className="glass-card corner-cut rounded-xl p-5 md:p-6">
            <LaunchPanel access={access} showMeta />
          </div>
        </section>
      )}

      {/* Features */}
      <section className="mt-10 md:mt-14">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm text-primary">Neler var?</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border/50 bg-background/60 p-5 hover:border-primary/30 transition-colors"
            >
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 w-fit text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-mono text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Packages */}
      <section className="mt-10 md:mt-14">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <h2 className="font-mono text-sm text-primary">CyberLab Paketleri</h2>
          </div>
        </div>

        {products && products.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 p-5 hover:border-primary/50 transition-all"
              >
                <div className="absolute inset-0 cyber-grid opacity-15 pointer-events-none" aria-hidden />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-mono text-base font-semibold text-foreground min-w-0 truncate">
                      {p.name}
                    </h3>
                    <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
                      {p.grants_app_days ? `${p.grants_app_days} gün` : "ömürlük"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-mono text-lg text-primary">₺{Number(p.price_try).toLocaleString("tr-TR")}</span>
                    <Button asChild size="sm" className="font-mono">
                      <Link to="/urun/$slug" params={{ slug: p.slug }}>
                        İncele
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-background/60 p-6 text-center font-mono text-sm text-muted-foreground">
            Şu anda listelenmiş CyberLab paketi yok. Yakında eklenecek.
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="mt-10 md:mt-14">
        <div className="flex items-center gap-2 mb-5">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-mono text-sm text-primary">Sık sorulanlar</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-xl border border-border/50 bg-background/60 p-5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-mono text-sm font-semibold text-foreground">{f.q}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LaunchPanel({
  access,
  showMeta,
}: {
  access: { active: boolean; lifetime: boolean; expiresAt: string | null; launchUrl: string | null };
  showMeta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {showMeta && (
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-primary">
            erişim aktif
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {access.lifetime
              ? "ömür boyu"
              : `bitiş: ${new Date(access.expiresAt!).toLocaleDateString("tr-TR")}`}
          </span>
        </div>
      )}

      {access.launchUrl ? (
        <Button asChild size="lg" className="w-full sm:w-auto font-mono neon-glow cursor-pointer relative z-10">
          <Link 
            to="/cyberlab/sso" 
            search={{ token: access.launchUrl.split("token=")[1] } as any}
            className="flex items-center justify-center w-full h-full"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            CyberLab'i aç
          </Link>
        </Button>
      ) : (
        <p className="font-mono text-xs text-warn">
          CyberLab sunucu adresi henüz tanımlı değil. Yönetici adresi ekledikten sonra giriş butonu
          burada görünecek.
        </p>
      )}
    </div>
  );
}
