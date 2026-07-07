## Durum

`phpsiber@gmail.com` hesabı sistemde henüz kayıtlı değil. Admin rolü verebilmek için önce bu hesabın var olması gerekiyor.

## Adımlar

1. **Siz yaparsınız:** `phpsiber@gmail.com` ile `/auth` sayfasından normal bir hesap açın (şifreyi kendiniz belirleyin). Onaydan sonra bana "kayıt oldum" deyin.
2. **Ben yaparım:** Onay gelince tek bir migration çalıştırıp `user_roles` tablosuna bu kullanıcı için `admin` rolü ekleyeceğim:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'phpsiber@gmail.com'
   ON CONFLICT DO NOTHING;
   ```
3. **Doğrulama:** Hesap `/auth`'tan giriş yaptığında `/admin` panelinin açıldığını göreceksiniz.

## Notlar

- Şifreyi ben belirleyemem ve göremem; kayıt sırasında siz seçersiniz.
- Bu yaklaşım güvenli: rol atama sunucu tarafında migration ile yapılıyor, açığa çıkan bir endpoint eklenmiyor.
- İleride yeni admin eklemek isterseniz mevcut admin panelinin **Kullanıcılar** sekmesinden "rol ver" butonuyla yapabilirsiniz — bu sadece ilk admin için gerekli manuel adım.
