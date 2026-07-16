import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { markOrderPaid, setOrderUserNote, applyPromoCode, removePromoCode, finalizeFreeOrder, setOrderCheckoutFields, addItemToOrder, removeItemFromOrder, cancelPendingOrder } from "@/lib/orders.functions";
import { payOrderWithWallet } from "@/lib/wallet.functions";
import { MfaGateDialog } from "@/components/security/MfaGateDialog";
import { Input } from "@/components/ui/input";

import { DeliveryPayload, type DeliveryType } from "@/components/DeliveryPayload";
import { PointsBlock } from "@/components/PointsBlock";
import enparaQr from "@/assets/enpara-qr.png";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-store";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Wifi,
  Terminal,
  KeyRound,
  UploadCloud,
  ArrowRight,
  Lock,
  Instagram,
  Send,
  MessageCircle,
  Hourglass,
  FileCheck2,
  PackageCheck,
  Sparkles,
  Ticket,
  Tag,
  Crown,
  Trash2,
  X,
} from "lucide-react";


export const Route = createFileRoute("/odeme/$orderId")({
  component: Payment,
});

type StepKey = "init" | "payment" | "delivery";

const STEPS: { key: StepKey; label: string; sub: string }[] = [
  { key: "init", label: "yöntem seç", sub: "bakiye / shopier" },
  { key: "payment", label: "onayla", sub: "ödemeyi tamamla" },
  { key: "delivery", label: "teslim", sub: "lisansını al" },
];


// Ödeme (pending) için maksimum süre — dolarsa kullanıcı sayfadan atılır
const PAYMENT_WINDOW_SEC = 3 * 60;

function Payment() {
  const { orderId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const markPaidFn = useServerFn(markOrderPaid);
  const finalizeFreeFn = useServerFn(finalizeFreeOrder);
  const setFieldsFn = useServerFn(setOrderCheckoutFields);

  const payWithWalletFn = useServerFn(payOrderWithWallet);
  const removeItemFn = useServerFn(removeItemFromOrder);
  const cancelOrderFn = useServerFn(cancelPendingOrder);
  const [payingWallet, setPayingWallet] = useState(false);
  const [mfaGateOpen, setMfaGateOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm("Bu ürünü siparişten çıkarmak istediğine emin misin?")) return;
    setRemovingItemId(itemId);
    try {
      const res = await removeItemFn({ data: { orderId, itemId } });
      if (res.itemsLeft === 0) {
        toast.success("Sipariş iptal edildi");
        navigate({ to: "/urunler" });
        return;
      }
      toast.success("Ürün çıkarıldı");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemovingItemId(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!confirm("Siparişi iptal etmek istediğine emin misin? Bu işlem geri alınamaz.")) return;
    setCancelling(true);
    try {
      await cancelOrderFn({ data: { orderId } });
      toast.success("Sipariş iptal edildi");
      navigate({ to: "/urunler" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCancelling(false);
    }
  };


  const runWalletPay = async () => {
    setPayingWallet(true);
    try {
      const res = await payWithWalletFn({ data: { orderId } });
      if (!res.ok) {
        toast.error(res.error ?? "Ödeme başarısız");
      } else {
        toast.success("Ödeme başarılı · ürün teslim edildi");
        qc.invalidateQueries({ queryKey: ["order", orderId] });
        qc.invalidateQueries({ queryKey: ["wallet", user?.id] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPayingWallet(false);
    }
  };

  const startWalletPay = async () => {
    // 2FA aktifse önce doğrulama iste — ancak kullanıcı bu cihazı hatırla dediyse atla
    const { isDeviceTrusted } = await import("@/lib/trusted-device");
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      aal?.nextLevel === "aal2" &&
      aal.currentLevel === "aal1" &&
      !isDeviceTrusted(user?.id)
    ) {
      setMfaGateOpen(true);
      return;
    }
    await runWalletPay();
  };


  const { data: order } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, product_id, status, price_try, reference_code, receipt_path, user_note, checkout_fields, created_at, updated_at, approved_at, product:products(name, slug, duration, image_url, delivery_type, manual_fulfillment, unlimited_stock, tier, source, required_fields, shopier_url, requires_email, category), items:order_items(id, product_id, quantity, unit_price_try, product_name_snapshot, product:products(name, slug, image_url, duration, delivery_type, manual_fulfillment, unlimited_stock, shopier_url, requires_email, category)), keys:order_keys(license_key:license_keys(key_value, activation_token, product:products(name, delivery_type))), discount:order_discounts(product_id, discount_try, code_snapshot)"
        )
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 4000,
  });


  const { data: bank } = useQuery({
    queryKey: ["bank", "active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("wallets")
        .select("balance_try")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ?? { balance_try: 0 };
    },
    refetchInterval: 6000,
  });

  const currentStep: StepKey = useMemo(() => {
    if (!order) return "init";
    if (order.status === "approved") return "delivery";
    return "payment";
  }, [order]);


  // Ödeme penceresi sayacı geçici olarak devre dışı — kullanıcı bildirimden
  // geri dönüp siparişi tamamlayabilsin diye pending siparişler otomatik iptal edilmiyor.
  const createdMs = order?.created_at ? new Date(order.created_at).getTime() : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  void createdMs; void nowMs;
  const secondsLeft = PAYMENT_WINDOW_SEC;
  const expired = false;
  void expired;


  const handleFile = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Dosya 5MB'ı aşamaz");
    setUploading(true);
    try {
      // Sanitize filename: Supabase Storage keys allow only a limited ascii set.
      const dot = file.name.lastIndexOf(".");
      const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) : "bin";
      const safeExt = ext || "bin";
      const path = `${user.id}/${orderId}-${Date.now()}.${safeExt}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw error;
      await markPaidFn({ data: { orderId, receiptPath: path } });
      toast.success("Dekont alındı · doğrulama başlatıldı");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (e) {
      toast.error((e as Error).message || "Dekont yüklenemedi");
    } finally {
      setUploading(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center font-mono">
        <p>Bu sayfayı görüntülemek için giriş yapmalısın.</p>
        <Button asChild className="mt-4">
          <Link to="/auth">giriş</Link>
        </Button>
      </div>
    );
  }
  if (!order) return <div className="p-12 font-mono text-center">yükleniyor…</div>;

  const orderItems = (order.items ?? []) as Array<{
    id: string;
    product_id: string | null;
    quantity: number;
    unit_price_try: number;
    product_name_snapshot: string;
    product: { name: string; slug?: string | null; image_url?: string | null; duration?: string | null; delivery_type: string; manual_fulfillment: boolean; unlimited_stock: boolean } | null;
  }>;
  const isCartOrder = orderItems.length > 0;
  const deliveredKeys = (order.keys ?? [])
    .map((k) => k.license_key)
    .filter((k): k is NonNullable<typeof k> => !!k?.key_value);
  // Effective delivery flags: cart order → derive from items
  const effectiveProduct = order.product ?? (isCartOrder ? orderItems[0].product : null);
  const deliveryType = (effectiveProduct?.delivery_type ?? "key") as DeliveryType;
  const isManual = isCartOrder
    ? orderItems.some((i) => i.product?.manual_fulfillment)
    : !!order.product?.manual_fulfillment;
  const isUnlimited = isCartOrder
    ? orderItems.some((i) => i.product?.unlimited_stock)
    : !!(order.product as { unlimited_stock?: boolean } | null)?.unlimited_stock;
  const isEpic = ((order.product as { tier?: string } | null)?.tier ?? "standard") === "epic";
  const needsManualContact =
    order.status === "approved" && deliveredKeys.length === 0 && (isManual || isUnlimited);
  const orderTitle = order.product?.name ?? `Sepet siparişi · ${orderItems.length} ürün`;
  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const discountRows = (Array.isArray(order.discount) ? order.discount : (order.discount ? [order.discount] : [])) as Array<{
    product_id?: string | null;
    discount_try?: number | null;
    code_snapshot?: string | null;
  }>;
  const discountsByProduct = discountRows.reduce<Record<string, number>>((acc, d) => {
    if (!d.product_id) return acc;
    acc[d.product_id] = (acc[d.product_id] ?? 0) + Number(d.discount_try ?? 0);
    return acc;
  }, {});

  // Uniquelisans kaynaklı ürünler: müşteri gerekli bilgileri girmezse admin API'den satın alamaz
  const productSource = (order.product as { source?: string | null } | null)?.source ?? null;
  const baseRequiredFields = ((order.product as { required_fields?: unknown } | null)?.required_fields ?? []) as Array<{
    name: string; el_type?: string; input_type?: string; required?: boolean;
  }>;
  // Ürünlerden herhangi biri "mail tanımlı" ise checkout'ta e-posta iste
  const requiresEmail = isCartOrder
    ? orderItems.some((i) => (i.product as { requires_email?: boolean } | null)?.requires_email)
    : !!(order.product as { requires_email?: boolean } | null)?.requires_email;
  const emailFieldMerged: Array<{ name: string; el_type?: string; input_type?: string; required?: boolean }> =
    requiresEmail && !baseRequiredFields.some((f) => f.name === "license_email")
      ? [{ name: "license_email", input_type: "email", required: true }, ...baseRequiredFields]
      : baseRequiredFields;
  const requiredFields = emailFieldMerged;
  const needsCheckoutFields =
    (productSource === "uniquelisans" || requiresEmail) &&
    Array.isArray(requiredFields) && requiredFields.length > 0;



  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">
      {isEpic && (
        <div className="relative mb-3 overflow-hidden rounded-lg epic-card">
          <div className="epic-shimmer" aria-hidden />
          <div className="relative flex items-center justify-center gap-2 py-2 font-mono text-[11px] uppercase tracking-[0.4em] text-[oklch(0.92_0.14_85)] epic-text-glow">
            <Crown className="h-3.5 w-3.5" />
            destansı sipariş · epic tier
            <Sparkles className="h-3.5 w-3.5" />
          </div>
        </div>
      )}
      {/* Header bar — terminal window */}
      <div className={`rounded-t-lg border-b-0 px-3 py-2 flex items-center gap-2 font-mono text-xs ${isEpic ? "epic-card" : "glass-card"}`}>
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/80 shrink-0" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/80 shrink-0" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/80 shrink-0" />
        <span className="ml-2 text-muted-foreground truncate min-w-0 flex-1">
          siberphp@secure:~/orders/{orderId.slice(0, 8)}
        </span>
        <span className="hidden sm:flex items-center gap-1.5 text-primary shrink-0">
          <Wifi className="h-3 w-3" /> TLS 1.3 · AES-256
        </span>
        <span className="sm:hidden flex items-center gap-1 text-primary shrink-0">
          <Wifi className="h-3 w-3" /> TLS
        </span>
      </div>

      {/* Stepper rail */}
      <div className="glass-card rounded-b-lg rounded-t-none p-3 sm:p-5 scan-line">
        <ol className="flex items-stretch gap-1.5 sm:gap-3">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || order.status === "approved";
            const active = i === stepIndex && order.status !== "approved";
            return (
              <li key={s.key} className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
                <div
                  className={`relative flex-1 min-w-0 rounded-md border p-2 sm:p-3 font-mono transition-all ${
                    active
                      ? "border-primary/70 bg-primary/10 neon-glow"
                      : done
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-1 sm:gap-2 text-[9px] sm:text-[10px] tracking-widest text-muted-foreground">
                    <span className={active ? "text-primary" : ""}>[{String(i + 1).padStart(2, "0")}/03]</span>
                    {done && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                    {active && (
                      <span className="ml-auto flex items-center gap-1 text-primary text-[9px] uppercase">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="hidden sm:inline">canlı</span>
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 text-[11px] sm:text-sm break-words ${active ? "neon-text font-semibold" : done ? "text-primary" : ""}`}>
                    ./{s.label}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 break-words">{s.sub}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight
                    className={`h-3 w-3 sm:h-4 sm:w-4 shrink-0 ${done ? "text-primary" : "text-border/60"}`}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {needsCheckoutFields && (
        <CheckoutFieldsCard
          orderId={orderId}
          fields={requiredFields}
          initial={(order.checkout_fields ?? {}) as Record<string, string>}
          saved={!!order.checkout_fields && Object.keys((order.checkout_fields ?? {}) as object).length > 0}
          onSave={async (values) => {
            await setFieldsFn({ data: { orderId, fields: values } });
            toast.success("Bilgiler kaydedildi");
            qc.invalidateQueries({ queryKey: ["order", orderId] });
          }}
        />
      )}

      {(order.status === "pending" || order.status === "reviewing") && (
        <CrossSellOffer
          orderId={orderId}
          orderStatus={order.status}
          categories={
            isCartOrder
              ? (orderItems
                  .map((i) => (i.product as { category?: string | null } | null)?.category ?? null)
                  .filter(Boolean) as string[])
              : [
                  ((order.product as { category?: string | null } | null)?.category ?? null),
                ].filter(Boolean) as string[]
          }
          excludeSlugs={
            isCartOrder
              ? (orderItems
                  .map((i) => (i.product as { slug?: string | null } | null)?.slug ?? null)
                  .filter(Boolean) as string[])
              : [((order.product as { slug?: string | null } | null)?.slug ?? null)].filter(Boolean) as string[]
          }
        />
      )}





      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* MAIN CONTENT */}
        <div className="space-y-6">
          {/* satın alınan ürün(ler) — çapraz satış kartı gibi */}
          {(isCartOrder || order.product) && (
            <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5 neon-glow">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] tracking-widest text-primary uppercase flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> satın aldığınız {isCartOrder ? `· ${orderItems.length} kalem` : "ürün"}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  #{order.reference_code}
                </div>
              </div>
              <div className="divide-y divide-primary/15">
                {(isCartOrder
                  ? orderItems.map((it) => ({
                      id: it.id,
                      productId: it.product_id,
                      name: it.product_name_snapshot,
                      slug: it.product?.slug ?? null,
                      image: it.product?.image_url ?? null,
                      duration: it.product?.duration ?? null,
                      unit: Number(it.unit_price_try),
                      qty: it.quantity,
                    }))
                  : [{
                      id: order.product!.slug,
                      productId: (order as { product_id?: string | null }).product_id ?? null,
                      name: order.product!.name,
                      slug: (order.product as { slug?: string | null }).slug ?? null,
                      image: (order.product as { image_url?: string | null }).image_url ?? null,
                      duration: (order.product as { duration?: string | null }).duration ?? null,
                      unit: Number(order.price_try),
                      qty: 1,
                    }]
                ).map((it) => {
                  const itemOriginal = it.unit * it.qty;
                  const itemDiscount = it.productId ? (discountsByProduct[it.productId] ?? 0) : 0;
                  const itemFinal = Math.max(0, itemOriginal - itemDiscount);
                  return (
                  <div key={it.id} className="flex items-center gap-3 py-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-primary/30 bg-background/40">
                      {it.image ? (
                        <img src={it.image} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-mono text-[10px] text-muted-foreground">
                          no img
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm truncate">{it.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        {it.duration && <span className="rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-primary/80">{it.duration}</span>}
                        <span>₺{it.unit.toLocaleString("tr-TR")} × {it.qty}</span>
                        {itemDiscount > 0 && (
                          <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-warn">−₺{itemDiscount.toLocaleString("tr-TR")}</span>
                        )}
                      </div>
                    </div>
                    <div className="ml-2 shrink-0 text-right font-mono text-sm">
                      {itemDiscount > 0 && (
                        <div className="text-[11px] text-muted-foreground line-through">₺{itemOriginal.toLocaleString("tr-TR")}</div>
                      )}
                      <div className="neon-text">₺{itemFinal.toLocaleString("tr-TR")}</div>
                    </div>
                    {isCartOrder && order.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(it.id)}
                        disabled={removingItemId === it.id}
                        className="ml-1 shrink-0 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-destructive/80 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        aria-label="ürünü çıkar"
                        title="Bu ürünü siparişten çıkar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
              {(() => {
                const discs = (Array.isArray(order.discount) ? order.discount : (order.discount ? [order.discount] : [])) as Array<{ discount_try?: number; code_snapshot?: string | null }>;
                const orig = Number(order.price_try);
                const flashDisc = discs.filter((d) => (d.code_snapshot ?? "").startsWith("FLASH-")).reduce((s, d) => s + Number(d.discount_try ?? 0), 0);
                const pointDisc = discs.filter((d) => (d.code_snapshot ?? "").startsWith("PUAN-")).reduce((s, d) => s + Number(d.discount_try ?? 0), 0);
                const couponDisc = discs.filter((d) => {
                  const c = d.code_snapshot ?? "";
                  return c && !c.startsWith("FLASH-") && !c.startsWith("PUAN-");
                }).reduce((s, d) => s + Number(d.discount_try ?? 0), 0);
                const totalDisc = flashDisc + pointDisc + couponDisc;
                const finalAmt = Math.max(0, orig - totalDisc);
                const walletBal = Number(wallet?.balance_try ?? 0);
                const walletCovers = walletBal >= finalAmt && finalAmt > 0;
                return (
                  <div className="mt-3 space-y-1.5 border-t border-primary/20 pt-3 font-mono text-xs">
                    <Row2 label="ara toplam" value={`₺${orig.toLocaleString("tr-TR")}`} />
                    {flashDisc > 0 && (
                      <Row2 label="⚡ flaş indirim" value={`−₺${flashDisc.toLocaleString("tr-TR")}`} accent="warn" />
                    )}
                    {couponDisc > 0 && (
                      <Row2 label="🎟 kupon" value={`−₺${couponDisc.toLocaleString("tr-TR")}`} accent="primary" />
                    )}
                    {pointDisc > 0 && (
                      <Row2 label="⭐ puan indirimi" value={`−₺${pointDisc.toLocaleString("tr-TR")}`} accent="primary" />
                    )}
                    <div className="flex items-center justify-between border-t border-primary/20 pt-2 mt-1">
                      <span className="text-muted-foreground uppercase tracking-widest text-[10px]">ödenecek</span>
                      <span className="flex items-center gap-2">
                        {totalDisc > 0 && (
                          <span className="text-[11px] text-muted-foreground line-through">₺{orig.toLocaleString("tr-TR")}</span>
                        )}
                        <span className="text-primary text-lg neon-text-glow">₺{finalAmt.toLocaleString("tr-TR")}</span>
                      </span>
                    </div>
                    {walletCovers && order.status === "pending" && (
                      <div className="mt-1 text-[10px] text-primary/80">
                        ✓ mevcut cüzdan bakiyen ({walletBal.toLocaleString("tr-TR")} ₺) yeterli · tek tıkla ödeyebilirsin
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          {order.status === "pending" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2 font-mono text-xs">
              <span className="text-muted-foreground">
                Fikrin değiştiyse siparişi iptal edebilirsin — ödeme yapılmadan iade yok.
              </span>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                <X className="h-3 w-3" />
                {cancelling ? "iptal ediliyor…" : "siparişi iptal et"}
              </button>
            </div>
          )}



          {order.status === "approved" && deliveredKeys.length > 0 && (
            <div className="space-y-3">
              {deliveredKeys.map((k, i) => {
                const kProduct = (k as { product?: { name?: string; delivery_type?: string } | null }).product;
                return (
                  <DeliveryBlock
                    key={i}
                    keyValue={k.key_value}
                    activationToken={k.activation_token}
                    deliveryType={(kProduct?.delivery_type ?? deliveryType) as DeliveryType}
                    product={kProduct?.name ?? orderTitle}
                  />
                );
              })}
            </div>
          )}

          {needsManualContact && (order.status === "reviewing" || order.status === "approved") && (
            <ManualContactBlock
              orderId={orderId}
              reference={order.reference_code}
              product={orderTitle}
              status={order.status}
              existingNote={order.user_note ?? ""}
            />
          )}

          {order.status === "rejected" && (
            <div className="glass-card rounded-lg p-6 border-destructive/40">
              <div className="flex items-center gap-2 font-mono text-destructive">
                <XCircle className="h-5 w-5" /> Ödeme Reddedildi
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Ödemeniz reddedildi. Destek hattımız üzerinden yeni bir referans oluşturabiliriz.
              </p>
            </div>
          )}

          {/* Ödeme süresi sayacı geçici olarak kaldırıldı */}
          {false && (
            <CountdownBanner secondsLeft={secondsLeft} totalSec={PAYMENT_WINDOW_SEC} />
          )}



          {(order.status === "pending" || order.status === "reviewing") && (
            <>
              {(() => {
                const discs = (Array.isArray(order.discount) ? order.discount : (order.discount ? [order.discount] : [])) as Array<{ discount_try: number; code_snapshot: string | null }>;
                // Kupon indirimi = FLASH-/PUAN- ile başlamayan tek satır
                const couponRow = discs.find((d) => {
                  const c = d.code_snapshot ?? "";
                  return c && !c.startsWith("FLASH-") && !c.startsWith("PUAN-");
                }) ?? null;
                const pointsRow = discs.find((d) => (d.code_snapshot ?? "").startsWith("PUAN-")) ?? null;
                const totalDisc = discs.reduce((s, d) => s + Number(d.discount_try ?? 0), 0);
                const discountTry = Number(couponRow?.discount_try ?? 0);
                const codeSnap = couponRow?.code_snapshot ?? null;
                const finalAmount = Math.max(0, Number(order.price_try) - totalDisc);
                const isFree = finalAmount <= 0 && totalDisc > 0;
                return (
                  <>
                    <PromoBlock
                      orderId={orderId}
                      originalPrice={Number(order.price_try)}
                      discountTry={discountTry}
                      appliedCode={codeSnap}
                    />
                    <PointsBlock
                      orderId={orderId}
                      originalPrice={Number(order.price_try)}
                      hasOtherDiscount={discountTry > 0}
                      appliedPointsAmount={
                        pointsRow?.code_snapshot
                          ? Number(pointsRow.code_snapshot.slice(5)) || null
                          : null
                      }
                    />

                    {isFree ? (
                      <section className="glass-card rounded-lg p-6 border-primary/40">
                        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
                          [02/04] · ücretsiz sipariş
                        </div>
                        <h2 className="mt-1 font-mono text-xl neon-text flex items-center gap-2">
                          <Sparkles className="h-5 w-5" /> %100 İndirim Uygulandı
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Promosyon kodun tüm tutarı karşıladı. Dekont gerekmiyor — aşağıdaki butonla siparişini anında tamamla ve ürününü teslim al.
                        </p>
                        <div className="mt-4 flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-3 font-mono">
                          <span className="text-xs text-muted-foreground">ödenecek tutar</span>
                          <span className="text-2xl neon-text">₺0</span>
                        </div>
                        <Button
                          className="mt-4 w-full font-mono"
                          disabled={finalizing}
                          onClick={async () => {
                            setFinalizing(true);
                            try {
                              await finalizeFreeFn({ data: { orderId } });
                              toast.success("Sipariş tamamlandı · ürün teslim edildi");
                              qc.invalidateQueries({ queryKey: ["order", orderId] });
                            } catch (e) {
                              toast.error((e as Error).message);
                            } finally {
                              setFinalizing(false);
                            }
                          }}
                        >
                          {finalizing ? "Tamamlanıyor…" : "Ücretsiz Siparişi Tamamla"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </section>
                    ) : (
                      <>
                        {(() => {
                          const singleUrl = (order.product as { shopier_url?: string | null } | null)?.shopier_url ?? null;
                          const cartUrls = orderItems
                            .map((i) => (i.product as { shopier_url?: string | null } | null)?.shopier_url)
                            .filter(Boolean);
                          const shopierUrl = singleUrl ?? (cartUrls.length === 1 ? cartUrls[0] : null);
                          if (!shopierUrl) return null;
                          return (
                            <ShopierPayBlock
                              url={shopierUrl}
                              amount={finalAmount}
                              reference={order.reference_code}
                            />
                          );
                        })()}
                        <WalletPayBlock
                          balance={Number(wallet?.balance_try ?? 0)}
                          amount={finalAmount}
                          paying={payingWallet}
                          onPay={startWalletPay}
                        />


                      </>
                    )}
                  </>
                );
              })()}
          </>
        )}
      </div>


        {/* SIDE: live monitor */}
        <aside className="space-y-4">
          <LiveMonitor order={order} />
          <SecurityChecklist />
        </aside>
      </div>
      <MfaGateDialog
        open={mfaGateOpen}
        onOpenChange={setMfaGateOpen}
        userId={user?.id}
        title="Satın alma için 2FA gerekli"
        description="Cüzdan ödemesini onaylamak için authenticator uygulamandaki 6 haneli kodu gir."
        onSuccess={() => runWalletPay()}
      />

    </div>
  );
}

/* ============================ SHOPIER ============================ */

function ShopierPayBlock({
  url,
  amount,
  reference,
}: {
  url: string;
  amount: number;
  reference: string;
}) {
  return (
    <section className="glass-card rounded-lg p-5 border-primary/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [02/04] · kart / havale · shopier
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Shopier ile Öde</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Kart · Havale · BKM Express — Shopier güvencesiyle. Ödeme onaylanınca ürün otomatik teslim edilir.
          </p>
        </div>
        <div className="font-mono text-lg neon-text shrink-0">
          ₺{amount.toLocaleString("tr-TR")}
        </div>
      </div>
      <div className="mt-3 rounded-md border border-warn/40 bg-warn/5 p-3 font-mono text-[11px] text-warn">
        ⚠ Shopier'de hesabına kayıtlı e‑postayı kullan — ödeme senin siparişinle bu e‑postayla eşleşir.
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-mono text-primary-foreground neon-glow hover:opacity-90 transition"
      >
        Shopier'e Git · ₺{amount.toLocaleString("tr-TR")}
        <ArrowRight className="h-4 w-4" />
      </a>
      <p className="mt-2 text-center text-[10px] text-muted-foreground font-mono">
        ref: {reference} · ödeme sonrası bu sayfa otomatik güncellenir
      </p>
    </section>
  );
}

/* ============================ TRANSFER ============================ */


function TransferBlock({
  bank,
  amount,
  originalAmount,
  discountTry,
  appliedCode,
  reference,
  productName,
  productDuration,
}: {
  bank: { bank_name?: string; holder_name?: string; iban?: string } | null | undefined;
  amount: number;
  originalAmount?: number;
  discountTry?: number;
  appliedCode?: string | null;
  reference: string;
  productName: string;
  productDuration?: string;
}) {
  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v);
    toast.success(`${label} kopyalandı`);
  };
  const iban = bank?.iban ?? "—";
  const durLabel =
    productDuration === "monthly"
      ? "Aylık"
      : productDuration === "yearly"
      ? "Yıllık"
      : productDuration === "lifetime"
      ? "Ömür Boyu"
      : null;
  const hasDiscount = (discountTry ?? 0) > 0;

  return (
    <section className="glass-card rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [02/04] · havale kanalı
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Havale / EFT</h2>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 font-mono text-xs text-primary">
          <Lock className="h-3.5 w-3.5" /> güvenli kanal
        </div>
      </div>

      {/* Satın alınan ürün özeti */}
      <div className="mt-4 rounded-md border border-primary/30 bg-primary/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              satın alınan ürün
            </div>
            <div className="mt-1 font-mono text-base text-primary neon-text break-words">
              {productName || "—"}
            </div>
            {durLabel && (
              <div className="mt-1 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                {durLabel}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              tutar
            </div>
            {hasDiscount && originalAmount !== undefined && (
              <div className="mt-1 font-mono text-xs text-muted-foreground line-through">
                ₺{originalAmount.toLocaleString("tr-TR")}
              </div>
            )}
            <div className="mt-1 font-mono text-lg neon-text">
              ₺{amount.toLocaleString("tr-TR")}
            </div>
            {hasDiscount && appliedCode && (
              <div className="mt-1 inline-flex items-center gap-1 rounded border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[10px] text-warn">
                <Tag className="h-3 w-3" /> {appliedCode} · −₺{(discountTry ?? 0).toLocaleString("tr-TR")}
              </div>
            )}
          </div>
        </div>
      </div>


      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_auto]">
        {/* Bank fields */}
        <dl className="space-y-2 font-mono text-sm">
          <Field label="banka" value={bank?.bank_name ?? "—"} />
          <Field label="alıcı" value={bank?.holder_name ?? "—"} />
          <Field label="iban" value={iban} mono onCopy={() => copy(iban, "IBAN")} />
          <Field
            label="tutar"
            value={`₺${amount.toLocaleString("tr-TR")}`}
            highlight
            onCopy={() => copy(String(amount), "Tutar")}
          />
          <div className="pt-2">
            <div className="text-[10px] tracking-widest text-muted-foreground mb-1">
              açıklama / referans kodu
            </div>
            <button
              onClick={() => copy(reference, "Referans")}
              className="group w-full text-left rounded-md border border-primary/50 bg-primary/10 px-4 py-3 font-mono text-primary neon-glow flex items-center gap-3 hover:bg-primary/15 transition"
            >
              <span className="flex-1 text-lg tracking-widest break-all">{reference}</span>
              <Copy className="h-4 w-4 opacity-70 group-hover:opacity-100" />
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              → Bu referansı açıklamaya <span className="text-primary">birebir</span> yazmadan
              transfer yapmayın; otomatik eşleşme başarısız olur.
            </p>
          </div>
        </dl>

        {/* QR — Enpara */}
        <div className="flex flex-col items-center justify-start min-w-[220px]">
          <div className="rounded-lg bg-white p-3 shadow-lg">
            <img
              src={enparaQr}
              alt="Enpara Havale QR"
              width={200}
              height={212}
              className="block"
            />
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground font-mono">
            Enpara uygulamasında QR ile aktar
          </p>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onCopy,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <dt className="text-[10px] tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd
        className={`flex items-center gap-2 ${highlight ? "text-primary neon-text text-base" : ""} ${
          mono ? "font-mono" : ""
        }`}
      >
        <span className="break-all">{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="text-muted-foreground hover:text-primary">
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}

/* ============================ RECEIPT ============================ */

function ReceiptBlock({
  dragOver,
  setDragOver,
  uploading,
  fileRef,
  onFile,
  reviewing,
  receiptPath,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  reviewing: boolean;
  receiptPath: string | null;
}) {
  return (
    <section className="glass-card rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [03/04] · dekont yükleme
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Dekont Doğrulama</h2>
        </div>
        {reviewing && (
          <div className="flex items-center gap-2 font-mono text-xs text-cyan">
            <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" />
            inceleniyor…
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className={`mt-5 relative rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-primary bg-primary/10 neon-glow"
            : "border-border/60 hover:border-primary/60 hover:bg-primary/5"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <UploadCloud
          className={`mx-auto h-10 w-10 ${uploading ? "text-cyan animate-pulse" : "text-primary"}`}
        />
        <div className="mt-3 font-mono text-sm">
          {uploading
            ? "→ yükleniyor & imzalanıyor…"
            : dragOver
            ? "// bırak, doğrulamayı başlatayım"
            : "dekont/makbuz dosyasını buraya sürükle"}
        </div>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          jpg · png · pdf · maks 5MB · AES-256 şifreli depolama
        </div>
        {!uploading && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 font-mono"
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
          >
            <UploadCloud className="mr-2 h-4 w-4" /> dosya seç
          </Button>
        )}
      </div>

      {receiptPath && (
        <div className="mt-3 flex items-center gap-2 font-mono text-xs text-primary">
          <CheckCircle2 className="h-4 w-4" />
          dosya alındı: {receiptPath.split("/").pop()}
        </div>
      )}
    </section>
  );
}

/* ============================ DELIVERY ============================ */

function DeliveryBlock({
  keyValue,
  activationToken,
  deliveryType,
  product,
}: {
  keyValue: string;
  activationToken: string | null;
  deliveryType: DeliveryType;
  product: string;
}) {
  const [revealed, setRevealed] = useState(false);

  const primaryValue = deliveryType === "link_token" && activationToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/aktivasyon/${activationToken}`
    : keyValue;

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(primaryValue);
      toast.success("Teslimat panoya kopyalandı");
    } catch {
      toast.error("Kopyalanamadı — manuel seçip kopyala");
    }
  };

  return (
    <section className="glass-card rounded-lg p-5 sm:p-6 scan-line neon-glow border-primary/50">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [04/04] · delivery_channel · unlocked
          </div>
          <h2 className="mt-1 font-mono text-xl sm:text-2xl neon-text truncate">Lisansın Hazır ✓</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground truncate">{product}</p>
        </div>
        <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10 text-primary shrink-0" />
      </div>

      <div className="mt-5 rounded-md border-2 border-primary/50 bg-black/40 p-4 sm:p-5 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 cyber-grid opacity-20" aria-hidden />
        <div className="relative">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
              $ ./decrypt --{deliveryType}
            </div>
            {revealed && (
              <button
                type="button"
                onClick={handleCopyAll}
                className="inline-flex items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-primary hover:bg-primary/20 transition"
              >
                <Copy className="h-3 w-3" /> tümünü kopyala
              </button>
            )}
          </div>
          {revealed ? (
            <DeliveryPayload
              deliveryType={deliveryType}
              keyValue={keyValue}
              activationToken={activationToken}
            />
          ) : (
            <div className="font-mono text-xl sm:text-2xl text-primary tracking-widest">
              ████████-████████-████████
              <span className="terminal-caret" />
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!revealed && (
          <Button onClick={() => setRevealed(true)} size="lg" className="font-mono neon-glow flex-1 sm:flex-none">
            <KeyRound className="mr-2 h-4 w-4" /> teslimatı aç
          </Button>
        )}
        <Button asChild variant="outline" className="font-mono">
          <Link to="/hesabim">
            hesabıma dön <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {revealed && (
        <div className="mt-4 rounded-md border border-border/60 bg-background/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            $ ./ihtiyacın var mı? — anlık destek
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://wa.me/905555555555"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 font-mono text-xs text-emerald-400 hover:bg-emerald-500/10 hover:shadow-[0_0_12px_rgba(16,185,129,0.35)] transition"
            >
              <MessageCircle className="h-3.5 w-3.5" /> whatsapp
            </a>
            <a
              href="https://t.me/siberphp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-1.5 font-mono text-xs text-sky-400 hover:bg-sky-500/10 hover:shadow-[0_0_12px_rgba(14,165,233,0.35)] transition"
            >
              <Send className="h-3.5 w-3.5" /> telegram
            </a>
            <Link
              to="/destek"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 font-mono text-xs text-primary hover:bg-primary/10 transition"
            >
              <Terminal className="h-3.5 w-3.5" /> canlı destek bileti
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================ SIDE MONITOR ============================ */

function LiveMonitor({
  order,
}: {
  order: {
    status: string;
    price_try: number;
    reference_code: string;
    created_at?: string;
    product?: { name?: string; duration?: string } | null;
  };
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = order.created_at
    ? Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 1000))
    : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const logs = useMemo(() => {
    const base = [
      "[+] tls_handshake OK",
      "[+] order_signature verified",
      "[+] reference_key minted",
    ];
    if (order.status !== "pending") base.push("[+] receipt_uploaded");
    if (order.status === "reviewing") base.push("[~] awaiting operator ack…");
    if (order.status === "approved") base.push("[+] key_delivered → session");
    if (order.status === "rejected") base.push("[!] transfer_rejected");
    return base;
  }, [order.status]);

  return (
    <div className="glass-card rounded-lg p-4">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3" /> live_monitor
        </span>
        <span className="text-primary">● {order.status.toUpperCase()}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
        <Stat label="uptime" value={`${mm}:${ss}`} />
        <Stat label="amount" value={`₺${Number(order.price_try).toLocaleString("tr-TR")}`} />
      </div>

      <div className="mt-3 rounded-md bg-black/40 border border-border/60 p-3 font-mono text-[11px] leading-relaxed">
        {logs.map((l, i) => (
          <div
            key={i}
            className={
              l.startsWith("[!]")
                ? "text-destructive"
                : l.startsWith("[~]")
                ? "text-cyan"
                : "text-primary/90"
            }
          >
            {l}
          </div>
        ))}
        <div className="text-muted-foreground">
          <span className="terminal-caret" />
        </div>
      </div>
    </div>
  );
}

function Row2({ label, value, accent }: { label: string; value: string; accent?: "warn" | "primary" }) {
  const cls = accent === "warn" ? "text-warn" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${cls}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2">
      <div className="text-[9px] tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 text-primary">{value}</div>
    </div>
  );
}

function SecurityChecklist() {
  const items = [
    { i: ShieldCheck, t: "RLS izole sipariş" },
    { i: Lock, t: "şifreli dekont depo" },
    { i: KeyRound, t: "atomic key atama" },
  ];
  return (
    <div className="glass-card rounded-lg p-4">
      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
        security_stack
      </div>
      <ul className="mt-2 space-y-1.5 font-mono text-xs">
        {items.map((x) => (
          <li key={x.t} className="flex items-center gap-2">
            <x.i className="h-3.5 w-3.5 text-primary" />
            <span>{x.t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================ MANUAL CONTACT ============================ */

function ManualContactBlock({
  orderId,
  reference,
  product,
  status,
  existingNote,
}: {
  orderId: string;
  reference: string;
  product: string;
  status: string;
  existingNote: string;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState(existingNote);
  const [saving, setSaving] = useState(false);
  const noteFn = useServerFn(setOrderUserNote);
  const saved = existingNote.length > 0 && note === existingNote;

  const sendNote = async () => {
    if (!note.trim()) return toast.error("Mesaj boş olamaz");
    setSaving(true);
    try {
      await noteFn({ data: { orderId, note: note.trim() } });
      toast.success("Mesajın admine iletildi");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const igDM = `https://ig.me/m/siber.php`;
  const igProfile = `https://instagram.com/siber.php`;
  const tgDM = `https://t.me/dessyoffical`;

  return (
    <section className="glass-card rounded-lg p-6 border-cyan/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [manual_delivery] · human_handoff
          </div>
          <h2 className="mt-1 font-mono text-xl neon-text">Manuel Teslimat</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bu ürün elden hazırlanır. {status === "approved"
              ? "Onay verildi — teslim bilgilerin için aşağıdaki kanallardan iletişime geç."
              : "Ödemen doğrulandıktan sonra hesap/erişim bilgileri buradan ulaştırılır."}
          </p>
        </div>
        <MessageCircle className="h-8 w-8 text-cyan opacity-80" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <a
          href={tgDM}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/10 p-4 hover:bg-primary/20 hover:neon-glow transition"
        >
          <Send className="h-6 w-6 text-primary rotate-[-20deg]" />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm neon-text">Telegram</div>
            <div className="text-xs text-muted-foreground truncate">@dessyoffical · önerilen</div>
          </div>
          <ArrowRight className="h-4 w-4 text-primary opacity-70 group-hover:opacity-100" />
        </a>
        <a
          href={igDM}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-lg border border-cyan/40 bg-cyan/5 p-4 hover:bg-cyan/10 transition"
        >
          <Instagram className="h-6 w-6 text-cyan" />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm text-cyan">Instagram DM</div>
            <div className="text-xs text-muted-foreground truncate">@siber.php</div>
          </div>
          <ArrowRight className="h-4 w-4 text-cyan opacity-70 group-hover:opacity-100" />
        </a>
        <a
          href={igProfile}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-lg border border-border/60 p-4 hover:border-primary/40 hover:bg-primary/5 transition"
        >
          <Instagram className="h-6 w-6 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm">IG Profil</div>
            <div className="text-xs text-muted-foreground truncate">instagram.com/siber.php</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100" />
        </a>
      </div>

      <div className="mt-5">
        <div className="mb-2 font-mono text-[10px] tracking-widest text-muted-foreground">
          $ echo "mesajın" &gt;&gt; admin_inbox
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="İsteğe bağlı: teslim için ek bilgi (mail adresi, telefon, tercih ettiğin plan vs.)"
          className="font-mono min-h-[100px] bg-black/30"
          maxLength={1000}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {saved ? "✓ admine iletildi · yeniden düzenleyebilirsin" : `${note.length}/1000`}
          </span>
          <Button
            onClick={sendNote}
            disabled={saving || !note.trim() || saved}
            size="sm"
            className="font-mono"
          >
            <Send className="mr-2 h-4 w-4" />
            {saving ? "gönderiliyor…" : saved ? "gönderildi" : "admine gönder"}
          </Button>
        </div>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          referans: <span className="text-primary">{reference}</span> · Telegram/Instagram'dan yazarken bu kodu belirt.
        </p>
      </div>
    </section>
  );
}

/* ============================ COUNTDOWN ============================ */

function CountdownBanner({ secondsLeft, totalSec }: { secondsLeft: number; totalSec: number }) {
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const pct = Math.max(0, Math.min(100, (secondsLeft / totalSec) * 100));
  const critical = secondsLeft <= 30;
  const warn = secondsLeft <= 60;
  const tone = critical
    ? "border-destructive/60 bg-destructive/10 text-destructive"
    : warn
    ? "border-warn/60 bg-warn/10 text-warn"
    : "border-primary/40 bg-primary/5 text-primary";

  return (
    <div className={`glass-card rounded-lg p-4 border ${tone}`}>
      <div className="flex items-center gap-3">
        <Hourglass className={`h-5 w-5 ${critical ? "animate-pulse" : ""}`} />
        <div className="flex-1">
          <div className="font-mono text-xs tracking-widest uppercase opacity-80">
            ödeme süresi
          </div>
          <div className="font-mono text-2xl neon-text tabular-nums">
            {mm}:{ss}
          </div>
        </div>
        <div className="text-right font-mono text-[11px] opacity-80 max-w-[180px]">
          Bu süre içinde dekont yüklenmezse sipariş iptal edilir.
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
        <div
          className={`h-full transition-all ${
            critical ? "bg-destructive" : warn ? "bg-warn" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ============================ PROMO ============================ */

function PromoBlock({
  orderId,
  originalPrice,
  discountTry,
  appliedCode,
}: {
  orderId: string;
  originalPrice: number;
  discountTry: number;
  appliedCode: string | null;
}) {
  const qc = useQueryClient();
  const applyFn = useServerFn(applyPromoCode);
  const removeFn = useServerFn(removePromoCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isPointsCode = (appliedCode ?? "").startsWith("PUAN-");
  if (isPointsCode) return null;
  const hasDiscount = discountTry > 0 && !!appliedCode;
  const finalPrice = Math.max(0, originalPrice - discountTry);


  const apply = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await applyFn({ data: { orderId, code: code.trim() } });
      toast.success(`Kod uygulandı: −₺${res.discountTry.toLocaleString("tr-TR")}`);
      setCode("");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (e) {
      const raw = (e as Error).message || "";
      const [key, param] = raw.split(":");
      const map: Record<string, string> = {
        kod_bulunamadi: "Bu kod sistemde bulunamadı. Yazımı kontrol edin.",
        kod_pasif: "Bu kod şu an pasif.",
        kod_suresi_dolmus: "Bu kodun süresi dolmuş.",
        kod_limit_dolmus: "Bu kodun kullanım limiti dolmuş.",
        kod_min_tutar: param ? `Bu kod için minimum sipariş tutarı ₺${param}.` : "Sepet tutarı bu kod için yetersiz.",
        kod_urun_uyumsuz: "Bu kod bu üründe geçerli değil.",
        invalid_promo_code: "Geçersiz promosyon kodu.",
        order_not_found: "Bu sipariş için kod uygulanamıyor.",
        unauthorized: "Oturum gerekli.",
      };
      setErr(map[key] ?? raw ?? "Kod uygulanamadı");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeFn({ data: { orderId } });
      toast.success("Kod kaldırıldı");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card rounded-lg p-5">
      <div className="flex items-center gap-2 font-mono text-sm">
        <Ticket className="h-4 w-4 text-primary" />
        <span className="neon-text">Promosyon Kodu</span>
      </div>
      {hasDiscount ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-lg text-primary neon-text flex items-center gap-2">
              <Tag className="h-4 w-4" /> {appliedCode}
            </div>
            <div className="mt-1 text-xs font-mono text-muted-foreground">
              <span className="line-through">₺{originalPrice.toLocaleString("tr-TR")}</span>{" "}
              → <span className="text-primary">₺{finalPrice.toLocaleString("tr-TR")}</span>{" "}
              <span className="text-warn">(−₺{discountTry.toLocaleString("tr-TR")})</span>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
            kaldır
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); if (err) setErr(null); }}
              placeholder="KODUNUZ"
              className={`font-mono uppercase ${err ? "border-destructive/60 focus-visible:ring-destructive/40" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
              aria-invalid={!!err}
            />
            <Button onClick={apply} disabled={busy || !code.trim()}>
              {busy ? "…" : err ? "tekrar dene" : "uygula"}
            </Button>
          </div>
          {err && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 font-mono text-[11px] text-destructive">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{err}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ============================ WALLET PAY ============================ */
function WalletPayBlock({
  balance,
  amount,
  paying,
  onPay,
}: {
  balance: number;
  amount: number;
  paying: boolean;
  onPay: () => void;
}) {
  const enough = balance >= amount;
  return (
    <section className={`glass-card rounded-lg p-5 md:p-6 ${enough ? "border-primary/40 neon-glow" : ""}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
            [ödeme yöntemi] · cüzdan
          </div>
          <h2 className="mt-1 font-mono text-lg neon-text flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Bakiyemle Öde
          </h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono text-muted-foreground">mevcut bakiye</div>
          <div className={`font-mono text-lg font-bold ${enough ? "text-primary" : "text-muted-foreground"}`}>
            {balance.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
          </div>
        </div>
      </div>

      {enough ? (
        <>
          <div className="mt-3 flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 font-mono">
            <span className="text-xs text-muted-foreground">bu siparişten düşecek</span>
            <span className="text-xl neon-text">{amount} TL</span>
          </div>
          <Button className="mt-3 w-full font-mono" disabled={paying} onClick={onPay}>
            {paying ? "Ödeniyor…" : "Bakiyemle Öde ve Teslim Al"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <div className="mt-2 text-[11px] text-muted-foreground font-mono">
            ödeme onaylıyorsa ürün anında teslim edilir · dekont gerekmez
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 rounded-md border border-warn/40 bg-warn/5 p-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-warn mb-1.5">
              <XCircle className="h-3.5 w-3.5" /> yetersiz bakiye
            </div>
            <div className="text-muted-foreground leading-relaxed">
              Sipariş için <span className="text-foreground">₺{amount.toLocaleString("tr-TR")}</span> gerekli · mevcut <span className="text-foreground">₺{balance.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <br />
              eksik: <span className="text-warn font-bold">₺{Math.max(0, amount - balance).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
          <Button asChild className="mt-3 w-full font-mono neon-glow">
            <Link to="/cuzdan">
              cüzdana ₺{Math.max(0, amount - balance).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}+ yükle <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground font-mono">
            ya da yukarıdaki Shopier ile kart / havale ile öde.
          </p>
        </>
      )}
    </section>
  );
}

type CheckoutField = { name: string; el_type?: string; input_type?: string; required?: boolean };

function CheckoutFieldsCard({
  orderId,
  fields,
  initial,
  saved,
  onSave,
}: {
  orderId: string;
  fields: CheckoutField[];
  initial: Record<string, string>;
  saved: boolean;
  onSave: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const labelize = (n: string) => {
    if (n === "license_email") return "lisansın tanımlanacağı e-posta";
    return n.replace(/_/g, " ");
  };
  const hasEmailField = fields.some((f) => f.name === "license_email");
  const missing = fields.filter((f) => f.required !== false && !((values[f.name] ?? "").trim()));
  return (
    <section className={`mt-4 glass-card rounded-xl p-4 sm:p-5 ${saved ? "border-primary/40" : "border-cyan/40"}`}>
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-cyan">
        <KeyRound className="h-3.5 w-3.5" /> {hasEmailField ? "mail tanımlı lisans · e-posta gerekli" : "ürün bilgileri"} · ref: {orderId.slice(0, 8)}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasEmailField
          ? "Bu lisans senin verdiğin e-posta adresine tanımlanır. Kullanmak istediğin e-postayı doğru gir — teslim onaydan sonra bu adrese yapılır."
          : "Bu ürün otomatik tedarik edilir. Aşağıdaki bilgileri girmen gerekiyor — bunlar onay sonrası tedarikçiye iletilir ve teslim buna göre yapılır."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className="text-xs font-mono">
            <span className="block mb-1 text-muted-foreground">
              {labelize(f.name)}{f.required !== false && <span className="text-destructive"> *</span>}
            </span>
            {(f.el_type === "textarea" || f.input_type === "textarea") ? (
              <Textarea
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                rows={3}
              />
            ) : (
              <Input
                type={(f.input_type === "password" ? "password" : f.input_type === "email" ? "email" : "text")}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-mono text-muted-foreground">
          {saved ? "kayıtlı — düzenleyip tekrar kaydedebilirsin" : "onaylamadan önce bilgileri kaydet"}
        </div>
        <Button
          size="sm"
          disabled={busy || missing.length > 0}
          onClick={async () => {
            setBusy(true);
            try { await onSave(values); } catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}
        >
          {busy ? "kaydediliyor…" : "bilgileri kaydet"}
        </Button>
      </div>
    </section>
  );
}

function CrossSellOffer({ orderId, orderStatus, categories, excludeSlugs }: { orderId: string; orderStatus: string; categories: string[]; excludeSlugs: string[] }) {
  const addToCart = useCart((s) => s.addItem);
  const qc = useQueryClient();
  const addToOrderFn = useServerFn(addItemToOrder);
  const [adding, setAdding] = useState(false);
  const canAddToOrder = orderStatus === "pending";
  const { data: offer } = useQuery({
    queryKey: ["cross-sell-offer", categories.sort().join("|")],
    enabled: categories.length > 0,
    queryFn: async () => {
      const { data: rules } = await supabase
        .from("cross_sell_rules" as never)
        .select("from_category, to_category, discount_percent, promo_code, note")
        .in("from_category", categories)
        .eq("active", true);
      const list = (rules ?? []) as Array<{
        from_category: string;
        to_category: string;
        discount_percent: number;
        promo_code: string | null;
        note: string | null;
      }>;
      if (list.length === 0) return null;
      // Pick the highest-discount rule
      const rule = list.sort((a, b) => b.discount_percent - a.discount_percent)[0];
      // Fetch a suggested product from to_category (skip already-in-cart slugs)
      const { data: products } = await supabase
        .from("products")
        .select("id, name, slug, price_try, image_url, tier, duration")
        .eq("active", true)
        .eq("category", rule.to_category)
        .not("slug", "in", `(${excludeSlugs.length ? excludeSlugs.map((s) => `"${s}"`).join(",") : '""'})`)
        .order("sort_order", { ascending: false })
        .limit(1);
      const product = products?.[0];
      if (!product) return null;
      const original = Number(product.price_try);
      const discounted = Math.round(original * (1 - rule.discount_percent / 100));
      return { rule, product, original, discounted };
    },
  });

  if (!offer) return null;
  const { rule, product, original, discounted } = offer;

  return (
    <section className="mt-4 relative overflow-hidden rounded-xl border border-warn/40 bg-gradient-to-br from-warn/5 via-transparent to-primary/5 p-4 sm:p-5 scan-line">
      <div className="pointer-events-none absolute inset-0 cyber-grid opacity-30" aria-hidden />
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-16 w-16 rounded-lg object-cover border border-border/60 shrink-0"
              loading="lazy"
            />
          )}
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-warn flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> kombo teklif · yanına ekle
            </div>
            <div className="mt-0.5 text-base sm:text-lg font-semibold truncate">{product.name}</div>
            {rule.note && (
              <div className="text-xs text-muted-foreground truncate">{rule.note}</div>
            )}
            <div className="mt-1 flex items-center gap-2 font-mono text-sm">
              <span className="text-muted-foreground line-through">₺{original.toLocaleString("tr-TR")}</span>
              <span className="text-primary text-lg font-semibold neon-text">₺{discounted.toLocaleString("tr-TR")}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-warn/40 bg-warn/10 text-warn font-semibold">
                %{rule.discount_percent} indirim
              </span>
            </div>
            {rule.promo_code && (
              <div className="mt-1 text-[11px] font-mono text-muted-foreground">
                sepette kupon: <span className="text-warn font-semibold">{rule.promo_code}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          {canAddToOrder ? (
            <Button
              disabled={adding}
              onClick={async () => {
                setAdding(true);
                try {
                  await addToOrderFn({ data: { orderId, productId: product.id, quantity: 1 } });
                  await qc.invalidateQueries({ queryKey: ["order", orderId] });
                  toast.success("bu siparişe eklendi · toplam güncellendi");
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setAdding(false);
                }
              }}
              className="font-mono neon-glow"
            >
              <Sparkles className="h-4 w-4 mr-1" /> {adding ? "ekleniyor…" : "bu siparişe ekle"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                addToCart({
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  priceTry: discounted,
                  originalPriceTry: original,
                  discountTry: Math.max(0, original - discounted),
                  discountLabel: "çapraz satış indirimi",
                  imageUrl: product.image_url ?? null,
                });
                toast.success("sepete eklendi");
              }}
              className="font-mono neon-glow"
            >
              <Sparkles className="h-4 w-4 mr-1" /> sepete ekle
            </Button>
          )}
          <Link
            to="/urun/$slug"
            params={{ slug: product.slug }}
            className="text-center font-mono text-xs text-muted-foreground hover:text-primary underline underline-offset-4"
          >
            detay →
          </Link>
        </div>
      </div>
    </section>
  );
}




