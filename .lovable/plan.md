## Sorun

Ekran görüntüsünde header floating bar'ı ekranın sağına taşıyor: 10 adet nav linki + sepet, bildirim, tema, admin ve hesabım butonları tek satıra sığmıyor. Sonuçta sağdaki "admin" ve "hesabım" alanı görünür alanın dışında kalıyor.

Sebep: `src/routes/__root.tsx` içindeki desktop nav (satır 237-248) 10 link içeriyor ve hepsi `whitespace-nowrap`; sağdaki aksiyon grubu `shrink-0` olduğu için bar `max-w-6xl` sınırını aşıp taşıyor.

## Çözüm

1. **Nav'ı önceliklendir** — barda sadece ana linkler kalsın:
   `anasayfa · ürünler · paketler · araçlar · çekiliş`
2. **Kalanlar "./daha" dropdown'ında** — `bayilik`, `bayi-paneli`, `blog`, `nasıl-çalışır`, `SSS` terminal temalı bir dropdown menüde toplansın (mevcut shadcn `DropdownMenu` ile, aynı mono/neon stil).
3. **Taşmayı yapısal olarak engelle** — bar container'ına `overflow-hidden` yerine nav'a `min-w-0` + `flex-1 justify-center`, aksiyon grubuna `shrink-0` korunur; böylece dar ekranda nav önce daralır, aksiyonlar hep görünür.
4. **Breakpoint ayarı** — nav `hidden xl:flex` yerine `hidden lg:flex` kalır ama `lg` aralığında dropdown'a daha çok link düşecek şekilde ikinci bir grup `hidden xl:flex` ile ayrılır.
5. **Doğrulama** — Playwright ile 1280px, 1440px ve 1920px genişliklerde ekran görüntüsü alıp admin + hesabım butonlarının tam göründüğünü ve yatay kaydırma olmadığını kontrol edeceğim.

## Teknik detay

Tek dosya değişiyor: `src/routes/__root.tsx` (`SiteHeader` bileşeni). Mobil `MobileMenu` içeriği aynı kalır, tüm linkler orada zaten mevcut. Yeni rota, veri veya backend değişikliği yok.
