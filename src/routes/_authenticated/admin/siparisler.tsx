import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveOrder, rejectOrder, adminCancelOrder } from "@/lib/orders.functions";
import { syncUniquelisansOrder, syncAllPendingUniquelisans } from "@/lib/uniquelisans-sync.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Eye, Check, X, ImageIcon, Link2, Search, MessageCircle, Send, Instagram, Copy, Download, CheckSquare, Square, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/siparisler")({
  component: OrdersAdmin,
});

const STATUS: Record<string, string> = {
  pending: "bekliyor",
  reviewing: "inceleniyor",
  approved: "onaylı",
  rejected: "reddedildi",
  cancelled: "iptal",
};

const STATUS_CLS: Record<string, string> = {
  pending: "text-muted-foreground border-border bg-muted/30",
  reviewing: "text-cyan border-cyan/40 bg-cyan/10",
  approved: "text-primary border-primary/40 bg-primary/10",
  rejected: "text-destructive border-destructive/40 bg-destructive/10",
  cancelled: "text-destructive border-destructive/40 bg-destructive/10",
};


type Range = "today" | "7d" | "30d" | "all";

function OrdersAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"reviewing" | "pending" | "approved" | "rejected" | "cancelled" | "all">("reviewing");
  const [range, setRange] = useState<Range>("all");
  const [query, setQuery] = useState("");
  const [onlyWithMessage, setOnlyWithMessage] = useState(false);
  const approveFn = useServerFn(approveOrder);
  const rejectFn = useServerFn(rejectOrder);
  const cancelFn = useServerFn(adminCancelOrder);
  const syncOneFn = useServerFn(syncUniquelisansOrder);
  const syncAllFn = useServerFn(syncAllPendingUniquelisans);

  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, status, price_try, reference_code, receipt_path, admin_note, user_note, checkout_fields, external_order_id, external_delivery_data, external_status, created_at, product:products(name, manual_fulfillment, source), user_id, paid_with")
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((o) => o.user_id).filter(Boolean))) as string[];
      const orderIds = (data ?? []).map((o) => o.id);
      let byId = new Map<string, { email: string | null; display_name: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, email, display_name")
          .in("id", ids);
        byId = new Map((profs ?? []).map((p) => [p.id, { email: p.email, display_name: p.display_name }]));
      }
      let discByOrder = new Map<string, { total: number; codes: string[] }>();
      if (orderIds.length) {
        const { data: discs } = await supabase
          .from("order_discounts")
          .select("order_id, discount_try, code_snapshot")
          .in("order_id", orderIds);
        for (const d of discs ?? []) {
          const key = d.order_id as string;
          const prev = discByOrder.get(key) ?? { total: 0, codes: [] };
          prev.total += Number(d.discount_try ?? 0);
          const label = (d.code_snapshot as string | null) ?? "indirim";
          if (label) prev.codes.push(label);
          discByOrder.set(key, prev);
        }
      }

      return (data ?? []).map((o) => ({
        ...o,
        buyer: (o.user_id && byId.get(o.user_id)) || null,
        discount: discByOrder.get(o.id) ?? null,
      }));
    },
    refetchInterval: 10000,
  });


  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === "today" ? now - 864e5 :
      range === "7d" ? now - 7 * 864e5 :
      range === "30d" ? now - 30 * 864e5 : 0;
    const qlc = query.trim().toLowerCase();
    return (orders ?? []).filter((o) => {
      if (cutoff && new Date(o.created_at).getTime() < cutoff) return false;
      if (onlyWithMessage && !o.user_note) return false;
      if (qlc) {
        const hay = `${o.reference_code} ${o.product?.name ?? ""} ${o.user_note ?? ""}`.toLowerCase();
        if (!hay.includes(qlc)) return false;
      }
      return true;
    });
  }, [orders, range, query, onlyWithMessage]);

  const messageCount = (orders ?? []).filter((o) => !!o.user_note).length;

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const openReceipt = async (path: string) => {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
  };

  const handleApprove = async (id: string) => {
    try {
      await approveFn({ data: { orderId: id } });
      toast.success("Onaylandı, anahtar teslim edildi");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error((e as Error).message); }
  };
  const handleReject = async (id: string) => {
    try {
      await rejectFn({ data: { orderId: id, note } });
      toast.success("Reddedildi");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error((e as Error).message); }
  };
  const handleCancel = async (id: string, ref: string) => {
    if (!confirm(`${ref} siparişini iptal et? Cüzdan ile ödediyse bakiyeye iade edilir, havuz anahtarları serbest bırakılır.`)) return;
    try {
      const res = await cancelFn({ data: { orderId: id, note: note || undefined } });
      const parts: string[] = ["İptal edildi"];
      if (res.refunded_try > 0) parts.push(`₺${res.refunded_try} iade`);
      if (res.released_keys > 0) parts.push(`${res.released_keys} anahtar iade`);
      toast.success(parts.join(" · "));
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error((e as Error).message); }
  };


  const handleSyncOne = async (id: string) => {
    setSyncing(id);
    try {
      const res = await syncOneFn({ data: { orderId: id } });
      if (res.result === "delivered") toast.success(`${res.ref} teslim edildi`);
      else if (res.result === "still_pending") toast.info(`${res.ref} hâlâ pending`);
      else if (res.result === "error") toast.error(`${res.ref}: ${res.message}`);
      else toast.message(`${res.ref}: ${res.reason}`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncing(null); }
  };
  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await syncAllFn({});
      const delivered = res.outcomes.filter((o) => o.result === "delivered").length;
      const pending = res.outcomes.filter((o) => o.result === "still_pending").length;
      const errors = res.outcomes.filter((o) => o.result === "error").length;
      toast.success(`Senkron: ${res.scanned} tarandı · ${delivered} teslim · ${pending} pending · ${errors} hata`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncingAll(false); }
  };

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    toast.success(`${ref} kopyalandı`);
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableIds = useMemo(
    () => filtered.filter((o) => o.status === "reviewing" || o.status === "pending").map((o) => o.id),
    [filtered],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try {
        await approveFn({ data: { orderId: id } });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success(`[✓] ${ok} onaylandı${fail ? ` · ${fail} başarısız` : ""}`);
  };

  const bulkReject = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} siparişi reddetmek istediğine emin misin?`)) return;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try {
        await rejectFn({ data: { orderId: id, note: "toplu red" } });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success(`[✓] ${ok} reddedildi${fail ? ` · ${fail} başarısız` : ""}`);
  };

  const exportCsv = () => {
    const rows = filtered;
    if (rows.length === 0) return toast.error("[!] dışa aktarılacak sipariş yok");
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["referans", "ürün", "durum", "tutar_try", "müşteri_notu", "admin_notu", "tarih"];
    const lines = [header.join(",")];
    for (const o of rows) {
      lines.push(
        [
          esc(o.reference_code),
          esc(o.product?.name ?? ""),
          esc(STATUS[o.status] ?? o.status),
          esc(o.price_try),
          esc(o.user_note ?? ""),
          esc(o.admin_note ?? ""),
          esc(new Date(o.created_at).toISOString()),
        ].join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `siparisler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`[✓] ${rows.length} sipariş CSV olarak indirildi`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">./admin/orders</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight">Siparişler</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-md border border-border bg-input px-3 py-2 font-mono text-xs"
          >
            <option value="reviewing">inceleniyor</option>
            <option value="pending">bekliyor</option>
            <option value="approved">onaylı</option>
            <option value="rejected">reddedildi</option>
            <option value="all">tüm durumlar</option>
          </select>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="rounded-md border border-border bg-input px-3 py-2 font-mono text-xs"
          >
            <option value="today">bugün</option>
            <option value="7d">son 7 gün</option>
            <option value="30d">son 30 gün</option>
            <option value="all">tüm zamanlar</option>
          </select>
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="referans, ürün, mesaj ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 font-mono text-sm"
          />
        </div>
        <button
          onClick={() => setOnlyWithMessage((v) => !v)}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-mono transition ${
            onlyWithMessage
              ? "border-cyan/60 bg-cyan/10 text-cyan"
              : "border-border hover:border-primary/40"
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          mesajlı ({messageCount})
        </button>
        <Button variant="outline" size="sm" onClick={exportCsv} className="font-mono">
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncAll}
          disabled={syncingAll}
          className="font-mono border-cyan/40 text-cyan hover:bg-cyan/10"
          title="Uniquelisans pending siparişlerini yeniden sorgula"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncingAll ? "animate-spin" : ""}`} />
          UL sync
        </Button>
        <div className="text-xs text-muted-foreground font-mono ml-auto">
          {filtered.length} sonuç
        </div>
      </div>

      {selectableIds.length > 0 && (
        <div className="glass-card rounded-xl p-3 flex flex-wrap items-center gap-3 border-primary/30">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-mono hover:border-primary/40"
          >
            {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
            {allSelected ? "tümünü kaldır" : `tümünü seç (${selectableIds.length})`}
          </button>
          <div className="text-xs font-mono text-muted-foreground">
            <span className="text-primary font-semibold">{selected.size}</span> seçili
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              disabled={selected.size === 0 || bulkBusy}
              onClick={bulkApprove}
              className="font-mono"
            >
              <Check className="h-3.5 w-3.5 mr-1" /> toplu onayla
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={selected.size === 0 || bulkBusy}
              onClick={bulkReject}
              className="font-mono"
            >
              <X className="h-3.5 w-3.5 mr-1" /> toplu reddet
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
            bu filtrede sipariş yok
          </div>
        )}
        {filtered.map((o) => {
          const canSelect = o.status === "reviewing" || o.status === "pending";
          const isSel = selected.has(o.id);
          return (
          <div key={o.id} className={`glass-card rounded-xl p-5 transition ${isSel ? "border-primary/60 bg-primary/5" : ""}`}>
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div className="min-w-0 flex-1 flex gap-3">
                {canSelect && (
                  <button
                    onClick={() => toggleOne(o.id)}
                    className="shrink-0 pt-1 text-muted-foreground hover:text-primary"
                    aria-label="seç"
                  >
                    {isSel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base">{o.product?.name}</span>
                  <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_CLS[o.status]}`}>
                    {STATUS[o.status]}
                  </span>
                  {o.product?.manual_fulfillment && (
                    <span className="text-[10px] font-mono rounded-md border border-cyan/40 bg-cyan/10 px-2 py-0.5 text-cyan">
                      manuel
                    </span>
                  )}
                  {o.user_note && (
                    <span className="text-[10px] font-mono rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-warn flex items-center gap-1">
                      <MessageCircle className="h-2.5 w-2.5" /> mesaj
                    </span>
                  )}
                </div>
                <button
                  onClick={() => copyRef(o.reference_code)}
                  className="mt-1 text-xs text-muted-foreground font-mono hover:text-primary flex items-center gap-1 flex-wrap"
                >
                  <Copy className="h-3 w-3" /> {o.reference_code}
                  <span className="mx-1">·</span>
                  {new Date(o.created_at).toLocaleString("tr-TR")}
                  {(o as { buyer?: { email?: string | null; display_name?: string | null } | null }).buyer?.email && (
                    <>
                      <span className="mx-1">·</span>
                      <span className="text-primary/80">
                        {(o as { buyer?: { display_name?: string | null } }).buyer?.display_name
                          ? `${(o as { buyer?: { display_name?: string | null } }).buyer?.display_name} · `
                          : ""}
                        {(o as { buyer?: { email?: string | null } }).buyer?.email}
                      </span>
                    </>
                  )}
                </button>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold text-primary font-mono">
                  ₺{Number(o.price_try).toLocaleString("tr-TR")}
                </div>
              </div>
            </div>

            {o.user_note && (
              <div className="mt-3 rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-sm">
                <div className="text-[10px] font-mono uppercase tracking-wider text-cyan mb-1 flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" /> müşteri mesajı
                </div>
                <div className="text-foreground/90 whitespace-pre-wrap">{o.user_note}</div>
              </div>
            )}
            {o.checkout_fields && Object.keys(o.checkout_fields as object).length > 0 && (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs font-mono">
                <div className="text-[10px] uppercase tracking-wider text-primary mb-1">müşteri bilgileri (API'ye gidecek)</div>
                <ul className="space-y-0.5">
                  {Object.entries(o.checkout_fields as Record<string, string>).map(([k, v]) => (
                    <li key={k}><span className="text-muted-foreground">{k}:</span> <span className="text-foreground/90 break-all">{v}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {o.product?.source === "uniquelisans" && (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] font-mono text-cyan">
                <span>
                  ⚡ Uniquelisans otomatik teslim
                  {o.external_order_id ? ` · ext #${o.external_order_id}` : ""}
                  {o.external_status ? ` · ${o.external_status}` : ""}
                </span>
                {o.external_order_id && o.status !== "approved" && (
                  <button
                    onClick={() => handleSyncOne(o.id)}
                    disabled={syncing === o.id}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan/40 bg-cyan/5 px-2 py-0.5 text-[10px] hover:bg-cyan/10 disabled:opacity-50"
                    title="Uniquelisans'tan durumu yeniden sorgula"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncing === o.id ? "animate-spin" : ""}`} />
                    sync
                  </button>
                )}
              </div>
            )}
            {o.external_delivery_data && (
              <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono break-all">
                <span className="text-muted-foreground">teslim: </span>{o.external_delivery_data}
              </div>
            )}
            {o.admin_note && (
              <div className="mt-2 text-xs text-destructive font-mono">
                red notu: {o.admin_note}
              </div>
            )}


            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  const url = `${window.location.origin}/odeme/${o.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success("ödeme linki kopyalandı");
                }}
              >
                <Link2 className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">ödeme </span>linki
              </Button>
              {o.receipt_path ? (
                <Button size="sm" variant="outline" className="text-xs" onClick={() => openReceipt(o.receipt_path!)}>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  dekont
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> dekont yok
                </span>
              )}
              <a
                href="https://t.me/dessyoffical"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 hover:bg-primary/10 text-primary transition"
              >
                <Send className="h-3 w-3" /> TG
              </a>
              <a
                href="https://ig.me/m/siber.php"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] rounded-md border border-cyan/40 bg-cyan/5 px-2 py-1.5 hover:bg-cyan/10 text-cyan transition"
              >
                <Instagram className="h-3 w-3" /> IG
              </a>
            </div>
            {(o.status === "reviewing" || o.status === "pending") && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button size="sm" onClick={() => handleApprove(o.id)} className="w-full sm:w-auto">
                  <Check className="h-4 w-4 mr-1" />
                  onayla
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="w-full sm:w-auto">
                      <X className="h-4 w-4 mr-1" />
                      reddet
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Siparişi reddet</DialogTitle>
                    </DialogHeader>
                    <Input
                      placeholder="müşteriye gösterilecek not (opsiyonel)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <DialogFooter>
                      <Button variant="destructive" onClick={() => handleReject(o.id)}>
                        reddet
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>

          );
        })}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(v) => !v && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Dekont</DialogTitle></DialogHeader>
          {previewUrl && (
            previewUrl.match(/\.pdf($|\?)/i) ? (
              <iframe src={previewUrl} className="w-full h-[70vh]" />
            ) : (
              <img src={previewUrl} alt="dekont" className="max-h-[70vh] w-auto mx-auto" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
