# Roadmap

## MySQL (Hostinger) geçişi
- [x] PHP köprü + gizli anahtarlar
- [x] Şema + veri aktarımı (76 tablo, 1.561 kayıt)
- [x] Sunucu veri katmanı (src/lib/mysql.server.ts)
- [x] Ürün kataloğu (/urunler)
- [x] Giriş sistemi: auth_users / auth_sessions / auth_password_tokens,
      şifre (PBKDF2), çerez oturumu, kayıt, çıkış, /sifre-belirle
- [x] Anasayfa ürünleri + ürün detay/benzer ürün okumaları (HTTP 200 ve fiyat görüntüsü doğrulandı)
- [x] Ortak flash indirim okuması MySQL üzerinden
- [ ] Anasayfa bakiye okuması taşındı; oturumlu doğrulama bekliyor
- [ ] Yorum, soru-cevap, etiket, satış akışı, favori gibi alt bileşenler
- [x] Blog ve paketler okuma sayfaları MySQL üzerinden
- [ ] Çekiliş, bayilik (okuma sayfaları)
- [ ] Sepet / sipariş / ödeme
- [ ] Cüzdan, kupon, referans/partner, görev & puan
- [ ] Bildirimler, destek biletleri
- [ ] Admin paneli (ürün, key, sipariş, rapor)
- [ ] Postgres fonksiyon/trigger mantığının TypeScript'e taşınması (~200)
- [ ] 2FA ve Google girişi (eski sistemde Supabase'e bağlıydı, yeniden kurulacak)
