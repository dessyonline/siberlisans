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
- [x] Yorumlar, soru-cevap, favoriler MySQL üzerinden
- [ ] Etiket ve satış akışı alt bileşenleri
- [x] Blog ve paketler okuma sayfaları MySQL üzerinden
- [ ] Çekiliş, bayilik (okuma sayfaları)
- [x] Sepet / sipariş / ödeme
- [ ] Cüzdan, kupon, referans/partner, görev & puan
- [x] Bildirimler (zil + tercihler) ve destek biletleri MySQL üzerinden
- [ ] Admin paneli (sipariş yönetimi ve blog tamam; ürün, key, rapor kaldı)
- [ ] Postgres fonksiyon/trigger mantığının TypeScript'e taşınması (~200)
- [ ] 2FA ve Google girişi (eski sistemde Supabase'e bağlıydı, yeniden kurulacak)

- [x] Cüzdan (bakiye, yükleme talebi, admin onay/ret, bakiye ile ödeme) MySQL'e taşındı
- [x] Ödeme sayfası (sipariş detayı, banka bilgisi, bakiye, çapraz satış) MySQL'e taşındı
- [x] Sipariş oluşturma/sepet/onay/red/iptal + kupon + flash indirim (orders.functions.ts) MySQL'e taşındı
- [x] Admin sipariş yönetimi ve blog yönetimi
