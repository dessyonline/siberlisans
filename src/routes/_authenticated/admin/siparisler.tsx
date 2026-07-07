import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveOrder, rejectOrder } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, Check, X, ImageIcon, Link2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/siparisler")({
  component: OrdersAdmin,
});

const STATUS: Record<string, string> = {
  pending: "bekliyor",
  reviewing: "inceleniyor",
  approved: "onaylı",
  rejected: "reddedildi",
};

function OrdersAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"reviewing" | "pending" | "approved" | "rejected" | "all">("reviewing");
  const approveFn = useServerFn(approveOrder);
  const rejectFn = useServerFn(rejectOrder);
  const [note, setNote] = useState("");

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl neon-text">Siparişler</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded border border-border bg-input px-3 py-1 font-mono text-sm"
        >
          <option value="reviewing">inceleniyor</option>
          <option value="pending">bekliyor</option>
          <option value="approved">onaylı</option>
          <option value="rejected">reddedildi</option>
          <option value="all">tümü</option>
        </select>
      </div>

      <div className="mt-6 space-y-3">
        {(orders ?? []).length === 0 && (
          <div className="glass-card rounded-lg p-8 text-center font-mono text-muted-foreground">
            bu filtrede sipariş yok
          </div>
        )}
        {(orders ?? []).map((o) => (
          <div key={o.id} className="glass-card rounded-lg p-4 font-mono text-sm">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <div className="font-semibold">{o.product?.name}</div>
                <div className="text-xs text-muted-foreground">ref: {o.reference_code} · {new Date(o.created_at).toLocaleString("tr-TR")}</div>
              </div>
              <div className="text-xs uppercase text-cyan">{STATUS[o.status]}</div>
              <div className="neon-text">₺{Number(o.price_try).toLocaleString("tr-TR")}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="ghost"
                  title="ödeme sayfası linkini kopyala"
                  onClick={() => {
                    const url = `${window.location.origin}/odeme/${o.id}`;
                    navigator.clipboard.writeText(url);
                    toast.success("ödeme linki kopyalandı");
                  }}
                >
                  <Link2 className="h-4 w-4 mr-1" />ödeme linki
                </Button>
                {o.receipt_path ? (
                  <Button size="sm" variant="outline" onClick={() => openReceipt(o.receipt_path!)}>
                    <Eye className="h-4 w-4 mr-1" />dekont
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" /> dekont yok
                  </span>
                )}
                {(o.status === "reviewing" || o.status === "pending") && (
                  <>
                    <Button size="sm" onClick={() => handleApprove(o.id)}>
                      <Check className="h-4 w-4 mr-1" />onayla
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          <X className="h-4 w-4 mr-1" />reddet
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Siparişi reddet</DialogTitle>
                        </DialogHeader>
                        <Input
                          placeholder="not (opsiyonel)"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                        <DialogFooter>
                          <Button variant="destructive" onClick={() => handleReject(o.id)}>reddet</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            </div>
            {o.admin_note && (
              <div className="mt-2 text-xs text-destructive">not: {o.admin_note}</div>
            )}
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
