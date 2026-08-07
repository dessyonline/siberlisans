# Kalıcı Kullanıcı Hesapları

## Mimari

- Kimlik doğrulama: Flask imzalı, `HttpOnly` ve `SameSite=Lax` oturum cookie'si
- Kullanıcı deposu: SQLite (`cyberlab.db`), foreign key ve WAL modu
- Parola: Werkzeug `scrypt` hash; düz parola hiçbir zaman saklanmaz veya loglanmaz
- Yetkilendirme: kullanıcı rolü yalnız sunucu veritabanından okunur; yeni kayıtlar `student` olur
- CSRF: profil, parola, çıkış ve ilerleme yazma uç noktalarında oturuma bağlı token
- Sahiplik: profil, aktivite ve Academy ilerlemesi her zaman oturumdaki `user_id` ile sorgulanır
- Oturum iptali: parola değişikliğinde `session_version` artırılarak diğer açık oturumlar kapatılır

## Kullanıcı Akışları

- Hesap oluşturma
- Kullanıcı adı veya e-posta ile giriş
- Oturum geri yükleme ve güvenli çıkış
- Profil adı ve biyografi güncelleme
- Mevcut parolayı doğrulayarak parola değiştirme
- Kullanıcıya özel ders ilerlemesi ve XP
- Giriş ve araç kullanım istatistikleri
- Son etkinlik geçmişi
- Admin yönetim merkezi: tüm kullanıcılar, toplam istatistikler, etkinlik akışı ve rol yönetimi

## API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET/PATCH /api/profile`
- `PUT /api/profile/password`
- `GET/PUT /api/academy/progress`
- `GET /api/admin/overview` (yalnız admin)
- `PATCH /api/admin/users/:id/role` (yalnız admin)

## Roller

- `student`: kendi profilini, istatistiklerini ve Academy ilerlemesini görür.
- `instructor`: öğrenci yetkilerine ek olarak eğitmen rol kimliğine sahiptir; eğitmen araçları sonraki fazda ayrıştırılabilir.
- `admin`: bütün kullanıcı ve sistem istatistiklerini görür, kullanıcı rollerini yönetir ve tüm standart özelliklere erişir.
- `is_founder`: admin yetkilerine sahip, mavi siber kalkanla doğrulanan kurucu hesabıdır; rolü yönetim panelinden kaldırılamaz.

Rol değişikliği hedef kullanıcının mevcut oturumlarını geçersiz kılar. Admin kendi admin rolünü panelden kaldıramaz.

## Yapılandırma

- `CYBERLAB_SECRET_KEY`: dağıtım ortamında zorunlu, güçlü oturum imza anahtarı
- `CYBERLAB_HTTPS=1`: HTTPS dağıtımında Secure cookie'yi etkinleştirir
- `CYBERLAB_DB_PATH`: isteğe bağlı veritabanı yolu

## Dağıtım Notu

Yerel geliştirmede `server.py` çalışır. İnternete açık üretim kurulumu için TLS terminasyonu, üretim WSGI sunucusu, yedekleme, e-posta doğrulama/parola sıfırlama servisi ve merkezi hız sınırlama deposu ayrıca kurulmalıdır.
