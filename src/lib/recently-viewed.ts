const KEY = "siber-recent-products";
const MAX = 8;

export type RecentProduct = {
  id: string;
  slug: string;
  name: string;
  priceTry: number;
  imageUrl: string | null;
  at: number;
};

export function readRecent(): RecentProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProduct[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.slug) : [];
  } catch {
    return [];
  }
}

export function pushRecent(p: Omit<RecentProduct, "at">) {
  if (typeof window === "undefined") return;
  try {
    const list = readRecent().filter((x) => x.id !== p.id);
    list.unshift({ ...p, at: Date.now() });
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent("siber-recent-updated"));
  } catch {
    /* storage dolu veya kapalı */
  }
}

export function clearRecent() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("siber-recent-updated"));
}
