import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { createTopup, TOPUP_PACKAGES } from "@/lib/wallet.functions";
import { getMyWallet } from "@/lib/wallet-read.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, Plus, ArrowRight, Clock, CheckCircle2, XCircle, ArrowDownLeft, ArrowUpRight, Loader2, Bitcoin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cuzdan")({
  component: WalletPage,
  head: () => ({
    meta: [
      { title: "Cüzdanım — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const TXN_LABEL: Record<string, { l: string; c: string }> = {
  topup: { l: "yükleme", c: "text-primary" },
  purchase: { l: "satın alma", c: "text-cyan" },
  refund: { l: "iade", c: "text-primary" },
  admin_credit: { l: "admin ekleme", c: "text-primary" },
  admin_debit: { l: "admin düşme", c: "text-destructive" },
};

const TOPUP_STATUS: Record<string, { l: string; c: string; bg: string; icon: typeof Clock }> = {
  pending: { l: "havale bekleniyor", c: "text-warn", bg: "bg-warn/10 border-warn/30", icon: Clock },
  reviewing: { l: "inceleniyor", c: "text-cyan", bg: "bg-cyan/10 border-cyan/30", icon: Clock },
  approved: { l: "onaylandı", c: "text-primary", bg: "bg-primary/10 border-primary/30", icon: CheckCircle2 },
  rejected: { l: "reddedildi", c: "text-destructive", bg: "bg-destructive/10 border-destructive/30", icon: XCircle },
};

function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createFn = useServerFn(createTopup);
  const [creating, setCreating] = useState<number | null>(null);

  const walletFn = useServerFn(getMyWallet);
  const { data: walletData } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: () => walletFn(),
    refetchInterval: 6000,
  });

  const wallet = { balance_try: walletData?.balance ?? 0, updated_at: walletData?.updatedAt ?? null };
  const topups = walletData?.topups ?? [];
  const txns = walletData?.txns ?? [];

  async function onCreate(amount: number) {
    setCreating(amount);
    try {
      const res = await createFn({ data: { amount } });
      toast.success(res.reused ? "Açık yükleme talebine yönlendiriliyorsunuz" : "Bakiye yükleme talebi oluşturuldu");
      qc.invalidateQueries({ queryKey: ["topups", user?.id] });
      navigate({ to: "/bakiye-yukle/$topupId", params: { topupId: res.topupId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(null);
    }
  }

  const balance = Number(wallet?.balance_try ?? 0);
  const activeTopup = topups?.find((t) => t.status === "pending" || t.status === "reviewing") ?? null;
  const createBlocked = creating !== null || !!activeTopup;

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 md:py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">$ /cuzdan<span className="terminal-caret" /></div>
          <h1 className="mt-1 text-2xl font-bold neon-text md:text-3xl">cüzdanım</h1>
        </div>
        <Link to="/hesabim" className="font-mono text-xs text-muted-foreground hover:text-primary">
          &larr; hesabım
        </Link>
      </div>

      {/* Bakiye kartı */}
      <div className="glass-card corner-cut rounded-lg p-5 md:p-7 neon-glow-strong relative overflow-hidden">
        <div className="absolute inset-0 cyber-grid opacity-30 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" /> mevcut bakiye
            </div>
            <div className="mt-2 text-4xl md:text-5xl font-bold neon-text-glow font-mono">
              {fmt(balance)} <span className="text-lg text-muted-foreground">TL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Paketler */}
      <div className="mt-6">
        <div className="mb-3 font-mono text-xs text-muted-foreground">$ bakiye_yukle --paket</div>
        {activeTopup && (
          <div className="mb-3 glass-card rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-warn">
                Açık yükleme talebin var: {fmt(Number(activeTopup.amount_try))} TL · {activeTopup.reference_code}
              </div>
              <Link
                to="/bakiye-yukle/$topupId"
                params={{ topupId: activeTopup.id }}
                className="font-mono text-xs text-primary hover:underline"
              >
                devam et &rarr;
              </Link>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TOPUP_PACKAGES.map((amt) => (
            <button
              key={amt}
              onClick={() => onCreate(amt)}
              disabled={createBlocked}
              className="glass-card corner-cut rounded-lg p-4 text-left hover:neon-glow transition disabled:opacity-50"
            >
              <div className="font-mono text-[10px] uppercase text-muted-foreground">paket</div>
              <div className="mt-1 text-2xl font-bold neon-text">{amt}<span className="text-sm text-muted-foreground"> TL</span></div>
              <div className="mt-3 flex items-center gap-1 text-xs text-primary font-mono">
                {creating === amt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                yükle <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>
        <CustomTopupInput onSubmit={onCreate} creating={createBlocked} />
        <Link
          to="/kripto-yukle"
          className="mt-3 glass-card corner-cut rounded-lg p-4 flex items-center justify-between hover:neon-glow transition"
        >
          <div className="flex items-center gap-3">
            <Bitcoin className="h-6 w-6 text-primary" />
            <div>
              <div className="font-mono text-[10px] uppercase text-muted-foreground">alternatif</div>
              <div className="text-sm font-bold neon-text">USDT-TRC20 ile yükle</div>
              <div className="text-[11px] text-muted-foreground">tx-hash ile otomatik onay</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-primary" />
        </Link>
      </div>


      {/* Bekleyen yüklemeler */}
      <div className="mt-8">
        <div className="mb-3 font-mono text-xs text-muted-foreground">$ yukleme_talepleri</div>
        {topups && topups.length > 0 ? (
          <div className="space-y-2">
            {topups.map((t) => {
              const s = TOPUP_STATUS[t.status] ?? TOPUP_STATUS.pending;
              const Icon = s.icon;
              return (
                <div key={t.id} className={`glass-card rounded-lg p-3 flex items-center justify-between gap-3 border ${s.bg}`}>
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground truncate">{t.reference_code}</div>
                    <div className="text-sm font-bold">{fmt(Number(t.amount_try))} TL</div>
                    {t.admin_note && <div className="text-[11px] text-destructive mt-0.5">not: {t.admin_note}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`flex items-center gap-1 font-mono text-[11px] ${s.c}`}>
                      <Icon className="h-3 w-3" /> {s.l}
                    </div>
                    {(t.status === "pending" || t.status === "reviewing") && (
                      <Link
                        to="/bakiye-yukle/$topupId"
                        params={{ topupId: t.id }}
                        className="text-xs font-mono text-primary hover:underline"
                      >
                        devam et &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono">henüz yükleme talebin yok</div>
        )}
      </div>

      {/* Hareketler */}
      <div className="mt-8">
        <div className="mb-3 font-mono text-xs text-muted-foreground">$ hareket_dokumu --limit 30</div>
        {txns && txns.length > 0 ? (
          <div className="space-y-1.5">
            {txns.map((tx) => {
              const info = TXN_LABEL[tx.kind] ?? { l: tx.kind, c: "text-muted-foreground" };
              const amt = Number(tx.amount_try);
              const positive = amt >= 0;
              return (
                <div key={tx.id} className="glass-card rounded-md p-3 flex items-center gap-3">
                  <div className={positive ? "text-primary" : "text-destructive"}>
                    {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{info.l}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {new Date(tx.created_at).toLocaleString("tr-TR")}{tx.note ? ` — ${tx.note}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-mono font-bold ${positive ? "text-primary" : "text-destructive"}`}>
                      {positive ? "+" : ""}{fmt(amt)} TL
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      bakiye: {fmt(Number(tx.balance_after))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono">henüz hareket yok</div>
        )}
      </div>
    </div>
  );
}

function CustomTopupInput({ onSubmit, creating }: { onSubmit: (amount: number) => void; creating: boolean }) {
  const [val, setVal] = useState("");
  const num = Number(val.replace(",", "."));
  const valid = Number.isFinite(num) && num >= 200;

  return (
    <div className="mt-3 glass-card corner-cut rounded-lg p-4">
      <div className="font-mono text-[10px] uppercase text-muted-foreground mb-2">
        özel tutar &middot; minimum 200 ₺, üst sınır yok
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            min={200}
            step="0.01"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="örn. 750"
            className="w-full rounded-md bg-background border border-border pl-3 pr-10 py-2 text-sm font-mono focus:border-primary outline-none"
            disabled={creating}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
            TL
          </span>
        </div>
        <Button
          type="button"
          onClick={() => valid && onSubmit(Math.round(num * 100) / 100)}
          disabled={!valid || creating}
          className="neon-glow"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          yükle
        </Button>
      </div>
      {val && !valid && (
        <div className="mt-1 text-[11px] text-destructive font-mono">
          minimum 200 ₺ giriniz
        </div>
      )}
    </div>
  );
}

