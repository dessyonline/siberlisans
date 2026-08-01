Cihaz Adı Girişi (2FA Doğrulama Ekranı)

## Hedef
Kullanıcı 2FA doğrulama ekranında "bu cihazı hatırla" seçeneğini işaretlediğinde, cihaza kendi belirlediği bir ad verebilsin. Ad girilmezse mevcut otomatik tarayıcı/OS etiketi kullanılmaya devam etsin.

## Yapılacaklar

1. Metin kutusu
   - `MfaChallenge` içindeki "bu cihazı hatırla" onay kutusu işaretlendiğinde hemen altında bir cihaz adı input alanı açılsın.
   - Placeholder olarak otomatik algılanan etiket gösterilsin (ör. "Chrome · Windows").
   - Onay kutusu tekrar kaldırılırsa alan kapansın ve girilen değer sıfırlansın.

2. Boş bırakma davranışı
   - Alan boşsa veya sadece boşluk içeriyorsa `getDeviceLabel()` sonucu kullanılsın — mevcut davranış korunur.

3. Doğrulama kuralları
   - Maksimum 40 karakter (input üzerinde `maxLength`, ayrıca kaydetmeden önce kesme).
   - İzinli karakterler: harf (Türkçe dahil), rakam, boşluk, tire, alt tire, nokta. Diğer karakterler yazarken filtrelensin.
   - Kaydetmeden önce `trim()` uygulanır; filtre sonrası boş kalırsa otomatik etiket devreye girer.

4. Kaydetme yolu
   - Doğrulama başarılı olduktan sonra cihaz adı, güvenilir cihaz kaydı ile birlikte sunucuya gönderilsin.
   - `trustDeviceRemote` isteğe bağlı bir `label` parametresi alacak şekilde genişletilir; verilmezse otomatik etiket kullanılır.
   - Aynı karakter/uzunluk kuralı gönderim öncesi tekrar uygulanır (istemci tarafı ikinci kontrol).

## Dosyalar
- `src/components/security/MfaChallenge.tsx` — cihaz adı input alanı, filtreleme ve state
- `src/lib/trusted-device.ts` — `trustDeviceRemote` için opsiyonel `label` parametresi ve ad temizleme yardımcı fonksiyonu
