import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAffiliateStats, requestAffiliatePayout } from "@/lib/affiliate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Users, Wallet, Coins, Send } from "lucide-react";

export function AffiliateBlock() {
  const fn = useServerFn(getAffiliateStats);
  const reqFn = useServerFn(requestAffiliatePayout);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["affiliate-stats"], queryFn: () => fn() });
  const [amount, setAmount] = useState(50);
  const [busy, setBusy] = useState(false);

  const totalEarned = data?.totalEarned ?? 0;
  const totalPaid = data?.totalPaid ?? 0;
  const pendingAmt = data?.pending ?? 0;
  const available = Math.max(0, totalEarned - totalPaid - pendingAmt);
  const hasPending = (data?.payouts ?? []).some(
    (p) => p.status === "pending" || p.status === "approved",
  );

  async function submit() {
    if (hasPending) {
      toast.error("Zaten bekleyen bir talebiniz var");
      return;
    }
    if (amount > available) {
      toast.error(`Talep tutarı kazancınızdan fazla. Uygun: ₺${available}`);
      return;
    }
    setBusy(true);
    try {
      await reqFn({ data: { amount } });
      toast.success("Talep alındı, admin onayı bekleniyor");
      qc.invalidateQueries({ queryKey: ["affiliate-stats"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "hata");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Coins} label="Toplam Kazanç" value={`₺${totalEarned}`} />
        <Stat icon={Wallet} label="Ödenen" value={`₺${totalPaid}`} />
        <Stat icon={Send} label="Bekleyen" value={`₺${pendingAmt}`} />
        <Stat icon={Users} label="Davet" value={`${data?.activeReferredCount ?? 0}/${data?.referredCount ?? 0}`} />
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="text-sm font-semibold mb-1">Cüzdana Ödeme Talebi</div>
        <div className="text-[11px] font-mono text-muted-foreground mb-3">
          Talep edilebilir kazanç: <span className="text-primary">₺{available}</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-mono text-muted-foreground">Tutar (min ₺50)</label>
            <Input
              type="number"
              min={50}
              max={available}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={hasPending || available < 50}
            />
          </div>
          <Button
            onClick={submit}
            disabled={busy || amount < 50 || amount > available || hasPending}
            className="sm:self-end"
          >
            Cüzdana aktar
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2 font-mono">
          {hasPending
            ? "Bekleyen bir talebiniz var. Sonuçlanana kadar yeni talep açılamaz."
            : "Onaylandığında tutar doğrudan cüzdanına aktarılır."}
        </div>
      </div>


      <div className="glass-card rounded-xl p-5">
        <div className="text-sm font-semibold mb-3">Geçmiş Talepler</div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(data?.payouts ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground py-4 text-center">henüz talep yok</div>
          )}
          {(data?.payouts ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-xs">
              <div className="min-w-0">
                <div className="font-mono">
                  ₺{Number(p.amount_try).toFixed(2)} · {p.method}
                </div>
                <div className="text-muted-foreground truncate">{p.destination}</div>
                {p.admin_note && <div className="text-muted-foreground mt-1">not: {p.admin_note}</div>}
              </div>
              <div className={`shrink-0 px-2 py-1 rounded font-mono ${statusColor(p.status)}`}>
                {p.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="text-sm font-semibold mb-3">Davet Ettiklerim ({data?.referred.length ?? 0})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {(data?.referred ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/30">
              <span>{r.display_name || r.email || "kullanıcı"}</span>
              <span className="text-muted-foreground font-mono">
                {new Date(r.created_at).toLocaleDateString("tr-TR")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function statusColor(s: string) {
  switch (s) {
    case "paid":
      return "text-primary bg-primary/10 border border-primary/30";
    case "approved":
      return "text-cyan bg-cyan/10 border border-cyan/30";
    case "rejected":
      return "text-destructive bg-destructive/10 border border-destructive/30";
    default:
      return "text-warn bg-warn/10 border border-warn/30";
  }
}
