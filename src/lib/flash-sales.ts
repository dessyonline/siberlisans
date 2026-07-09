export type FlashSaleLite = {
  id: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  ends_at: string;
  label?: string | null;
};

/** flash indirimi ürün fiyatına uygular. */
export function applyFlash(priceTry: number, sale: FlashSaleLite | null | undefined) {
  const price = Number(priceTry) || 0;
  if (!sale) return { final: price, saved: 0, percent: 0, hasSale: false as const };
  const raw =
    sale.discount_type === "percent"
      ? price * (Number(sale.discount_value) / 100)
      : Number(sale.discount_value);
  const saved = Math.max(0, Math.min(price, Math.round(raw * 100) / 100));
  const final = Math.max(0, Math.round((price - saved) * 100) / 100);
  const percent =
    sale.discount_type === "percent"
      ? Number(sale.discount_value)
      : price > 0
        ? Math.round((saved / price) * 100)
        : 0;
  return { final, saved, percent, hasSale: saved > 0 } as const;
}
