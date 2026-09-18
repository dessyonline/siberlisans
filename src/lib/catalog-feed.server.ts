export type CatalogItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  price_try: number;
  retail_price_try: number | null;
  duration_label: string | null;
  image_url: string | null;
  in_stock: boolean;
  unlimited_stock: boolean;
  rating: number;
  review_count: number;
  url: string;
};

export type CatalogQuery = {
  category?: string;
  q?: string;
  limit?: number;
  code?: string;
};

/** Aktif ürünlerin herkese açık (satış fiyatı üzerinden) katalog listesi. */
export async function loadCatalog(baseUrl: string, query: CatalogQuery): Promise<CatalogItem[]> {
  const { mysqlQuery, bool } = await import("./mysql.server");
  const filters = ["active=1"];
  const params: Array<string | number> = [];
  if (query.category) { filters.push("category=?"); params.push(query.category); }
  if (query.q) { filters.push("name LIKE ?"); params.push(`%${query.q}%`); }
  const limit = Number.isFinite(query.limit) ? Math.min(Math.max(Math.trunc(query.limit ?? 100),1),250) : 100;
  const data = await mysqlQuery<{
    id: string; slug: string; name: string; description: string | null; category: string | null;
    price_try: number | string; retail_price_try: number | string | null; duration_label: string | null;
    image_url: string | null; supplier_out_of_stock: unknown; unlimited_stock: unknown;
    avg_rating: number | string | null; review_count: number | string | null;
  }>(`SELECT id,slug,name,description,category,price_try,retail_price_try,duration_label,image_url,
    supplier_out_of_stock,unlimited_stock,avg_rating,review_count FROM products
    WHERE ${filters.join(" AND ")} ORDER BY sort_order ASC,orders_count DESC LIMIT ${limit}`,params);

  const ref = query.code ? `?ref=${encodeURIComponent(query.code)}` : "";

  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    category: p.category ?? null,
    price_try: Number(p.price_try),
    retail_price_try: p.retail_price_try === null ? null : Number(p.retail_price_try),
    duration_label: p.duration_label ?? null,
    image_url: p.image_url ?? null,
    in_stock: !bool(p.supplier_out_of_stock),
    unlimited_stock: bool(p.unlimited_stock),
    rating: Number(p.avg_rating ?? 0),
    review_count: Number(p.review_count ?? 0),
    url: `${baseUrl}/urun/${p.slug}${ref}`,
  }));
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Google Merchant benzeri basit RSS 2.0 ürün akışı. */
export function catalogToXml(items: CatalogItem[], baseUrl: string) {
  const entries = items
    .map(
      (i) => `    <item>
      <g:id>${esc(i.id)}</g:id>
      <title>${esc(i.name)}</title>
      <link>${esc(i.url)}</link>
      <description>${esc((i.description ?? i.name).slice(0, 500))}</description>
      <g:image_link>${esc(i.image_url ?? "")}</g:image_link>
      <g:price>${i.price_try.toFixed(2)} TRY</g:price>
      <g:availability>${i.in_stock ? "in stock" : "out of stock"}</g:availability>
      <g:product_type>${esc(i.category ?? "Dijital Ürünler")}</g:product_type>
      <g:condition>new</g:condition>
    </item>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>SiberLisans Ürün Kataloğu</title>
    <link>${esc(baseUrl)}</link>
    <description>Dijital lisans ve abonelik ürünleri</description>
${entries}
  </channel>
</rss>`;
}
