import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-store";

const IDLE_MS = 90_000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // aynı hatırlatma 6 saatte bir
const STORAGE_KEY = "cart-reminder-last";

/** Sepette ürün varken kullanıcı bir süre işlem yapmazsa nazik bir hatırlatma gösterir. */
export function CartReminder() {
  const items = useCart((s) => s.items);
  const open = useCart((s) => s.open);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (items.length === 0) return;

    const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return;

    timer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      const count = items.reduce((s, i) => s + i.quantity, 0);
      toast("Sepetin seni bekliyor 🛒", {
        description: `${count} ürün sepette duruyor — stoklar tükenmeden tamamla.`,
        duration: 10_000,
        action: { label: "Sepeti aç", onClick: () => open() },
      });
    }, IDLE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [items, open]);

  return null;
}
