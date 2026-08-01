Güvenilir Cihaza Özel Ad Belirleme

## Hedef
Kullanıcı "bu cihazı hatırla" dediğinde otomatik tarayıcı/OS etiketi yerine kendi belirlediği anlamlı bir cihaz adı girebilsin. Daha sonra /guvenlik sayfasında bu adı görebilsin ve değiştirebilsin.

## Yapılacaklar

1. Cihaz adı girişi (2FA doğrulama ekranı)
   - `MfaChallenge` içinde "bu cihazı hatırla" işaretlendiğinde altında açılan bir metin kutusu göster.
   - Kutucuk boş bırakılırsa otomatik tarayıcı/OS etiketi (`getDeviceLabel()`) kullanılmaya devam etsin.
   - Maksimum 40 karakter, sadece harf, rakam, boşluk, tire, alt tire ve nokta izin verilsin (XSS önlemi).

2. Sunucu tarafı güncellemesi
   - `trust_current_device` RPC'sine `_label` parametresi zaten var; istemciden gönderilen özel etiket buraya aktarılacak.
   - Etiket veritabanına kaydedilirken `trim()` ve yukarıdaki karakter sınırlaması uygulansın, uzunluk 60 karakterle sınırlandırılsın.

3. İstemci yardımcı fonksiyonları
   - `trustDeviceRemote(userId, days, label?)` imzasına isteğe bağlı `label` parametresi eklensin.
   - `MfaChallenge` bu fonksiyonu çağırırken kullanıcının girdiği adı iletsin.

4. /guvenlik yönetim ekranı
   - Kayıtlı cihaz listesinde her cihazın adı görünsün.
   - Her cihazın yanına "adı düzenle" butonu eklensin; tıklayınca inline input açılsın, kaydet / iptal seçenekleri olsun.
   - Düzenleme sunucuya `update_trusted_device_label` RPC'si ile kaydedilsin; aynı validasyon kuralları geçerli olsun.

5. Güvenlik ve doğrulama
   - Cihaz adı hem istemci hem sunucu tarafında validasyonlu olsun.
   - HTML/special karakter encode edilsin, `dangerouslySetInnerHTML` kullanılmasın.
   - 2FA doğrulama başarılı olduktan sonra hatırlatma işlemi yapılsın; doğrulama öncesi cihaz adı sadece state'te tutulsun.

## Dosyalar
- `src/components/security/MfaChallenge.tsx` — cihaz adı input alanı
- `src/lib/trusted-device.ts` — `trustDeviceRemote` ve yeni düzenleme fonksiyonu
- `src/routes/_authenticated/guvenlik.tsx` — listede ad gösterimi ve düzenleme UI
- Supabase migration — `trust_current_device` validasyonu ve `update_trusted_device_label` RPC
