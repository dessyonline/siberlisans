export type ProductTag = {
  key: string;
  label: string;
  tone: "hot" | "new" | "low" | "rated" | "sale" | "infinite";
};

const TONE_CLASS: Record<ProductTag["tone"], string> = {
  hot: "border-warn/50 bg-warn/15 text-warn",
  new: "border-cyan/50 bg-cyan/15 text-cyan",
  low: "border-destructive/50 bg-destructive/15 text-destructive",
  rated: "border-primary/40 bg-primary/10 text-primary",
  sale: "border-warn/60 bg-warn/20 text-warn",
  infinite: "border-cyan/40 bg-cyan/10 text-cyan",
};

export function tagClass(tone: ProductTag["tone"]) {
  return TONE_CLASS[tone];
}

export type TagInput = {
  createdAt?: string | null;
  ordersCount?: number | null;
  avgRating?: number | null;
  reviewCount?: number | null;
  stock?: number | null;
  unlimited?: boolean | null;
  manual?: boolean | null;
  hasSale?: boolean | null;
};

/** Ürün verisinden otomatik rozetler üretir (çok satan / yeni / son X adet ...). */
export function computeProductTags(p: TagInput, max = 3): ProductTag[] {
  const tags: ProductTag[] = [];

  if (p.hasSale) tags.push({ key: "sale", label: "indirimde", tone: "sale" });

  if ((p.ordersCount ?? 0) >= 10) tags.push({ key: "hot", label: "çok satan", tone: "hot" });

  if (p.createdAt) {
    const days = (Date.now() - new Date(p.createdAt).getTime()) / 86400000;
    if (days < 7) tags.push({ key: "new", label: "yeni", tone: "new" });
  }

  if (!p.unlimited && !p.manual) {
    const s = p.stock ?? 0;
    if (s > 0 && s <= 3) tags.push({ key: "low", label: `son ${s} adet`, tone: "low" });
  }

  if ((p.reviewCount ?? 0) >= 3 && (p.avgRating ?? 0) >= 4.5) {
    tags.push({ key: "rated", label: "yüksek puan", tone: "rated" });
  }

  if (p.unlimited) tags.push({ key: "infinite", label: "anında teslim", tone: "infinite" });

  return tags.slice(0, max);
}
