import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getOrderDetail,
  setOrderAdminNote,
  manualDeliverOrder,
  partialRefundOrder,
  changeOrderProduct,
  messageOrderCustomer,
  listProductOptions,
} from "@/lib/admin-orders.functions";
import { STATUS_CLS, STATUS_LABEL } from "./OrdersTable";
import { Copy, Eye, KeyRound, Wallet, Send, Repeat } from "lucide-react";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className="text-sm text-right break-all">{v}</span>
    </div>
  );
}

export function OrderDetailDrawer({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getOrderDetail);
  const noteFn = useServerFn(setOrderAdminNote);
  const deliverFn = useServerFn(manualDeliverOrder);
  const refundFn = useServerFn(partialRefundOrder);
  const changeFn = useServerFn(changeOrderProduct);
  const msgFn = useServerFn(messageOrderCustomer);
  const productsFn = useServerFn(listProductOptions);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-order-detail", orderId],
    queryFn: () => detailFn({ data: { orderId: orderId as string } }),
    enabled: !!orderId,
  });

  const { data: products } = useQuery({
    queryKey: ["admin-product-options"],
    queryFn: () => productsFn(),
    enabled: !!orderId,
    staleTime: 5 * 60_000,
  });

  const [adminNote, setAdminNote] = useState<string | null>(null);
  const [payload, setPayload] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const o = data?.order;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-order-detail", orderId] });
    onChanged();
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = async (path: string) => {
    if (/^https:\/\//i.test(path)) setReceiptUrl(path);
    else toast.error("Bu eski dekont artık erişilebilir değil");
  };

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("kopyalandı");
  };

  return (
    <Sheet open={!!orderId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-base">
            {o ? o.reference_code : "sipariş"}
            {o && (
              <span className={`ml-2 text-[10px] uppercase px-2 py-0.5 rounded-md border ${STATUS_CLS[o.status] ?? ""}`}>
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {isLoading && <div className="py-10 text-center text-muted-foreground font-mono text-xs">yükleniyor…</div>}

        {data && o && (
          <Tabs defaultValue="ozet" className="mt-4">
            <TabsList className="grid grid-cols-4 font-mono text-[10px]">
              <TabsTrigger value="ozet">özet</TabsTrigger>
              <TabsTrigger value="musteri">müşteri</TabsTrigger>
              <TabsTrigger value="teslim">teslim</TabsTrigger>
              <TabsTrigger value="islem">işlem</TabsTrigger>
            </TabsList>

            <TabsContent value="ozet" className="space-y-4 pt-4">
              <div className="glass-card rounded-xl p-4">
                <Row k="ürün" v={data.product?.name ?? "—"} />
                <Row k="liste fiyatı" v={`₺${o.price_try.toLocaleString("tr-TR")}`} />
                {data.discounts.map((d) => (
                  <Row key={d.code} k={`indirim · ${d.code}`} v={`−₺${d.amount.toLocaleString("tr-TR")}`} />
                ))}
                <Row
                  k="ödenen"
                  v={
                    <span className="text-primary font-semibold font-mono">
                      ₺{Math.max(0, o.price_try - data.discounts.reduce((s, d) => s + d.amount, 0)).toLocaleString("tr-TR")}
                    </span>
                  }
                />
                <Row k="ödeme yöntemi" v={o.paid_with ?? "—"} />
                <Row k="oluşturma" v={new Date(o.created_at).toLocaleString("tr-TR")} />
                <Row k="onay" v={o.approved_at ? new Date(o.approved_at).toLocaleString("tr-TR") : "—"} />
                <Row k="ip" v={o.client_ip ?? "—"} />
                {o.external_order_id && <Row k="dış sipariş" v={`#${o.external_order_id} · ${o.external_status ?? ""}`} />}
              </div>

              {o.receipt_path && (
                <Button variant="outline" size="sm" className="font-mono" onClick={() => openReceipt(o.receipt_path as string)}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> dekontu gör
                </Button>
              )}

              {o.user_note && (
                <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-sm">
                  <div className="text-[10px] font-mono uppercase text-cyan mb-1">müşteri mesajı</div>
                  {o.user_note}
                </div>
              )}

              {o.checkout_fields && Object.keys(o.checkout_fields).length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs font-mono">
                  <div className="text-[10px] uppercase text-primary mb-1">checkout bilgileri</div>
                  {Object.entries(o.checkout_fields).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">admin notu</div>
                <Textarea
                  value={adminNote ?? o.admin_note ?? ""}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  className="mt-2 font-mono"
                  disabled={busy}
                  onClick={() => run(() => noteFn({ data: { orderId: o.id, note: adminNote ?? o.admin_note ?? "" } }), "not kaydedildi")}
                >
                  notu kaydet
                </Button>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">zaman çizelgesi</div>
                <div className="space-y-2 border-l border-border pl-3">
                  <div className="text-xs font-mono">
                    <span className="text-primary">●</span> sipariş oluşturuldu ·{" "}
                    {new Date(o.created_at).toLocaleString("tr-TR")}
                  </div>
                  {data.transactions.map((t, i) => (
                    <div key={i} className="text-xs font-mono text-muted-foreground">
                      <span className="text-cyan">●</span> {t.kind} ₺{t.amount_try.toLocaleString("tr-TR")} ·{" "}
                      {new Date(t.created_at).toLocaleString("tr-TR")}
                    </div>
                  ))}
                  {data.audit.map((a, i) => (
                    <div key={i} className="text-xs font-mono text-muted-foreground">
                      <span className="text-warn">●</span> {a.action} · {a.actor_email ?? "sistem"} ·{" "}
                      {new Date(a.created_at).toLocaleString("tr-TR")}
                    </div>
                  ))}
                  {o.approved_at && (
                    <div className="text-xs font-mono text-primary">
                      ● onaylandı · {new Date(o.approved_at).toLocaleString("tr-TR")}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="musteri" className="space-y-3 pt-4">
              {data.customer ? (
                <>
                  <div className="glass-card rounded-xl p-4">
                    <Row k="ad" v={data.customer.display_name ?? "—"} />
                    <Row k="e-posta" v={data.customer.email ?? "—"} />
                    <Row k="cüzdan" v={`₺${data.customer.balance_try.toLocaleString("tr-TR")}`} />
                    <Row k="seviye" v={`${data.customer.tier ?? "—"} · ${data.customer.total_points} puan`} />
                    <Row k="sipariş" v={`${data.customer.order_count} adet`} />
                    <Row k="toplam harcama" v={`₺${data.customer.total_spent.toLocaleString("tr-TR")}`} />
                    <Row k="kayıt" v={new Date(data.customer.created_at).toLocaleDateString("tr-TR")} />
                  </div>
                  {data.customer.order_count <= 1 && (
                    <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs font-mono text-warn">
                      ⚠ ilk sipariş — dekont ve kimlik doğrulamasına dikkat
                    </div>
                  )}
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">son siparişler</div>
                  {data.customer.recent_orders.map((r) => (
                    <div key={r.id} className="flex items-center justify-between font-mono text-xs glass-card rounded-lg p-2">
                      <span>{r.reference_code}</span>
                      <span className="text-muted-foreground">{STATUS_LABEL[r.status] ?? r.status}</span>
                      <span className="text-primary">₺{r.price_try.toLocaleString("tr-TR")}</span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-muted-foreground text-sm">müşteri kaydı yok</div>
              )}
            </TabsContent>

            <TabsContent value="teslim" className="space-y-3 pt-4">
              {data.keys.length === 0 && !o.external_delivery_data && (
                <div className="text-muted-foreground text-sm">henüz teslim edilmiş içerik yok</div>
              )}
              {data.keys.map((k, i) => (
                <div key={i} className="glass-card rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    <code className="font-mono text-xs break-all flex-1">{k.key?.key_value ?? "—"}</code>
                    {k.key?.key_value && (
                      <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => copy(k.key!.key_value)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {k.key?.status} · {k.key?.expires_at ? `bitiş ${new Date(k.key.expires_at).toLocaleDateString("tr-TR")}` : "ömür boyu"}
                    {k.key?.hwid ? ` · hwid ${k.key.hwid.slice(0, 10)}…` : ""}
                    {k.delivered_at ? ` · teslim ${new Date(k.delivered_at).toLocaleString("tr-TR")}` : ""}
                  </div>
                </div>
              ))}
              {o.external_delivery_data && (
                <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] font-mono break-all">
                  <span className="text-muted-foreground">dış teslim: </span>
                  {o.external_delivery_data}
                </div>
              )}
            </TabsContent>

            <TabsContent value="islem" className="space-y-5 pt-4">
              <div className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs text-primary">
                  <KeyRound className="h-3.5 w-3.5" /> manuel teslim
                </div>
                <Textarea
                  placeholder="anahtar / mail:şifre / link"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                />
                <Input
                  placeholder="süre (gün) — boş bırakılırsa ömür boyu"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value.replace(/\D/g, ""))}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  className="font-mono"
                  disabled={busy || !payload.trim()}
                  onClick={() =>
                    run(async () => {
                      await deliverFn({
                        data: {
                          orderId: o.id,
                          payload: payload.trim(),
                          durationDays: durationDays ? Number(durationDays) : null,
                        },
                      });
                      setPayload("");
                      setDurationDays("");
                    }, "manuel teslim yapıldı")
                  }
                >
                  teslim et ve onayla
                </Button>
              </div>

              <div className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs text-cyan">
                  <Wallet className="h-3.5 w-3.5" /> kısmi iade
                </div>
                <Input
                  placeholder="iade tutarı (₺)"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono"
                  disabled={busy || !refundAmount}
                  onClick={() =>
                    run(async () => {
                      const res = await refundFn({ data: { orderId: o.id, amount: Number(refundAmount) } });
                      setRefundAmount("");
                      toast.message(`kalan iade edilebilir: ₺${res.remaining_refundable}`);
                    }, "iade cüzdana yansıtıldı")
                  }
                >
                  cüzdana iade et
                </Button>
              </div>

              <div className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs text-warn">
                  <Repeat className="h-3.5 w-3.5" /> ürün değiştir
                </div>
                <select
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-xs"
                >
                  <option value="">ürün seç…</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ₺{p.price_try}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="font-mono"
                  disabled={busy || !newProduct}
                  onClick={() =>
                    run(async () => {
                      const res = await changeFn({ data: { orderId: o.id, productId: newProduct } });
                      setNewProduct("");
                      if (res.wallet_delta) toast.message(`cüzdan farkı: ₺${res.wallet_delta}`);
                    }, "sipariş ürünü değiştirildi")
                  }
                >
                  ürünü taşı
                </Button>
              </div>

              <div className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs text-primary">
                  <Send className="h-3.5 w-3.5" /> müşteriye mesaj
                </div>
                <Input
                  placeholder="başlık"
                  value={msgTitle}
                  onChange={(e) => setMsgTitle(e.target.value)}
                  className="font-mono text-xs"
                />
                <Textarea
                  placeholder="mesaj"
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  className="font-mono"
                  disabled={busy || !msgTitle.trim() || !msgBody.trim()}
                  onClick={() =>
                    run(async () => {
                      await msgFn({ data: { orderId: o.id, title: msgTitle.trim(), body: msgBody.trim() } });
                      setMsgTitle("");
                      setMsgBody("");
                    }, "bildirim gönderildi")
                  }
                >
                  gönder
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {receiptUrl && (
          <div className="mt-4">
            {receiptUrl.match(/\.pdf($|\?)/i) ? (
              <iframe src={receiptUrl} title="dekont" className="w-full h-[60vh] rounded-lg" />
            ) : (
              <img src={receiptUrl} alt="dekont" className="w-full rounded-lg" />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
