# Siber Lisans

PROMPT:

"SiberPHP markalı, tamamen siber/hacker temalı bir e-lisans satış platformu tasarla ve geliştir. Platform, yazılım lisans anahtarlarının (ürün key'leri) otomatik olarak satılıp teslim edildiği bir sistem olacak.

Genel Tasarım Konsepti:

Koyu (dark mode) arka plan üzerine neon yeşil/mavi/mor vurgu renkleri (matrix / cyberpunk esintili)

Glitch efektleri, terminal/konsol tarzı yazı tipleri (monospace font, örn. "JetBrains Mono", "Fira Code")

Glassmorphism (buzlu cam) kartlar, hafif neon glow / shadow efektleri

Arka planda hafif animasyonlu devre kartı (circuit board) desenleri, parçacık (particle) efektleri veya matrix yağmuru animasyonu

SiberPHP logosu header'da sabit, favicon ve marka rengi tutarlı kullanılmalı

Ana Sayfa (Müşteri Tarafı):

Hero bölümünde büyük başlık: "Lisansını Sanal Değil, Siber Güvenle Al" gibi vurgulu bir slogan

Satılan lisans/ürün kartları: ürün adı, açıklama, süre (aylık/yıllık/ömürlük), fiyat, stok durumu

Her ürün kartında "Satın Al" butonu → ödeme sayfasına yönlendirme

SSS (FAQ), nasıl çalışır (satın alma adımları), güvenlik rozetleri (SSL, güvenli ödeme vs.) bölümleri

Canlı destek / Telegram-WhatsApp yönlendirme butonu (opsiyonel)

Ödeme Sistemi (ÖNEMLİ – Kredi Kartı YOK):

Ödeme yöntemi sadece banka havalesi / EFT olacak, kredi kartı entegrasyonu kesinlikle olmayacak

Müşteri sipariş oluşturduğunda: sistem otomatik banka hesap bilgilerini (IBAN, alıcı adı, açıklama/referans kodu) gösterecek

Müşteri "Ödemeyi Yaptım" butonuna basıp dekont/makbuz görseli yükleyebilecek (dosya upload alanı)

Sipariş durumu: "Beklemede" → "Ödeme Kontrol Ediliyor" → "Onaylandı / Reddedildi" şeklinde takip edilecek

Admin, dekontu inceleyip onayladığında lisans anahtarı otomatik olarak müşteriye e-posta ve panel üzerinden iletilecek

(Opsiyonel gelişmiş özellik: banka API/webhook entegrasyonu ile otomatik EFT eşleştirme ve otomatik onay sistemi)

Admin Panel Özellikleri:

Siber temayla uyumlu, koyu temalı, sade ve fonksiyonel bir dashboard

Genel istatistikler: toplam satış, bekleyen siparişler, günlük/aylık gelir grafiği (chart.js/recharts tarzı grafikler)

Sipariş yönetimi: bekleyen havale bildirimlerini görüntüleme, dekont inceleme, onaylama/reddetme

Ürün/lisans yönetimi: yeni ürün ekleme, stok (lisans key) toplu yükleme (CSV/txt import), fiyat/süre düzenleme

Lisans key havuzu yönetimi: kullanılmamış/kullanılmış key listesi, otomatik key atama sistemi

Kullanıcı yönetimi: müşteri listesi, sipariş geçmişi, engelleme/yetkilendirme

Log ve güvenlik paneli: giriş denemeleri, IP kayıtları, şüpheli aktivite uyarıları (siber güvenlik temasına uygun)

Bildirim sistemi: yeni sipariş/ödeme geldiğinde admin'e anlık bildirim (ses efekti + görsel uyarı, hacker/terminal tarzı log akışı gibi)

Gelişmiş Teknoloji Özellikleri:

Otomatik lisans key üretimi/şifreleme (rastgele, benzersiz key algoritması)

2FA (iki faktörlü doğrulama) hem müşteri hem admin girişinde

Gerçek zamanlı sipariş durumu güncellemesi (WebSocket veya polling ile)

API desteği: harici sistemlerin lisans doğrulama sorgusu yapabilmesi için REST API endpoint

Otomatik e-posta/SMS bildirimleri (sipariş onayı, key teslimi, hatırlatmalar)

Responsive tasarım: mobil ve masaüstünde sorunsuz çalışmalı

Marka Kimliği:

Platformun her yerinde "SiberPHP" ismi ve logosu belirgin şekilde yer almalı

Footer'da "SiberPHP [yıl] - Güvenli Lisans Dağıtım Sistemi" gibi bir ibare

Renk paleti ve tipografi SiberPHP'nin siber/teknoloji imajını yansıtmalı (koyu arka plan, neon vurgular, monospace/teknolojik fontlar)"

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://siberlisans.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/52e254a6-918f-43c4-9617-e74771d5be97).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
