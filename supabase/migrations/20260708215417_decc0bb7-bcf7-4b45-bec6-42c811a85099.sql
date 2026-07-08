
INSERT INTO public.blog_posts (slug, title, excerpt, content, tags, cover_url, published_at) VALUES
(
  'siber-guvenlik-101-baslangic-rehberi',
  'Siber Güvenlik 101: Yeni Başlayanlar İçin Rehber',
  'Kişisel dijital güvenliğinizi artırmak için bilmeniz gereken temel kavramlar, tehditler ve pratik önlemler.',
  E'# Siber Güvenlik 101\n\nİnternette geçirdiğimiz her dakika, dijital ayak izimizi biraz daha büyütüyor. Bu rehber, siber güvenliğin temellerini sade bir dille anlatıyor.\n\n## Temel Tehditler\n\n- **Phishing (Oltalama):** Sahte e-posta ve web siteleri ile bilgi çalma girişimleri.\n- **Malware:** Cihazınıza zarar vermek veya veri çalmak için tasarlanmış yazılımlar.\n- **Ransomware:** Dosyalarınızı şifreleyip fidye isteyen zararlı yazılımlar.\n- **Sosyal Mühendislik:** İnsan zaafiyetlerini kullanan manipülasyon teknikleri.\n\n## Temel Önlemler\n\n1. **Güçlü ve benzersiz şifreler** kullanın. Şifre yöneticisi şart.\n2. **İki faktörlü doğrulama (2FA)** her yerde açık olsun.\n3. İşletim sistemi ve uygulamalarınızı **güncel** tutun.\n4. Bilinmeyen bağlantılara **tıklamayın**.\n5. Halka açık Wi-Fi kullanırken **VPN** tercih edin.\n\n## Sonuç\n\nSiber güvenlik bir ürün değil, bir alışkanlıktır. Küçük ama düzenli adımlar, büyük saldırıları önler.',
  ARRAY['siber-güvenlik','başlangıç','rehber'],
  'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80',
  now()
),
(
  'guclu-sifre-olusturma-ve-sifre-yoneticileri',
  'Güçlü Şifre Oluşturma ve Şifre Yöneticileri',
  '12345 devri bitti. Kırılamaz şifreler nasıl oluşturulur ve neden şifre yöneticisi kullanmalısınız?',
  E'# Güçlü Şifre Oluşturma\n\nOrtalama bir kullanıcının 100+ hesabı var. Hepsi için farklı ve güçlü şifre üretmek insan hafızasının işi değil.\n\n## İyi Bir Şifrenin Özellikleri\n\n- En az **16 karakter**\n- Büyük/küçük harf, rakam ve özel karakter karışımı\n- Sözlükte olmayan, tahmin edilemez kombinasyon\n- Her hesap için **farklı**\n\n## Şifre Yöneticileri\n\n**Bitwarden**, **1Password**, **KeePassXC** gibi araçlar tüm şifrelerinizi şifreli bir kasada saklar. Sadece **tek bir ana şifre** hatırlarsınız.\n\n## Passkey Devri\n\nApple, Google ve Microsoft artık şifresiz **passkey** teknolojisini destekliyor. Cihazınızın biyometriği ile giriş yapabilirsiniz.\n\n## Sonuç\n\nBir şifre yöneticisi kurun, tüm hesaplarınızı 30 gün içinde geçirin. Hayatınız değişecek.',
  ARRAY['şifre','güvenlik','2fa'],
  'https://images.unsplash.com/photo-1633265486064-086b219458ec?w=1200&q=80',
  now()
),
(
  'phishing-saldirilarindan-korunma-yollari',
  'Phishing Saldırılarından Korunmanın 7 Yolu',
  'Sahte e-postalar ve dolandırıcılık siteleri artıyor. İşte oltalama saldırılarını tanımanın ve önlemenin yolları.',
  E'# Phishing Nedir?\n\nPhishing (oltalama), saldırganların meşru kurumları taklit ederek kullanıcı bilgilerini çalma yöntemidir.\n\n## 7 Altın Kural\n\n1. **URL''yi kontrol edin.** apple.com ile appie.com farklıdır.\n2. **Aciliyet dilinden şüphelenin.** "Hesabınız 24 saat içinde kapatılacak" tipik oltalama tuzağıdır.\n3. **E-posta gönderenini doğrulayın.** Görünen ad değil, gerçek adres önemlidir.\n4. **Ek dosyaları açmayın.** .zip, .exe, makro içeren dosyalar riskli.\n5. **Bağlantı üzerine gelin** — gerçek URL sol altta görünür.\n6. **Kurumlar şifre istemez.** Banka size hiçbir zaman şifrenizi sormaz.\n7. **2FA açın.** Şifreniz çalınsa bile hesabınız korunur.\n\n## Şüphelendiyseniz\n\nBağlantıya tıklamayın. Kurumun resmi web sitesine adres çubuğundan gidin. Şüpheli e-postayı `report-phishing@` adresine iletin.',
  ARRAY['phishing','e-posta','güvenlik'],
  'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&q=80',
  now()
),
(
  'vpn-nedir-nasil-secilir',
  'VPN Nedir, Ne İşe Yarar ve Nasıl Seçilir?',
  'VPN teknolojisinin temelleri, gerçekten neye yaradığı ve ücretsiz VPN''lerin gizli maliyetleri.',
  E'# VPN (Virtual Private Network)\n\nVPN, internet trafiğinizi şifreli bir tünelden geçirerek IP adresinizi gizleyen bir teknolojidir.\n\n## Ne İşe Yarar?\n\n- Halka açık Wi-Fi''de **trafik dinlemeyi** engeller\n- IP adresinizi gizleyerek **coğrafi kısıtlamaları** aşar\n- ISS''nizin trafiğinizi izlemesini zorlaştırır\n\n## Ne İşe Yaramaz?\n\n- Sizi **tamamen anonim** yapmaz\n- Kötü amaçlı yazılımlardan korumaz\n- Sitelerin çerezleri ile takip edilmesini engellemez\n\n## Ücretsiz VPN Tuzağı\n\nÜcretsiz VPN''ler genelde verinizi satar. "Ürün ücretsizse, ürün sizsiniz."\n\n## Neye Bakmalı?\n\n- **No-log** politikası (bağımsız denetimli)\n- **WireGuard** veya OpenVPN protokolü\n- **Kill switch** özelliği\n- Sunucu çeşitliliği ve hız\n\nGüvenilir seçenekler: Mullvad, ProtonVPN, IVPN.',
  ARRAY['vpn','gizlilik','ağ'],
  'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=1200&q=80',
  now()
),
(
  'yazilim-lisansi-satin-alirken-dikkat-edilmesi-gerekenler',
  'Yazılım Lisansı Satın Alırken Dikkat Edilmesi Gerekenler',
  'Ucuz lisans tuzaklarına düşmeden, güvenli ve legal yazılım almanın yolları.',
  E'# Doğru Lisans Nasıl Seçilir?\n\nİnternette Windows 10 anahtarları 20 TL''ye satılıyor. Peki bu güvenli mi?\n\n## Lisans Türleri\n\n- **Retail (FPP):** Bireysel kullanıcılara satılan, taşınabilir lisanslar.\n- **OEM:** Yalnızca ilk kurulduğu cihaza bağlı lisans.\n- **Volume (MAK/KMS):** Kurumlara toplu satılan lisanslar. Bireysel satışı **yasal değildir**.\n- **NFR (Not For Resale):** Satılmak üzere değil, tanıtım amaçlıdır.\n\n## Kırmızı Bayraklar\n\n- Piyasa fiyatının çok altında Volume/MAK anahtarı\n- Fatura verilmeyen satışlar\n- İade politikası olmayan siteler\n- Yalnızca kripto ile ödeme kabul edenler\n\n## Neden SiberPHP?\n\nSiberPHP tüm lisansları **doğrulanmış tedarikçilerden** temin eder. Her satışta fatura, aktivasyon garantisi ve 7/24 destek sunar.\n\nUcuz aldığınızı sandığınız lisans, hesabınızı riske atabilir. Emin olmadan almayın.',
  ARRAY['lisans','yazılım','satın-alma'],
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80',
  now()
)
ON CONFLICT (slug) DO NOTHING;
