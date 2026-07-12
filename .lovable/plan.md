
Seçtiklerinden yola çıkarak 7 fazlı bir yol haritası. Öncelik sırasına göre gidilecek; her faz canlıya çıkabilir bağımsız parça.

## Faz 1 — Fatura Sistemi (Öncelik: yüksek, senin özel isteğin)

**Kullanıcı tarafı** (`/hesabim` içine "Faturalar" sekmesi + `/fatura/$orderId` sayfası)
- Onaylı her sipariş için otomatik fatura no: `SP-YYYYMM-000123` (yıl-ay + sıralı)
- Panelden PDF indir (client-side, `jspdf` + `jspdf-autotable` — mevcut logo, sipariş kalemleri, KDV %20 dahil/hariç ayrımı, kullanıcı adı-email)
- Kullanıcı fatura profili: ad soyad / şirket adı / VKN-TCKN / adres (opsiyonel, girmezse "Bireysel Müşteri")
- Fatura önizleme + "e-postaya gönder" butonu

**Admin tarafı** (`/admin/faturalar`)
- Tüm faturaları listeleme, arama (no, kullanıcı, tarih, tutar)
- Toplu CSV export (muhasebeci için: no, tarih, müşteri, tutar, KDV)
- Aylık PDF özet (tek sayfa)

**DB**: `invoices` tablosu (order_id, invoice_number, issued_at, buyer_name, buyer_tax_id, buyer_address, subtotal, vat_amount, total, pdf_snapshot jsonb), `profiles` üzerine `billing_name/tax_id/address` kolonları. `approve_order` RPC'sine fatura üretim adımı eklenecek.

## Faz 2 — Lisanslarım Paneli (`/hesabim/lisanslar`)

Tek ekranda:
- Kullanıcının tüm aktif/geçmiş lisansları — ürün logosu, key/mail, HWID durumu, kalan süre çubuğu, aktivasyon geçmişi
- Aksiyonlar: key kopyala, HWID sıfırla (limit dahilinde), süre uzat (yenile → sepet), transfer et, fatura indir
- Süresi <7 gün kalanlar için üstte uyarı bandı + tek tıkla yenile
- Filtreler: aktif / süresi doldu / iptal / tüm

## Faz 3 — Performans & SEO (site geneli)

- **Route-level head**: her ürün sayfasında Product JSON-LD (fiyat, availability, aggregateRating), Breadcrumb JSON-LD; blog'da Article
- **Sitemap zenginleştirme**: mevcut `sitemap.xml`'e `<image:image>`, `<lastmod>`, `changefreq` per-route
- **LCP preload**: anasayfa hero, ürün sayfası hero image `<link rel="preload">`
- **Image conversions**: `vite-imagetools` ile AVIF/WebP variant
- **SEO landing sayfaları**: en aranan 8 ürün için `/lisans/{slug}` ayrı içerik sayfası (özellikler, SSS, karşılaştırma, kullanıcı yorumları) — mevcut ürün sayfasından ayrı, SEO-optimize
- **`seo_chat--trigger_scan`** sonunda otomatik çalıştırılacak

## Faz 4 — Anasayfa & Ürün UI Yenileme (cyber-terminal)

- Hero: matrix rain arka planda daha yoğun, "system online" typing efekti, canlı istatistik ticker (bugün X kişi lisans aldı)
- Ürün kartı: hover'da 3D tilt, fiyat animasyonu, indirim varsa neon çerçeve
- Ürün detay: sol tarafta terminal-style özellik listesi (`> feature detected`), sağda büyük satın alma paneli, altta rakip fiyat karşılaştırma tablosu (retail_price zaten var)
- Sepet drawer: cyber-glitch aç/kapa animasyonu
- Mobil: bottom-nav (anasayfa · ürünler · sepet · hesabım) — mevcut sheet menüye ek

## Faz 5 — Onboarding + PWA + Bildirim (Kullanıcı deneyimi)

- **Onboarding**: kayıt sonrası ilk girişte 3 adımlı tur (`shepherd.js` yerine kendi cyber-tour componentimiz) — 1) ilk ürününü seç, 2) sepete ekle & öde, 3) uzantıyı bağla
- **PWA (installable)**: manifest + ikonlar + `theme-color`, "Ana ekrana ekle" prompt. Offline modu şimdilik yok (kullanıcı asıl istemedi).
- **Push bildirimleri**: browser Notification API + service worker (yalnızca push için) — stok geldi, flash başladı, sipariş onaylandı. Kullanıcı `notification_preferences`'tan tek tek açar.
- **Email digest**: haftalık cron `pg_cron` → `/api/public/hooks/weekly-digest` (favorilerdeki ürünlerin indirim/stok durumu)

## Faz 6 — Sadakat 2.0

- **Görev sistemi**: `user_missions` tablosu — "ilk yorumunu yaz +50p", "arkadaşını davet et +100p", "3 gün üst üste giriş yap +30p"
- **Leaderboard**: `/liderlik` — bu ay en çok puan kazananlar top 20 (anonim rumuz + rozet), tier boyaması
- **Sezonluk rozetler**: `badges` tablosuna `season` kolonu, admin panelden aç/kapa
- **Puan → indirim kuponu dönüşümü** (mevcut cüzdana ek): 500p = ₺10, 1000p = ₺25

## Faz 7 — Reseller/Bayi Paneli

- Rol: `reseller` (mevcut `app_role` enum'a eklenecek)
- Kademe fiyatlandırma: `products` üzerine `reseller_discount_pct` (varsayılan %15) — bayi girişinde tüm fiyatlar otomatik düşer
- Bayi paneli `/bayi`: aylık alım ciro, ödenmiş/bekleyen fatura, API anahtarı üretimi
- **Bayi API**: `/api/reseller/order` (Bearer bayi-key) — programmatic sipariş, key otomatik teslim, fatura otomatik oluştur
- Admin'de "Bayi Onayı" akışı — kayıt formu → admin manuel onay → rol atama

## Uygulama sırası

1. **Faz 1 (Fatura)** — DB migration + PDF üretimi + admin listesi (~1 tur)
2. **Faz 2 (Lisanslarım)** — sadece frontend + mevcut fonksiyonlar (~1 tur)
3. **Faz 3 (SEO/Perf)** — çoklu dosya, kritik ama görünmez (~1 tur)
4. **Faz 4 (UI yenileme)** — görsel etki en yüksek (~1-2 tur)
5. **Faz 5 (Onboarding + PWA + Push)** — service worker + manifest + tur (~1-2 tur)
6. **Faz 6 (Sadakat 2.0)** — DB heavy + leaderboard (~1 tur)
7. **Faz 7 (Bayi)** — en büyük iş, ayrı hesap tipi + API (~2 tur)

## Teknik notlar (özet)

- **Fatura PDF**: client-side `jspdf` (bundle boyutunu düşürmek için lazy import); pdf yığınında saklamıyoruz, `pdf_snapshot` sadece renderlenmesi için gerekli veri (kalemler, fiyatlar, buyer bilgisi)
- **KDV**: %20 dahil kabul edilecek — Türkiye standart; iki satır gösterim (matrah + KDV = toplam)
- **Push**: `web-push` VAPID, Firebase kullanmıyoruz — kendi VAPID anahtarımızı `generate_secret` ile üretiriz
- **Bayi API auth**: `reseller_api_keys` tablosu, hashed key (sha256), `has_role` benzeri `is_active_reseller_key` fonksiyonu
- **Fatura no üretimi**: sequence + `to_char(now(), 'YYYYMM')` — race-safe advisory lock ile

Onaylıyor musun? İstersen fazları at, ekle ya da sıra değiştir. Sipariş anlamlı geliyor mu, yoksa "önce X sonra Y" der misin?
