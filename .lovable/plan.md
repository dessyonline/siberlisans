# Taşınan Hesapların Giriş Düzeltmesi

## Amaç
Taşınmış hesapların ayrı bir şifre sıfırlama adımında takılmasını gidermek ve eksik aktarım algısını doğrulamak; görünümü değiştirmemek.

## Yapılacaklar
- Bildirilen `use-mobile.tsx` satırının gerçek bir TypeScript hatası olmadığını kaynak ve derleyici çıktısıyla doğrulamak.
- MySQL'e taşınan hesaplarda şifre özeti bulunmadığı için oluşan giriş engelini güvenli bir ilk erişim akışına çevirmek.
- Şifre belirleme bağlantısının yalnızca hesap sahibine ulaşacağı doğrulanmış kanal üzerinden çalışmasını sağlamak; hesap ele geçirmeye açık, e-postayı bilen herkese bağlantı gösteren davranışı kaldırmak.
- Giriş, şifre belirleme ve oturum oluşturma yollarını test etmek.
- MySQL geçiş yol haritasındaki gerçekten açık kalan modülleri korumak; bu hata düzeltmesini “tüm taşıma tamamlandı” diye yanlış raporlamamak.

## Teknik not
Eski kullanıcıların parola özeti dışa aktarılmadığından eski parolalar geri getirilemez. Çözüm, mevcut hesabı doğruladıktan sonra yeni parola belirletmek ve ardından MySQL oturumu oluşturmaktır; bilinmeyen eski parolayı kopyalamak mümkün değildir.
