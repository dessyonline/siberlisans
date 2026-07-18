import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveTopup, rejectTopup, adminAdjustWallet } from "@/lib/wallet.functions";
import { listUsers } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Wallet, Search, Plus, Minus, Eye } from "lucide-react";

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

  const { data: topups } = useQuery({
    queryKey: ["admin-topups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_topups")
        .select("id, user_id, amount_try, reference_code, receipt_path, status, admin_note, created_at, client_ip, user_agent, is_vpn, ip_country")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallets")
        .select("user_id, balance_try, updated_at")
        .order("balance_try", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 8000,
  });




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

  async function openReceipt(path: string) {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

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
                    {new Date(t.created_at).toLocaleString("tr-TR")} · {t.status}
                    {t.client_ip ? (
                      <span className="ml-2 text-primary/80">IP: {String(t.client_ip)}{t.ip_country ? ` · ${String(t.ip_country)}` : ""}</span>
                    ) : null}
                    {t.is_vpn ? (
                      <span className="ml-2 rounded bg-destructive/20 text-destructive px-1.5 py-0.5 font-bold">VPN</span>
                    ) : null}
                  </div>
                </div>
                <div className="font-mono text-lg font-bold">{fmt(Number(t.amount_try))} TL</div>
                {t.receipt_path && (
                  <Button size="sm" variant="outline" onClick={() => openReceipt(t.receipt_path!)}>
                    <Eye className="h-3 w-3 mr-1" /> dekont
                  </Button>
                )}
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
                  güncellendi: {new Date(w.updated_at).toLocaleString("tr-TR")}
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
          {others.slice(0, 50).map((t) => (
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
