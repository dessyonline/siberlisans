import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getCryptoSettings,
  updateCryptoSettings,
  adminListCryptoDeposits,
} from "@/lib/crypto.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/kripto")({
  component: AdminCryptoPage,
  ssr: false,
  head: () => ({ meta: [{ title: "Kripto — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function fmt(n: number, d = 2) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

function AdminCryptoPage() {
  const qc = useQueryClient();
  const settingsFn = useServerFn(getCryptoSettings);
  const saveFn = useServerFn(updateCryptoSettings);
  const listFn = useServerFn(adminListCryptoDeposits);

  const { data: settings } = useQuery({ queryKey: ["admin-crypto-settings"], queryFn: () => settingsFn() });
  const { data: deposits } = useQuery({ queryKey: ["admin-crypto-deposits"], queryFn: () => listFn() });

  const [addr, setAddr] = useState("");
  const [rate, setRate] = useState<string>("");
  const [min, setMin] = useState<string>("5");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setAddr(settings.trc20_address ?? "");
    setRate(settings.usdt_try_rate == null ? "" : String(settings.usdt_try_rate));
    setMin(String(settings.min_amount_usdt ?? 5));
    setEnabled(!!settings.enabled);
  }, [settings]);

  async function save() {
    setBusy(true);
    try {
      await saveFn({
        data: {
          trc20_address: addr.trim(),
          usdt_try_rate: rate.trim() === "" ? null : Number(rate),
          min_amount_usdt: Number(min),
          enabled,
        },
      });
      toast.success("Kripto ayarları kaydedildi");
      qc.invalidateQueries({ queryKey: ["admin-crypto-settings"] });
      qc.invalidateQueries({ queryKey: ["crypto-settings"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-muted-foreground">$ /admin/kripto<span className="terminal-caret" /></div>
        <h1 className="mt-1 text-xl font-bold neon-text md:text-2xl">Kripto (USDT-TRC20)</h1>
      </div>

      <div className="glass-card corner-cut rounded-lg p-5 space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Kripto yükleme <b>{enabled ? "aktif" : "kapalı"}</b></span>
        </label>

        <div>
          <label className="block font-mono text-xs text-muted-foreground mb-1">TRC20 alıcı adresi</label>
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="T..."
            className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block font-mono text-xs text-muted-foreground mb-1">
              Sabit USDT/TRY kuru (boş → Binance canlı)
            </label>
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="örn: 41.20"
              className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-muted-foreground mb-1">Minimum USDT</label>
            <input
              type="number"
              step="0.1"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>

        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          kaydet
        </Button>
      </div>

      <div>
        <div className="mb-3 font-mono text-xs text-muted-foreground">$ son_yuklemeler</div>
        {deposits && deposits.length > 0 ? (
          <div className="space-y-2">
            {deposits.map((d) => (
              <div key={d.id} className="glass-card rounded-lg p-3 text-sm flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <div className="font-bold">{fmt(Number(d.amount_try))} ₺ · {d.amount_usdt} USDT @ {d.rate_used}</div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">user: {d.user_id}</div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">from: {d.from_address ?? "—"}</div>
                </div>
                <a
                  href={`https://tronscan.org/#/transaction/${d.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                >
                  tronscan <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono">henüz kripto yükleme yok</div>
        )}
      </div>
    </div>
  );
}
