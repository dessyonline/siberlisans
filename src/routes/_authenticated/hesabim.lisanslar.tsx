import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyLicenses, releaseMyHwid, type MyLicense } from "@/lib/licenses.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Cpu,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/hesabim/lisanslar")({
  component: MyLicenses,
  head: () => ({
    meta: [
      { title: "Lisanslarım — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function mask(s: string | null | undefined, keep = 4) {
  if (!s) return "—";
  if (s.length <= keep * 2) return s;
  return s.slice(0, keep) + "•".repeat(Math.max(4, s.length - keep * 2)) + s.slice(-keep);
}

function formatRemaining(expiresAt: string | null): {
  label: string;
  pct: number;
  tone: "ok" | "warn" | "expired";
} {
  if (!expiresAt) return { label: "Ömür boyu", pct: 100, tone: "ok" };
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return { label: "Süresi doldu", pct: 0, tone: "expired" };
  const days = Math.floor(diff / (86400 * 1000));
  const hours = Math.floor((diff % (86400 * 1000)) / (3600 * 1000));
  const label = days > 0 ? `${days} gün ${hours} saat kaldı` : `${hours} saat kaldı`;
  // %: 30 günü referans al
  const pct = Math.min(100, Math.max(4, (diff / (30 * 86400 * 1000)) * 100));
  const tone: "ok" | "warn" | "expired" = days < 3 ? "warn" : "ok";
  return { label, pct, tone };
}

function MyLicenses() {
  const router = useRouter();
  const fetchLicenses = useServerFn(listMyLicenses);
  const releaseHwid = useServerFn(releaseMyHwid);

  const { data: licenses, isLoading, refetch } = useQuery({
    queryKey: ["my-licenses"],
    queryFn: () => fetchLicenses(),
  });

  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const handleCopy = async (val: string, label = "Anahtar") => {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(`${label} kopyalandı`);
    } catch {
      toast.error("Kopyalanamadı");
    }
  };

  const handleReset = async (l: MyLicense) => {
    if (!confirm(`${l.product?.name ?? "Lisans"} için HWID sıfırlanacak. Programı bir sonraki açılışta yeniden aktifleştirmen gerekir. Devam edilsin mi?`)) return;
    setBusy(l.id);
    try {
      await releaseHwid({ data: { license_key_id: l.id } });
      toast.success("HWID sıfırlandı. Yeni cihazda aktifleştirebilirsin.");
      await refetch();
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sıfırlanamadı");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background scan-line">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <Link to="/hesabim" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> hesabıma dön
            </Link>
            <h1 className="text-2xl font-mono neon-text-glow">$ lisanslarım</h1>
            <p className="text-xs text-muted-foreground mt-1">HWID durumu, kalan süre ve yenileme aksiyonları.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            yenile
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-16 font-mono text-sm text-muted-foreground">yükleniyor…</div>
        ) : !licenses || licenses.length === 0 ? (
          <div className="glass-card corner-cut rounded-lg p-12 text-center">
            <KeyRound className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">Henüz aktif bir lisansın yok.</p>
            <Link to="/urunler">
              <Button className="mt-4 neon-glow" size="sm">$ ürünlere göz at</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {licenses.map((l) => {
              const remaining = formatRemaining(l.expires_at);
              const isRevealed = revealed[l.id];
              const isExpired = remaining.tone === "expired";
              const isRevoked = !!l.revoked;
              const hasHwid = !!l.hwid;
              const status = isRevoked
                ? { label: "İptal", tone: "text-destructive", icon: XCircle }
                : isExpired
                  ? { label: "Süresi doldu", tone: "text-destructive", icon: XCircle }
                  : hasHwid
                    ? { label: "Aktif", tone: "text-primary", icon: CheckCircle2 }
                    : { label: "Teslim edildi", tone: "text-cyan", icon: KeyRound };
              const StatusIcon = status.icon;

              return (
                <div key={l.id} className="glass-card corner-cut rounded-lg p-5 space-y-4">
                  {/* header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className={`h-4 w-4 ${status.tone}`} />
                        <span className={`text-xs font-mono uppercase tracking-wider ${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                      <h3 className="font-semibold text-base truncate">{l.product?.name ?? "Ürün"}</h3>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        ref: {l.order_reference ?? "—"}
                      </div>
                    </div>
                    {isExpired && l.product?.slug && (
                      <Link to="/urun/$slug" params={{ slug: l.product.slug }}>
                        <Button size="sm" variant="outline" className="border-primary/40 text-primary">
                          <RefreshCw className="h-3 w-3 mr-1" /> yenile
                        </Button>
                      </Link>
                    )}
                  </div>

                  {/* key */}
                  <div className="rounded-md bg-muted/20 border border-border/40 p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                      lisans anahtarı
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-xs sm:text-sm break-all text-primary">
                        {isRevealed ? l.key_value : mask(l.key_value, 4)}
                      </code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setRevealed((r) => ({ ...r, [l.id]: !r[l.id] }))}
                      >
                        {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleCopy(l.key_value, "Anahtar")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* meta grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">
                        <Cpu className="h-3 w-3" /> HWID
                      </div>
                      <div className="font-mono truncate">
                        {hasHwid ? (
                          <span className="text-primary">{mask(l.hwid, 6)}</span>
                        ) : (
                          <span className="text-muted-foreground">bağlı değil</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">
                        <Clock className="h-3 w-3" /> aktivasyon
                      </div>
                      <div className="font-mono">
                        {l.activated_at
                          ? new Date(l.activated_at).toLocaleDateString("tr-TR")
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">bitiş</div>
                      <div className="font-mono">
                        {l.expires_at
                          ? new Date(l.expires_at).toLocaleDateString("tr-TR")
                          : "ömür boyu"}
                      </div>
                    </div>
                  </div>

                  {/* progress */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span
                        className={
                          remaining.tone === "expired"
                            ? "text-destructive"
                            : remaining.tone === "warn"
                              ? "text-warn"
                              : "text-primary"
                        }
                      >
                        {remaining.label}
                      </span>
                      {l.duration_days && (
                        <span className="text-muted-foreground">{l.duration_days} günlük plan</span>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          remaining.tone === "expired"
                            ? "bg-destructive"
                            : remaining.tone === "warn"
                              ? "bg-warn"
                              : "bg-primary neon-glow"
                        }`}
                        style={{ width: `${remaining.pct}%` }}
                      />
                    </div>
                  </div>

                  {/* actions */}
                  {hasHwid && !isRevoked && !isExpired && (
                    <div className="flex items-center justify-end pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === l.id}
                        onClick={() => handleReset(l)}
                        className="border-warn/40 text-warn hover:bg-warn/10"
                      >
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        {busy === l.id ? "sıfırlanıyor…" : "HWID sıfırla (24s/kez)"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
