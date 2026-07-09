import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Minus, Plus, Trash2, ShoppingCart, KeyRound, ArrowRight, Ticket, X, Package } from "lucide-react";
import { useCart, selectCartTotal } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-context";
import { createCartOrder } from "@/lib/orders.functions";
import { validateCoupon } from "@/lib/coupons.functions";

export function CartDrawer() {
  const isOpen = useCart((s) => s.isOpen);
  const close = useCart((s) => s.close);
  const items = useCart((s) => s.items);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const total = useCart(selectCartTotal);
  const { user } = useAuth();
  const navigate = useNavigate();
  const createCartOrderFn = useServerFn(createCartOrder);
  const validateCouponFn = useServerFn(validateCoupon);
  const [submitting, setSubmitting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const finalTotal = Math.max(0, total - (coupon?.discount ?? 0));

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    if (!user) {
      toast("Kupon uygulamak için giriş yap");
      return;
    }
    setChecking(true);
    try {
      const res = await validateCouponFn({ data: { code: couponInput.trim(), subtotal: total } });
      setCoupon({ code: res.code, discount: res.discountTry });
      toast.success(`Kupon uygulandı: -₺${res.discountTry.toLocaleString("tr-TR")}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCoupon(null);
    } finally {
      setChecking(false);
    }
  }

  const checkout = async () => {
    if (items.length === 0) return;
    if (!user) {
      close();
      toast("Devam etmek için giriş yap");
      navigate({ to: "/auth" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await createCartOrderFn({
        data: {
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          couponCode: coupon?.code ?? null,
        },
      });
      clear();
      setCoupon(null);
      setCouponInput("");
      close();
      navigate({ to: "/odeme/$orderId", params: { orderId: res.orderId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle className="font-mono flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span className="neon-text">Sepet</span>
            <span className="text-muted-foreground text-xs">({items.length} ürün)</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {items.length === 0 && (
            <div className="mt-16 text-center font-mono text-sm text-muted-foreground">
              <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-primary/40" />
              <div>Sepetin boş</div>
              <div className="mt-1 text-xs text-primary/60">$ ekle bir şeyler --now</div>
            </div>
          )}
          {items.map((it) => (
            <div
              key={it.productId}
              className="glass-card rounded-md p-3 flex items-start gap-3 border border-border/50"
            >
              <div className="h-14 w-14 rounded bg-black/40 border border-border/40 flex items-center justify-center shrink-0 overflow-hidden">
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt={it.name} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <KeyRound className="h-6 w-6 text-primary/60" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm truncate">{it.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  ₺{it.priceTry.toLocaleString("tr-TR")} · birim
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="inline-flex items-center rounded border border-border/60 bg-background/60">
                    <button
                      className="h-7 w-7 flex items-center justify-center hover:text-primary"
                      onClick={() => setQuantity(it.productId, it.quantity - 1)}
                      aria-label="azalt"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center font-mono text-xs">{it.quantity}</span>
                    <button
                      className="h-7 w-7 flex items-center justify-center hover:text-primary"
                      onClick={() => setQuantity(it.productId, it.quantity + 1)}
                      aria-label="artır"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(it.productId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="ml-auto font-mono text-sm neon-text">
                    ₺{(it.priceTry * it.quantity).toLocaleString("tr-TR")}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border/60 p-4 space-y-3 bg-background/70 backdrop-blur">
            {/* Kupon */}
            {coupon ? (
              <div className="flex items-center gap-2 font-mono text-xs bg-primary/10 border border-primary/30 rounded px-2 py-1.5">
                <Ticket className="h-3.5 w-3.5 text-primary" />
                <span className="text-primary">{coupon.code}</span>
                <span className="ml-auto text-primary">-₺{coupon.discount.toLocaleString("tr-TR")}</span>
                <button onClick={() => { setCoupon(null); setCouponInput(""); }} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Kupon kodu"
                  className="font-mono text-xs h-9"
                />
                <Button onClick={applyCoupon} disabled={checking || !couponInput.trim()} size="sm" variant="outline" className="font-mono">
                  {checking ? "…" : "uygula"}
                </Button>
              </div>
            )}

            {coupon && (
              <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>ara toplam</span>
                <span>₺{total.toLocaleString("tr-TR")}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-mono">
              <span className="text-xs text-muted-foreground uppercase tracking-widest">toplam</span>
              <span className="text-xl neon-text">₺{finalTotal.toLocaleString("tr-TR")}</span>
            </div>
            <Button
              onClick={checkout}
              disabled={submitting}
              className="w-full font-mono"
              size="lg"
            >
              {submitting ? "$ sipariş oluşturuluyor…" : "$ siparişi tamamla"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <button
              onClick={clear}
              className="w-full text-center font-mono text-[11px] text-muted-foreground hover:text-destructive"
            >
              sepeti temizle
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
