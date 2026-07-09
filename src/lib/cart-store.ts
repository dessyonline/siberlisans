import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  /** Sepette tahsil edilecek birim fiyat. */
  priceTry: number;
  /** İndirim öncesi birim fiyat; eski sepet kayıtlarında boş olabilir. */
  originalPriceTry?: number;
  /** Birim ürün başına indirim tutarı; eski sepet kayıtlarında boş olabilir. */
  discountTry?: number;
  discountLabel?: string | null;
  imageUrl: string | null;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, qty: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      addItem: (item, qty = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: Math.min(50, i.quantity + qty) }
                  : i,
              ),
              isOpen: true,
            };
          }
          return { items: [...s.items, { ...item, quantity: Math.min(50, qty) }], isOpen: true };
        }),
      removeItem: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      setQuantity: (productId, qty) =>
        set((s) => ({
          items:
            qty <= 0
              ? s.items.filter((i) => i.productId !== productId)
              : s.items.map((i) =>
                  i.productId === productId ? { ...i, quantity: Math.min(50, qty) } : i,
                ),
        })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "siberphp-cart",
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export const selectCartCount = (s: { items: CartItem[] }) =>
  s.items.reduce((sum, i) => sum + i.quantity, 0);

export const selectCartTotal = (s: { items: CartItem[] }) =>
  s.items.reduce((sum, i) => sum + i.quantity * i.priceTry, 0);
