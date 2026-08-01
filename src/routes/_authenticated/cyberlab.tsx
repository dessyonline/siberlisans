import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, ExternalLink, Lock, Clock, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCyberlabAccess } from "@/lib/cyberlab.functions";

export const Route = createFileRoute("/_authenticated/cyberlab")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CyberLab Paneli | SiberLisans" },
      {
        name: "description",
        content:
          "Satın aldığın CyberLab siber güvenlik laboratuvarına panelinden tek tıkla giriş yap.",
      },
      { property: "og:title", content: "CyberLab Paneli | SiberLisans" },
      {
        property: "og:description",
        content: "CyberLab erişimini görüntüle ve tek tıkla oturum aç.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CyberlabPage,
});

const FEATURES = [
  "OSINT & keşif araç seti",
  "Etkileşimli siber güvenlik dersleri",
  "Kurs modülleri ve ilerleme takibi",
  "Canlı terminal oturumları",
];

function CyberlabPage() {
  const fetchAccess = useServerFn(getCyberlabAccess);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["cyberlab-access-full"],
    queryFn: () => fetchAccess({ data: undefined as never }),
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 md:px-4 md:py-10">
      <div className="glass-card corner-cut rounded-xl p-5 md:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 neon-glow">
            <FlaskConical className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-mono text-xl md:text-2xl font-bold text-foreground neon-text-glow">
              CyberLab
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Siber güvenlik laboratuvarı — dersler, kurslar ve OSINT araçları.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f}
              className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2 font-mono text-xs text-muted-foreground"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-border/50 pt-6">
          {isLoading ? (
            <div className="font-mono text-sm text-muted-foreground">$ erişim kontrol ediliyor…</div>
          ) : data?.active ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-primary">
                  erişim aktif
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {data.lifetime
                    ? "ömür boyu"
                    : `bitiş: ${new Date(data.expiresAt!).toLocaleDateString("tr-TR")}`}
                </span>
              </div>

              {data.launchUrl ? (
                <Button asChild size="lg" className="w-full sm:w-auto font-mono neon-glow">
                  <a href={data.launchUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    CyberLab'i aç
                  </a>
                </Button>
              ) : (
                <p className="font-mono text-xs text-warn">
                  CyberLab sunucu adresi henüz tanımlı değil. Yönetici adresi ekledikten sonra giriş
                  butonu burada görünecek.
                </p>
              )}

              <button
                type="button"
                onClick={() => refetch()}
                className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary"
              >
                <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                giriş bağlantısını yenile
              </button>
              <p className="font-mono text-[11px] text-muted-foreground/70">
                Bağlantı güvenlik gereği 5 dakika geçerlidir; süresi dolarsa yenileyin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                <Lock className="h-4 w-4" /> Bu hesapta aktif CyberLab erişimi yok.
              </div>
              <Button asChild variant="outline" className="font-mono border-primary/40">
                <Link to="/urunler" search={{ q: "cyberlab" } as never}>
                  CyberLab paketlerine göz at
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
