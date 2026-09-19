# Roadmap

## Güvenlik ve yalnızca MySQL (18 Eylül 2026)
- [ ] Ortam dosyası koruması: .gitignore platform tarafından salt okunur; değişiklik engellendi.
- [ ] PHP köprüsünü işleme özel yetkilerle sınırlama; Hostinger dağıtım erişimi gerekli.
- [x] Şifre/token/oturum için transaction kullanan PHP işlemi ve dört başarılı otomatik istemci testi eklendi.
- [ ] Hostinger köprü güncellemesini yükleme ve gerçek eşzamanlılık testi: dağıtım erişimi gerekli; eski köprüde şifre değişimi güvenli biçimde reddedilir.
- [x] Şifre bağlantıları doğrulanmış Gmail göndericisi üzerinden doğrudan kayıtlı e-postaya gönderiliyor.
- [ ] Gerçek ödeme/lisans teslimi testi; yetkili test hesabı ve ödeme test ortamı gerekli.
- [x] Üç yedek/geçici dosya ve yerel dışa aktarım betiği kaldırıldı; PHP kaynak dosyası public dışına taşındı. Eklenti ZIP paketi korundu.
- [x] Uygulama veri erişimleri MySQL'e taşındı; push, kripto ve e-posta kuyruğu dahil doğrudan eski veri istemcisi kullanımı kaldırıldı.

## Onaylanan giriş düzeltmesi
- [x] Şifre belirleme bağlantısı yalnızca kayıtlı e-posta adresine gönderiliyor.
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
- [x] Anasayfa bakiye okuması MySQL'e taşındı.
- [x] Yorumlar, soru-cevap, favoriler MySQL üzerinden
- [x] Etiket ve satış akışı alt bileşenleri MySQL'e taşındı.
- [x] Blog ve paketler okuma sayfaları MySQL üzerinden
- [x] Çekiliş ve bayilik sayfaları MySQL'e taşındı.
- [x] Sepet / sipariş / ödeme
- [x] Cüzdan, kupon, referans/partner, görev ve puan modülleri MySQL'e taşındı.
- [x] Bildirimler (zil + tercihler) ve destek biletleri MySQL üzerinden
- [x] Admin paneli (sipariş, blog, ürün, key ve kar/zarar raporu MySQL üzerinden)
- [ ] Postgres fonksiyon/trigger mantığının TypeScript'e taşınması (~200)
- [x] 2FA MySQL'e taşındı; Google ile doğrulanan kimlik yerel MySQL hesabı ve oturumuna bağlandı.

- [x] Cüzdan (bakiye, yükleme talebi, admin onay/ret, bakiye ile ödeme) MySQL'e taşındı
- [x] Ödeme sayfası (sipariş detayı, banka bilgisi, bakiye, çapraz satış) MySQL'e taşındı
- [x] Sipariş oluşturma/sepet/onay/red/iptal + kupon + flash indirim (orders.functions.ts) MySQL'e taşındı
- [x] Admin sipariş, blog, ürün, key ve kar/zarar yönetimi

## MySQL geçişini tamamlama — devam
- [x] Stok bildirimi kayıt/iptal/durum işlemleri MySQL oturumuna taşındı.
- [x] Flash indirim yönetimi MySQL yönetici yetkisine taşındı.
- [x] Referansla sipariş takibi ve dış katalog akışı MySQL'e taşındı; özel yönetici notları halka açılmaz.
- [x] Uygulama içindeki kalan modüller MySQL veri katmanına taşındı; doğrudan eski veri istemcisi çağrısı kalmadı.

- [x] Google girişi: kendi OAuth istemcisi ve sabit üretim dönüş alan adıyla çalışıyor.
