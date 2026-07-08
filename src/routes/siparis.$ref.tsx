import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Package, Clock, CheckCircle2, XCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackOrderByRef } from "@/lib/order-tracking.functions";

export const Route = createFileRoute("/siparis/$ref")({
  component: Page,
  head: ({ params }) => ({
    meta: [
      { title: `Sipariş Takibi ${params.ref} — SiberPHP` },
      { name: "description", content: "Referans kodu ile sipariş durumunuzu anında takip edin." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: `Sipariş Takibi · ${params.ref}` },
      { property: "og:description", content: "Referans kodu ile sipariş durumunuzu anında takip edin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_META: Record<string, { l: string; icon: typeof Package; cls: string }> = {
  pending: { l: "havale bekleniyor", icon: Clock, cls: "text-warn border-warn/40 bg-warn/10" },
  reviewing: { l: "inceleniyor", icon: RefreshCcw, cls: "text-cyan border-cyan/40 bg-cyan/10" },
  approved: { l: "onaylı", icon: CheckCircle2, cls: "text-primary border-primary/40 bg-primary/10" },
  rejected: { l: "reddedildi", icon: XCircle, cls: "text-destructive border-destructive/40 bg-destructive/10" },
};

function Page() {
  const { ref } = Route.useParams();
  const router = useRouter();
  const track = useServerFn(trackOrderByRef);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["order-track", ref],
    queryFn: () => track({ data: { ref } }),
    refetchInterval: 15000,
  });

  const meta = data ? (STATUS_META[data.status] ?? STATUS_META.pending) : STATUS_META.pending;
  const Icon = meta.icon;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <div className="mb-6 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        <span>$ track --ref {ref}</span>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">
          aranıyor…
        </div>
      ) : !data ? (
        <div className="glass-card rounded-lg p-8 text-center font-mono">
          <div className="text-destructive text-sm">[!] sipariş bulunamadı</div>
          <div className="mt-2 text-[12px] text-muted-foreground">
            Referans kodunu kontrol edin. <Link to="/" className="text-primary underline">ana sayfa</Link>
          </div>
        </div>
      ) : (
        <>
          <div className={`glass-card rounded-lg border p-5 flex items-center gap-4 ${meta.cls}`}>
            <Icon className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-wider opacity-80">durum</div>
              <div className="font-mono text-xl font-bold">{meta.l}</div>
              {data.external_status && (
                <div className="mt-1 font-mono text-[11px] opacity-80">
                  tedarikçi: {data.external_status}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 glass-card rounded-lg p-5 space-y-2 font-mono text-sm">
            <Row label="referans" value={data.reference_code} mono />
            <Row label="tutar" value={`₺${Number(data.price_try).toLocaleString("tr-TR")}`} />
            <Row label="oluşturuldu" value={new Date(data.created_at).toLocaleString("tr-TR")} />
            {data.approved_at && (
              <Row label="onaylandı" value={new Date(data.approved_at).toLocaleString("tr-TR")} />
            )}
            {data.admin_note && (
              <div className="mt-2 rounded-md border border-border/50 bg-background/40 p-2 text-[12px]">
                <div className="text-muted-foreground text-[10px] uppercase mb-1">not</div>
                {data.admin_note}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" className="font-mono">
              <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              yenile
            </Button>
            <Button asChild size="sm" variant="ghost" className="font-mono">
              <Link to="/hesabim">hesabım →</Link>
            </Button>
          </div>

          <p className="mt-6 font-mono text-[11px] text-muted-foreground text-center">
            durum her 15 sn'de bir otomatik yenilenir
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-1.5 last:border-0 last:pb-0">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wider">{label}</span>
      <span className={mono ? "break-all" : ""}>{value}</span>
    </div>
  );
}
