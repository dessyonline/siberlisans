/**
 * Bir ürün ilk kez satışa açıldığında tek seferlik "lansman" işlemleri:
 *  1) Telegram kanalına duyuru
 *  2) 3 günlük %10 lansman indirimi (indirimli fiyat ₺200 altına düşmez)
 *  3) Kategoriyi takip eden kullanıcılara site içi bildirim
 * products.launched_at ile aynı ürün iki kez duyurulmaz.
 */
const MIN_PRICE = 200;
const LAUNCH_PERCENT = 10;
const LAUNCH_DAYS = 3;

export async function launchProducts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { mysqlQuery, num } = await import("./mysql.server");
  const placeholders = ids.map(() => "?").join(",");
  const rows = await mysqlQuery<Record<string, unknown>>(
    `SELECT id, name, slug, price_try, description, category, image_url
       FROM products WHERE id IN (${placeholders}) AND active = 1 AND launched_at IS NULL`,
    ids,
  );

  for (const r of rows) {
    const id = String(r.id);
    try {
      await mysqlQuery("UPDATE products SET launched_at = NOW() WHERE id = ? AND launched_at IS NULL", [id]);
      const price = num(r.price_try) ?? 0;
      const name = String(r.name ?? "");
      const slug = String(r.slug ?? "");
      const category = (r.category as string | null) ?? null;

      // 2) Lansman indirimi — sadece indirimli fiyat ₺200 ve üstündeyse
      let percent = LAUNCH_PERCENT;
      const maxPercent = price > 0 ? Math.floor(((price - MIN_PRICE) / price) * 100) : 0;
      if (maxPercent < percent) percent = maxPercent;
      if (percent >= 3) {
        const ends = new Date(Date.now() + LAUNCH_DAYS * 86400000).toISOString();
        await mysqlQuery(
          "INSERT INTO flash_sales (id,product_id,discount_type,discount_value,starts_at,ends_at,is_active,label,created_at) VALUES (?,?,?,?,NOW(),?,1,?,NOW())",
          [crypto.randomUUID(), id, "percent", percent, ends, "🚀 Lansman indirimi"],
        );
      }

      // 1) Telegram
      try {
        const tg = await import("./telegram.server");
        await tg.postToChannel(
          tg.productAnnouncement({
            name,
            slug,
            priceTry: price,
            description: (r.description as string | null) ?? null,
            category,
            imageUrl: (r.image_url as string | null) ?? null,
          }),
        );
      } catch (e) {
        console.error("[launch] telegram", (e as Error).message);
      }

      // 3) Kategori takipçileri
      if (category) {
        const followers = await mysqlQuery<{ user_id: string }>(
          "SELECT user_id FROM category_follows WHERE category = ?",
          [category],
        );
        for (const f of followers) {
          await mysqlQuery(
            "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,NOW())",
            [
              crypto.randomUUID(),
              f.user_id,
              "new_product",
              `Takip ettiğin kategoride yeni ürün: ${name}`,
              percent >= 3 ? `${category} kategorisine eklendi. İlk ${LAUNCH_DAYS} gün %${percent} lansman indirimi!` : `${category} kategorisine eklendi.`,
              `/urun/${slug}`,
            ],
          );
        }
      }
    } catch (e) {
      console.error("[launch]", id, (e as Error).message);
    }
  }
}
