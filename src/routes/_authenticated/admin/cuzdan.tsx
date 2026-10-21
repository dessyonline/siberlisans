import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { approveTopup, rejectTopup, adminAdjustWallet } from "@/lib/wallet.functions";
import { adminListTopups, adminListWallets, adminListWalletTxns } from "@/lib/wallet-read.functions";
import { listUsers } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Wallet, Search, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cuzdan")({
  ssr: false,
  component: AdminWallet,
  head: () => ({ meta: [{ title: "Cüzdan Yönetimi — SiberPHP" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function AdminWallet() {
  const qc = useQueryClient();
  const approveFn = useServerFn(approveTopup);
  const rejectFn = useServerFn(rejectTopup);
  const adjustFn = useServerFn(adminAdjustWallet);

  const topupsFn = useServerFn(adminListTopups);
  const { data: topups } = useQuery({
    queryKey: ["admin-topups"],
    queryFn: () => topupsFn(),
    refetchInterval: 5000,
  });

  const walletsFn = useServerFn(adminListWallets);
  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: () => walletsFn(),
    refetchInterval: 8000,
  });




  const txnsFn = useServerFn(adminListWalletTxns);
  const { data: txns } = useQuery({
    queryKey: ["admin-wallet-txns"],
    queryFn: () => txnsFn(),
    refetchInterval: 10000,
  });
  const [histQ, setHistQ] = useState("");
  const [histKind, setHistKind] = useState("all");
  const histRows = useMemo(() => {
    const q = histQ.toLowerCase().trim();
    return (txns ?? []).filter((x) =>
      (histKind === "all" || x.kind === histKind) &&
      (!q || (x.email ?? "").toLowerCase().includes(q) || x.user_id.startsWith(q) || (x.note ?? "").toLowerCase().includes(q)),
    );
  }, [txns, histQ, histKind]);
  const dupTopups = useMemo(() => {
    const c: Record<string, number> = {};
    (txns ?? []).forEach((x) => { if (x.topup_id) c[x.topup_id] = (c[x.topup_id] ?? 0) + 1; });
    return new Set(Object.keys(c).filter((k) => c[k] > 1));
  }, [txns]);

  const listUsersFn = useServerFn(listUsers);
  const { data: emails } = useQuery({
    queryKey: ["admin-user-emails"],
    queryFn: async () => {
      const users = await listUsersFn();
      const map: Record<string, string> = {};
      (users as { id: string; email: string | null }[] | undefined)?.forEach((u) => {
        if (u.email) map[u.id] = u.email;
      });
      return map;
    },
    staleTime: 60_000,
  });

  async function onApprove(id: string) {
    if (!confirm("Bu yükleme onaylansın mı?")) return;
    try {
      const r = await approveFn({ data: { topupId: id } });
      toast.success(`Onaylandı · yeni bakiye ${fmt(r.balance)} TL`);
      qc.invalidateQueries({ queryKey: ["admin-topups"] });
      qc.invalidateQueries({ queryKey: ["admin-wallets"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  async function onReject(id: string) {
    const note = prompt("Ret sebebi (opsiyonel):") ?? "";
    try {
      await rejectFn({ data: { topupId: id, note } });
      toast.success("Reddedildi");
      qc.invalidateQueries({ queryKey: ["admin-topups"] });
    } catch (e) { toast.error((e as Error).message); }
  }

  const pending = (topups ?? []).filter((t) => t.status === "pending" || t.status === "reviewing");
  const others = (topups ?? []).filter((t) => t.status !== "pending" && t.status !== "reviewing");

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-lg p-4">
        <div className="font-mono text-xs text-muted-foreground">$ /admin/cuzdan<span className="terminal-caret" /></div>
        <h1 className="mt-1 text-2xl font-bold neon-text flex items-center gap-2">
          <Wallet className="h-6 w-6" /> cüzdan yönetimi
        </h1>
      </div>

      {/* Bekleyen yüklemeler */}
      <section className="glass-card rounded-lg p-4">
        <div className="mb-3 font-mono text-xs text-muted-foreground">bekleyen yüklemeler ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="text-sm text-muted-foreground font-mono">bekleyen yükleme yok</div>
        ) : (
          <div className="space-y-2">
            {pending.map((t) => (
              <div key={t.id} className="glass-card rounded-md p-3 flex flex-wrap items-center gap-3 border border-warn/30">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-primary">{t.reference_code}</div>
                  <div className="text-sm">{emails?.[t.user_id] ?? t.user_id.slice(0, 8)}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {new Date(t.created_at ?? Date.now()).toLocaleString("tr-TR")} · {t.status}
                    {t.client_ip ? (
                      <span className="ml-2 text-primary/80">IP: {String(t.client_ip)}{t.ip_country ? ` · ${String(t.ip_country)}` : ""}</span>
                    ) : null}
                    {t.is_vpn ? (
                      <span className="ml-2 rounded bg-destructive/20 text-destructive px-1.5 py-0.5 font-bold">VPN</span>
                    ) : null}
                  </div>
                </div>
                <div className="font-mono text-lg font-bold">{fmt(Number(t.amount_try))} TL</div>
                <Button size="sm" onClick={() => onApprove(t.id)}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> onayla
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onReject(t.id)}>
                  <XCircle className="h-3 w-3 mr-1" /> reddet
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bakiye ayarla */}
      <AdjustPanel emails={emails ?? {}} onDone={() => {
        qc.invalidateQueries({ queryKey: ["admin-wallets"] });
        qc.invalidateQueries({ queryKey: ["admin-wallet-txns"] });
      }} adjustFn={adjustFn} />

      {/* Bakiyeler */}
      <section className="glass-card rounded-lg p-4">
        <div className="mb-3 font-mono text-xs text-muted-foreground">kullanıcı bakiyeleri (top 100)</div>
        <div className="space-y-1">
          {wallets?.map((w) => (
            <div key={w.user_id} className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0">
              <div className="min-w-0">
                <div className="text-sm truncate">{emails?.[w.user_id] ?? w.user_id.slice(0, 8)}</div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  güncellendi: {new Date(w.updated_at ?? Date.now()).toLocaleString("tr-TR")}
                </div>
              </div>
              <div className="font-mono font-bold text-primary">{fmt(Number(w.balance_try))} TL</div>
            </div>
          ))}
        </div>
      </section>

      {/* Geçmiş yüklemeler */}
      <section className="glass-card rounded-lg p-4">
        <div className="mb-3 font-mono text-xs text-muted-foreground">geçmiş yüklemeler</div>
        <div className="space-y-1">
          {others.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
              <div className="font-mono text-[11px] text-muted-foreground">{t.reference_code}</div>
              <div className="text-xs truncate flex-1 mx-2">{emails?.[t.user_id] ?? t.user_id.slice(0, 8)}</div>
              <div className={`text-[11px] font-mono ${t.status === "approved" ? "text-primary" : "text-destructive"}`}>
                {t.status}
              </div>
              <div className="font-mono text-sm">{fmt(Number(t.amount_try))} TL</div>
            </div>
          ))}
        </div>
      </section>

      {/* Tüm bakiye hareketleri */}
      <section className="glass-card rounded-lg p-4">
        <div className="mb-3 font-mono text-xs text-muted-foreground">
          tüm bakiye hareketleri ({histRows.length})
          {dupTopups.size > 0 && (
            <span className="ml-2 text-destructive font-bold">⚠ {dupTopups.size} talep birden fazla kez eklenmiş</span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <Input value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="email / not ara…" />
          <select value={histKind} onChange={(e) => setHistKind(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-2 text-sm font-mono">
            <option value="all">hepsi</option>
            <option value="topup">yükleme</option>
            <option value="adjustment">manuel</option>
            <option value="purchase">satın alma</option>
            <option value="refund">iade</option>
          </select>
        </div>
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {histRows.map((x) => (
            <div key={x.id} className={`flex flex-wrap items-center gap-2 py-1.5 border-b border-border/30 last:border-0 ${x.topup_id && dupTopups.has(x.topup_id) ? "bg-destructive/10" : ""}`}>
              <div className="font-mono text-[10px] text-muted-foreground w-32 shrink-0">
                {x.created_at ? new Date(x.created_at).toLocaleString("tr-TR") : "-"}
              </div>
              <div className="text-xs truncate flex-1 min-w-0">
                {x.email ?? emails?.[x.user_id] ?? x.user_id.slice(0, 8)}
                {x.note ? <span className="text-muted-foreground"> · {x.note}</span> : null}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">{x.kind}</div>
              <div className={`font-mono text-sm w-24 text-right ${x.amount_try >= 0 ? "text-primary" : "text-destructive"}`}>
                {x.amount_try >= 0 ? "+" : ""}{fmt(x.amount_try)}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground w-24 text-right">= {fmt(x.balance_after)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdjustPanel({
  emails,
  adjustFn,
  onDone,
}: {
  emails: Record<string, string>;
  adjustFn: (a: { data: { userId: string; delta: number; note?: string } }) => Promise<{ balance: number }>;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return Object.entries(emails)
      .filter(([id, e]) => e?.toLowerCase().includes(q) || id.startsWith(q))
      .slice(0, 5);
  }, [query, emails]);

  async function run(sign: 1 | -1) {
    const n = parseFloat(amount);
    if (!userId) return toast.error("Kullanıcı seç");
    if (!Number.isFinite(n) || n <= 0) return toast.error("Geçerli tutar gir");
    setBusy(true);
    try {
      const r = await adjustFn({ data: { userId, delta: sign * n, note: note || undefined } });
      toast.success(`Yeni bakiye: ${fmt(r.balance)} TL`);
      setAmount(""); setNote(""); setQuery(""); setUserId("");
      onDone();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="glass-card rounded-lg p-4">
      <div className="mb-3 font-mono text-xs text-muted-foreground">manuel bakiye ekle / çıkar</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-mono text-muted-foreground">kullanıcı (email veya id)</label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setUserId(""); }} className="pl-7" placeholder="ara…" />
          </div>
          {userId && <div className="text-[11px] font-mono text-primary mt-1">seçili: {emails[userId] ?? userId}</div>}
          {!userId && matches.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {matches.map(([id, e]) => (
                <button key={id} onClick={() => { setUserId(id); setQuery(e); }}
                  className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-primary/10">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] font-mono text-muted-foreground">tutar (TL)</label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
        </div>
        <div className="md:col-span-2">
          <label className="text-[11px] font-mono text-muted-foreground">not (opsiyonel)</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="hediye / düzeltme sebebi" rows={2} />
        </div>
        <div className="md:col-span-2 flex gap-2">
          <Button disabled={busy} onClick={() => run(1)} className="flex-1">
            <Plus className="h-3 w-3 mr-1" /> ekle
          </Button>
          <Button disabled={busy} variant="destructive" onClick={() => run(-1)} className="flex-1">
            <Minus className="h-3 w-3 mr-1" /> düş
          </Button>
        </div>
      </div>
    </section>
  );
}
