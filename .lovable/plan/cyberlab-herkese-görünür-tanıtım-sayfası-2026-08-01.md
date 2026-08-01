# CyberLab herkese görünür tanıtım sayfası

## Hedef
`/cyberlab` adresini herkese açık bir tanıtım/landing sayfasına çevirmek; erişimi olan kullanıcılara aynı sayfada tek tıkla panel açma alanı göstermek; erişimi olmayanlara ise özellikler, paketler ve satın alma CTA'sı sunmak.

## Yapılacaklar

1. **Route yapısını değiştir**
   - Mevcut `src/routes/_authenticated/cyberlab.tsx` dosyasını `src/routes/cyberlab.tsx` altına taşı (public route).
   - Route string'i `createFileRoute("/cyberlab")` olacak.
   - Sayfa girişte kullanıcının oturum/CyberLab erişim durumuna göre iki farklı yüzey gösterecek.

2. **İki durumlu içerik**
   - **Erişim aktif**: Mevcut launch paneli (token üretme, bitiş tarihi, CyberLab'i aç butonu).
   - **Erişim yok / giriş yapılmamış**: Hero, özellik listesi, öne çıkan paketler (ürünlerden `grants_app = 'cyberlab'` olanlar), SSS ve satın alma CTA.

3. **Header/mobil menü linki**
   - `src/components/CyberlabNavLink.tsx` artık her zaman `./cyberlab` linkini gösterecek.
   - Mevcut "erişim varsa göster" mantığı kaldırılacak; sadece stil/etiket korunacak.
   - Mobil menüde de her zaman görünecek.

4. **Anasayfa hızlı erişim**
   - `src/routes/index.tsx` içindeki QuickAccessCards bölümüne CyberLab kartı eklenecek.

5. **SEO meta**
   - Public route head()'inde CyberLab'a özel title, description, og ve twitter tag'leri tanımlanacak.

## Teknik detaylar
- Public route olduğu için `getCyberlabAccess` çağrısı sadece kullanıcı giriş yapmışsa yapılacak; giriş yoksa erişim yok olarak kabul edilecek.
- Ürün listesi için `supabase` browser client ile `products` tablosundan `grants_app = 'cyberlab' AND active = true` sorgusu yapılacak.
- Mevcut authenticated launch sayfasındaki token/SSO mantığı korunacak; sadece route konumu ve koşullu render değişecek.
