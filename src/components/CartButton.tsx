import { ShoppingCart } from "lucide-react";
import { useCart, selectCartCount } from "@/lib/cart-store";

export function CartButton({ compact = false }: { compact?: boolean }) {
  const open = useCart((s) => s.open);
  const count = useCart(selectCartCount);
  return (
    <button
      onClick={open}
      aria-label={`Sepet (${count} ürün)`}
      className={`relative inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 ${
        compact ? "h-9 w-9" : "h-9 w-9 sm:w-auto sm:px-3"
      }`}
    >
      <ShoppingCart className="h-4 w-4" />
      {!compact && <span className="hidden sm:inline sm:ml-1.5 font-mono text-sm">sepet</span>}
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground font-mono text-[10px] font-bold flex items-center justify-center shadow-[0_0_10px_oklch(0.82_0.20_145/0.6)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
