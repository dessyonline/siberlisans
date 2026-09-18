# Roadmap

## Güvenlik ve yalnızca MySQL (18 Eylül 2026)
- [ ] Ortam dosyası koruması: .gitignore platform tarafından salt okunur; değişiklik engellendi.
- [ ] PHP köprüsünü işleme özel yetkilerle sınırlama; Hostinger dağıtım erişimi gerekli.
- [ ] Şifre/token/oturum değişikliğini atomik yapma ve otomatik test ekleme.
- [ ] Şifre bağlantılarını e-posta kanalından gönderme; gönderici bağlantısı gerekli.
- [ ] Gerçek ödeme/lisans teslimi testi; yetkili test hesabı ve ödeme test ortamı gerekli.
- [ ] Gereksiz herkese açık yedekleri kaldırma; kullanılan eklenti paketini koruma.
- [ ] Kalan eski veri erişimlerini MySQL'e taşıma; yetki politikalarını koruma.

## Onaylanan giriş düzeltmesi
- [ ] Şifre belirleme bağlantısını yalnızca doğrulanmış hesap sahibine ulaştırma (e-posta gönderimi/hesap doğrulama kanalı gerekli).
- [x] Herkese açık şifre bağlantısı kapatıldı; Telegram teslim hataları artık başarı olarak gösterilmiyor.
- [x] use-mobile.tsx kaynak kontrolü: belirtilen satır boş, React içe aktarımı mevcut; giriş sayfası tarayıcıda açıldı.
- [ ] Gerçek hesapla şifre belirleme ve giriş testi: hesap sahibine doğrulanmış teslim kanalı bekliyor; giriş ekranı ve kaynak güvenlik kontrolleri geçti.

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
- [x] Admin paneli (sipariş, blog, ürün, key ve kar/zarar raporu MySQL üzerinden)
- [ ] Postgres fonksiyon/trigger mantığının TypeScript'e taşınması (~200)
- [ ] 2FA ve Google girişi (eski sistemde Supabase'e bağlıydı, yeniden kurulacak)

- [x] Cüzdan (bakiye, yükleme talebi, admin onay/ret, bakiye ile ödeme) MySQL'e taşındı
- [x] Ödeme sayfası (sipariş detayı, banka bilgisi, bakiye, çapraz satış) MySQL'e taşındı
- [x] Sipariş oluşturma/sepet/onay/red/iptal + kupon + flash indirim (orders.functions.ts) MySQL'e taşındı
- [x] Admin sipariş, blog, ürün, key ve kar/zarar yönetimi
