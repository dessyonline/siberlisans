import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCryptoSettings,
  getLiveRate,
  submitCryptoDeposit,
  listMyCryptoDeposits,
} from "@/lib/crypto.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bitcoin, Copy, CheckCircle2, Clock, XCircle, ExternalLink, Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kripto-yukle")({
  component: CryptoTopupPage,
  head: () => ({
    meta: [
      { title: "Kripto ile Yükle — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STATUS: Record<string, { l: string; c: string; icon: typeof Clock }> = {
  pending: { l: "beklemede", c: "text-warn", icon: Clock },
  confirmed: { l: "onaylandı", c: "text-primary", icon: CheckCircle2 },
  rejected: { l: "reddedildi", c: "text-destructive", icon: XCircle },
};

function fmt(n: number, d = 2) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

function CryptoTopupPage() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getCryptoSettings);
  const rateFn = useServerFn(getLiveRate);
  const submitFn = useServerFn(submitCryptoDeposit);
  const listFn = useServerFn(listMyCryptoDeposits);

  const { data: settings } = useQuery({ queryKey: ["crypto-settings"], queryFn: () => settingsFn() });
  const { data: rate } = useQuery({
    queryKey: ["crypto-rate"],
    queryFn: () => rateFn(),
    refetchInterval: 60_000,
  });
  const { data: deposits } = useQuery({ queryKey: ["my-crypto-deposits"], queryFn: () => listFn() });

  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);

  const enabled = !!settings?.enabled && !!settings?.trc20_address;

  async function copyAddress() {
    if (!settings?.trc20_address) return;
    await navigator.clipboard.writeText(settings.trc20_address);
    toast.success("Adres panoya kopyalandı");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!txHash.trim()) return;
    setBusy(true);
    try {
      const res = await submitFn({ data: { txHash: txHash.trim() } });
      toast.success(`Cüzdanınıza ${fmt(res.amountTry)} ₺ (${res.amountUsdt} USDT) eklendi!`);
      setTxHash("");
      qc.invalidateQueries({ queryKey: ["my-crypto-deposits"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 md:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">$ /kripto-yukle<span className="terminal-caret" /></div>
          <h1 className="mt-1 text-2xl font-bold neon-text md:text-3xl">USDT-TRC20 ile yükle</h1>
        </div>
        <Link to="/cuzdan" className="font-mono text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> cüzdan
        </Link>
      </div>

      {!enabled ? (
        <div className="glass-card corner-cut rounded-lg p-6 text-center">
          <Bitcoin className="mx-auto h-10 w-10 text-muted-foreground" />
          <div className="mt-3 font-mono text-sm text-muted-foreground">
            Kripto ödeme şu an aktif değil. Yönetici ayarlarını tamamlayınca burası açılacak.
          </div>
        </div>
      ) : (
        <>
          <div className="glass-card corner-cut rounded-lg p-5 neon-glow relative overflow-hidden">
            <div className="absolute inset-0 cyber-grid opacity-20 pointer-events-none" />
            <div className="relative space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-primary/20 p-3">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">ağ</div>
                  <div className="mt-1 font-mono text-sm">TRON (TRC20)</div>
                </div>
                <div className="rounded border border-primary/20 p-3">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">token</div>
                  <div className="mt-1 font-mono text-sm">USDT</div>
                </div>
                <div className="rounded border border-primary/20 p-3">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">güncel kur</div>
                  <div className="mt-1 font-mono text-sm">
                    1 USDT = {rate ? fmt(rate.rate, 2) : "…"} ₺
                    {rate && (
                      <span className="ml-1 text-[10px] text-muted-foreground">({rate.source})</span>
                    )}
                  </div>
                </div>
                <div className="rounded border border-primary/20 p-3">
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">minimum</div>
                  <div className="mt-1 font-mono text-sm">{settings?.min_amount_usdt} USDT</div>
                </div>
              </div>

              <div className="rounded border border-primary/40 bg-background/40 p-3">
                <div className="font-mono text-[10px] uppercase text-muted-foreground">gönderilecek adres (TRC20)</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all font-mono text-sm text-primary">{settings?.trc20_address}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyAddress}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>Cüzdanından bu adrese <b>USDT-TRC20</b> gönder.</li>
                <li>İşlem TRON ağında onaylandıktan sonra <b>tx-hash</b>&#39;i aşağıya yapıştır.</li>
                <li>Otomatik doğrulanır ve bakiyene TL olarak eklenir.</li>
              </ol>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-6 glass-card rounded-lg p-5 space-y-3">
            <label className="block font-mono text-xs text-muted-foreground">
              tx-hash (64 karakter, hex)
            </label>
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="ör: 4a1b...ff"
              className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary"
              maxLength={80}
              required
            />
            <Button type="submit" disabled={busy || !txHash.trim()} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              doğrula ve yükle
            </Button>
          </form>
        </>
      )}

      <div className="mt-8">
        <div className="mb-3 font-mono text-xs text-muted-foreground">$ kripto_yuklemelerim</div>
        {deposits && deposits.length > 0 ? (
          <div className="space-y-2">
            {deposits.map((d) => {
              const s = STATUS[d.status ?? ""] ?? STATUS.pending;
              const Icon = s.icon;
              return (
                <div key={d.id} className="glass-card rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold">{fmt(Number(d.amount_try))} ₺</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        ({d.amount_usdt} USDT @ {d.rate_used})
                      </div>
                    </div>
                    <a
                      href={`https://tronscan.org/#/transaction/${d.tx_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary truncate"
                    >
                      {(d.tx_hash ?? "").slice(0, 12)}…{(d.tx_hash ?? "").slice(-8)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className={`shrink-0 inline-flex items-center gap-1 font-mono text-[11px] ${s.c}`}>
                    <Icon className="h-3 w-3" /> {s.l}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono">henüz kripto yüklemen yok</div>
        )}
      </div>
    </div>
  );
}
