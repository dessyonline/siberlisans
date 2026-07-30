## Amaç

Mailler şu an varsayılan bir gönderici adresinden çıkıyor; SPF/DKIM imzası `siberlisans.com`'a ait olmadığı için Gmail/Outlook doğrudan spam'e atıyor. Çözüm iki aşamalı: önce kendi alan adından imzalı gönderim, sonra şablonların spam filtrelerine uygun hale getirilmesi.

## Aşama 1 — Gönderici alan adı (senin yapacağın kısım)

TurkTicaret.Net panelinde NS kaydı desteği var, yani transfer/taşıma gerekmiyor.

1. Sohbetteki **"E-posta alan adını kur"** butonuna tıkla.
2. Açılan ekranda gönderici alt alan adını gir (öneri: `notify.siberlisans.com`).
3. Ekran sana **2 adet nameserver** değeri gösterecek (`nsX.lovable.cloud` biçiminde — kesin değerleri oradan al, tahmin etme).
4. TurkTicaret.Net → Domain İşlemleri → DNS Yönetimi → **Kayıt Oluştur**:
   - **Tür**: NS
   - **Ad**: `notify` (yalnızca alt alan adı kısmı)
   - **Veri**: kurulum ekranındaki 1. nameserver
   - **TTL**: 1 Saat → Kayıt Oluştur
5. Aynı işlemi 2. nameserver için tekrarla (Ad yine `notify`).
6. Mevcut `siberlisans.com` A kaydına ve `_lovable` TXT kaydına **dokunma** — site erişimi onlara bağlı.

DNS yayılması 15 dk ile 72 saat arası sürebilir. Doğrulama otomatik ilerler, durumu Cloud → Emails'ten izleyebilirsin.

## Aşama 2 — Ben yapacağım (DNS beklemeden başlanabilir)

**E-posta altyapısı**
- Kuyruk, gönderim logu, bounce/şikayet listesi ve otomatik yeniden deneme altyapısını kur.
- Auth mailleri (kayıt onayı, şifre sıfırlama, magic link, e-posta değişikliği) için özel şablon sistemini devreye al.

**Spam skorunu düşüren şablon revizyonu**

Mevcut/yeni tüm şablonlar şu kurallara göre yeniden yazılacak:

| Sorun | Düzeltme |
| --- | --- |
| Spam tetikleyici dil | "BEDAVA", "KAZANDINIZ", çoklu ünlem, tamamı büyük harf başlıklar temizlenir |
| Görsel ağırlıklı içerik | Metin/görsel dengesi metin lehine, tek logo + inline stil |
| Çoklu CTA | Her mailde tek net eylem butonu |
| Kısa/boş içerik | Anlamlı preview text + açıklayıcı gövde |
| Kimlik belirsizliği | Alt bilgide marka adı, site linki ve iletişim bilgisi |
| Abonelikten çıkma | Sistem tarafından otomatik eklenen tek tık footer (elle eklenmez) |

**Tasarım yönü**: e-posta istemcileri koyu temayı ve modern CSS'i desteklemediği için gövde beyaz zeminde kalır; marka kimliği neon yeşil (#00ff9d) aksan renkleri, JetBrains Mono etiketler ve ince terminal çerçevesiyle verilir. Mobil uyumlu tek kolon, 600px genişlik.

**Kapsanacak şablonlar**
- Kayıt onayı / e-posta doğrulama
- Şifre sıfırlama
- Magic link ve yeniden kimlik doğrulama
- E-posta adresi değişikliği
- Davet

Sipariş/teslimat gibi uygulama mailleri de aynı tasarım diline geçirilir (ayrı adım olarak, istersen).

## Teknik notlar

- Gönderim, alan adı doğrulandıktan sonra otomatik başlar; öncesinde kurulan şablonlar bekler, veri kaybı olmaz.
- Kuyruk yeniden deneme ve DLQ mantığıyla çalışır; başarısız gönderimler `email_send_log` üzerinden izlenebilir.
- Publish sonrası canlı ortamın kuyruk işleyicisi otomatik devreye girer.
- `www.siberlisans.com` CNAME konusu bu plana dahil değil; talebin üzerine şimdilik dokunulmayacak.
