import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import enparaQr from "@/assets/enpara-qr.png";
import { Copy, CheckCircle2, Clock, XCircle, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/bakiye-yukle/$topupId")({
  component: TopupPayment,
  head: () => ({
    meta: [{ title: "Bakiye Yükle — SiberPHP" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

function copy(text: string, label = "kopyalandı") {
  navigator.clipboard.writeText(text);
  toast.success(label);
}

function TopupPayment() {
  const { topupId } = Route.useParams();

  const { data: topup } = useQuery({
    queryKey: ["topup", topupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("id, user_id, reference_code, amount_try, status, admin_note, created_at, approved_at")
        .eq("id", topupId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 4000,
  });

  const { data: bank } = useQuery({
    queryKey: ["bank", "active"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("*").eq("active", true).limit(1).maybeSingle();
      return data;
    },
  });

  if (!topup) return <div className="p-8 text-center font-mono text-muted-foreground">yükleniyor…</div>;

  const amount = Number(topup.amount_try);
  const status = topup.status;

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 md:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">$ /bakiye_yukle<span className="terminal-caret" /></div>
          <h1 className="mt-1 text-2xl font-bold neon-text md:text-3xl">bakiye yükleme</h1>
        </div>
        <Link to="/cuzdan" className="font-mono text-xs text-muted-foreground hover:text-primary">&larr; cüzdan</Link>
      </div>

      {/* Özet */}
      <div className="glass-card corner-cut rounded-lg p-4 md:p-5 mb-5 neon-glow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] text-muted-foreground">referans</div>
            <button className="flex items-center gap-2 font-mono text-sm text-primary hover:underline"
              onClick={() => copy(topup.reference_code, "referans kopyalandı")}>
              {topup.reference_code} <Copy className="h-3 w-3" />
            </button>
          </div>
          <div>
            <div className="font-mono text-[11px] text-muted-foreground">tutar</div>
            <div className="text-2xl font-bold neon-text-glow font-mono">{amount} TL</div>
          </div>
          <div>
            <div className="font-mono text-[11px] text-muted-foreground">durum</div>
            <div className="text-sm font-bold">
              {status === "pending" && <span className="text-warn flex items-center gap-1"><Clock className="h-3 w-3" /> havale bekleniyor</span>}
              {status === "reviewing" && <span className="text-cyan flex items-center gap-1"><Clock className="h-3 w-3" /> inceleniyor</span>}
              {status === "approved" && <span className="text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> onaylandı</span>}
              {status === "rejected" && <span className="text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> reddedildi</span>}
            </div>
          </div>
        </div>
      </div>

      {status === "approved" && (
        <div className="glass-card rounded-lg p-5 border border-primary/40 bg-primary/5 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary neon-text-glow" />
          <div className="mt-2 text-lg font-bold">bakiyene {amount} TL eklendi</div>
          <Link to="/cuzdan" className="mt-3 inline-flex items-center gap-1 text-primary font-mono text-sm hover:underline">
            cüzdana dön <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {status === "rejected" && (
        <div className="glass-card rounded-lg p-5 border border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive font-bold"><XCircle className="h-4 w-4" /> reddedildi</div>
          {topup.admin_note && <div className="mt-2 text-sm text-muted-foreground">sebep: {topup.admin_note}</div>}
          <Link to="/cuzdan" className="mt-3 inline-flex text-primary font-mono text-sm hover:underline">yeni talep oluştur &rarr;</Link>
        </div>
      )}

      {(status === "pending" || status === "reviewing") && (
        <>
          {bank ? (
            <div className="glass-card rounded-lg p-4 md:p-5">
              <div className="mb-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> havale / eft bilgileri
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,auto] items-start">
                <div className="space-y-2">
                  <Row label="banka" value={bank.bank_name} />
                  <Row label="alıcı" value={bank.holder_name} />
                  <Row label="iban" value={bank.iban} mono />
                  <Row label="tutar" value={`${amount} TL`} />
                  <Row label="açıklama" value={topup.reference_code} mono highlight />
                  <div className="text-[11px] text-warn font-mono mt-1">
                    ⚠︎ açıklamaya mutlaka referansı yaz — eşleşmezse onaylanmaz
                  </div>
                </div>
                <img src={enparaQr} alt="Ödeme için Enpara QR kodu" className="h-32 w-32 rounded border border-border object-cover" />
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-lg p-4 text-sm text-muted-foreground">Banka bilgisi tanımlı değil.</div>
          )}

        </>
      )}
    </div>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="font-mono text-[11px] uppercase text-muted-foreground">{label}</div>
      <button
        onClick={() => copy(value)}
        className={`flex items-center gap-2 text-sm ${mono ? "font-mono" : ""} ${highlight ? "text-primary font-bold" : ""} hover:underline`}
      >
        {value} <Copy className="h-3 w-3 opacity-60" />
      </button>
    </div>
  );
}
