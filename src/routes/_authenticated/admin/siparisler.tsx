import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveOrder, rejectOrder } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Eye, Check, X, ImageIcon, Link2, Search, MessageCircle, Send, Instagram, Copy, Download, CheckSquare, Square,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/siparisler")({
  component: OrdersAdmin,
});

const STATUS: Record<string, string> = {
  pending: "bekliyor",
  reviewing: "inceleniyor",
  approved: "onaylı",
  rejected: "reddedildi",
};

const STATUS_CLS: Record<string, string> = {
  pending: "text-muted-foreground border-border bg-muted/30",
  reviewing: "text-cyan border-cyan/40 bg-cyan/10",
  approved: "text-primary border-primary/40 bg-primary/10",
  rejected: "text-destructive border-destructive/40 bg-destructive/10",
};

type Range = "today" | "7d" | "30d" | "all";

function OrdersAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"reviewing" | "pending" | "approved" | "rejected" | "all">("reviewing");
  const [range, setRange] = useState<Range>("all");
  const [query, setQuery] = useState("");
  const [onlyWithMessage, setOnlyWithMessage] = useState(false);
  const approveFn = useServerFn(approveOrder);
  const rejectFn = useServerFn(rejectOrder);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, status, price_try, reference_code, receipt_path, admin_note, user_note, created_at, product:products(name, manual_fulfillment), user_id")
        .order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
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
                  className="mt-1 text-xs text-muted-foreground font-mono hover:text-primary flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" /> {o.reference_code}
                  <span className="mx-1">·</span>
                  {new Date(o.created_at).toLocaleString("tr-TR")}
                </button>
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
            {o.admin_note && (
              <div className="mt-2 text-xs text-destructive font-mono">
                red notu: {o.admin_note}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const url = `${window.location.origin}/odeme/${o.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success("ödeme linki kopyalandı");
                }}
              >
                <Link2 className="h-4 w-4 mr-1" />
                ödeme linki
              </Button>
              {o.receipt_path ? (
                <Button size="sm" variant="outline" onClick={() => openReceipt(o.receipt_path!)}>
                  <Eye className="h-4 w-4 mr-1" />
                  dekont
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> dekont yok
                </span>
              )}
              <a
                href="https://t.me/dessyoffical"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 hover:bg-primary/10 text-primary transition"
              >
                <Send className="h-3.5 w-3.5" /> Telegram
              </a>
              <a
                href="https://ig.me/m/siber.php"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs rounded-md border border-cyan/40 bg-cyan/5 px-2.5 py-1.5 hover:bg-cyan/10 text-cyan transition"
              >
                <Instagram className="h-3.5 w-3.5" /> Instagram
              </a>
              {(o.status === "reviewing" || o.status === "pending") && (
                <>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(o.id)}>
                      <Check className="h-4 w-4 mr-1" />
                      onayla
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive">
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
                </>
              )}
            </div>
          </div>
        ))}
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
