# Academy Learning Library Progress

## Status: Phase 4 - Completed

## Phase Progress

### Phase 1: Temel Eğitim Arşivi

**Status:** Completed

- 7 sıralı kurs ve 28 ayrıntılı ders eklendi.
- Paylaşılan arşivlerdeki görünen başlıklar dış bağlantı olmadan özgün Türkçe derslere dönüştürüldü.

### Phase 2: Academy Arayüzü

**Status:** Completed

- Arama, okuyucu, komut kopyalama, XP, ilerleme, kaynak görünümü ve PDF yazdırma tamamlandı.

### Phase 3: İçerik Yönetimi

**Status:** Completed

### Phase 4: Öğrenme Sistemi

**Status:** Completed

## Session Log

### 2026-06-21

- Academy veri modeli yeniden kuruldu.
- Başlangıç sırası kullanıcı geri bildirimiyle CMD ve işletim sistemi temellerinden başlatıldı.
- Mevcut `server.py` sonundaki bozuk yinelenen blok kaldırılarak sunucu tekrar derlenebilir hale getirildi.
- JavaScript sözdizimi, Python derlemesi ve ders veri bütünlüğü doğrulandı.
- Academy ilerlemesi tarayıcı `localStorage` alanından kullanıcıya ait sunucu veritabanına taşındı.
- Kalıcı kayıt, oturum, profil, XP ve kişisel istatistik sistemi eklendi.
- Her derse dört soruluk, en az %75 başarı isteyen quiz kapısı eklendi; quiz geçilmeden ders ve XP tamamlanmıyor.
- Her ders konusu komut ve uygulama senaryosu örnekleriyle desteklendi.
- Quiz deneme sayısı, geçen quiz ve başarı ortalaması kullanıcı profiline eklendi.
- Drive arşivindeki gerçek 18 modül sırası korunarak `Certified Penetration Tester` kursu oluşturuldu; dış bağlantı arayüze eklenmedi.
- Kurs 90 ayrıntılı konu bölümü, 53 güvenli komut örneği, 18 laboratuvar görevi ve quiz/XP doğrulamasıyla zenginleştirildi.
- Önceki genel 25 Blue Team / 30 Red Team şablon arşivi kaldırıldı.
- Arşivdeki 57 dersin tamamı beş sayfalık okuyucu standardına taşındı; toplam 285 eğitim sayfası oluşturuldu.
- Her ders öğrenme hedefleri, temel anlatım, derinleşme/örnekler, güvenli laboratuvar ve özet/quiz sırasına ayrıldı.
- Eksik eski ders alanları içerik normalizasyonuyla tamamlandı ve quiz yalnızca beşinci sayfada açılacak şekilde düzenlendi.
- Ders yolu sunucu ilerlemesine bağlı olarak kilitlendi; bir dersin quizi geçilmeden sonraki ders ve sonraki kurs açılamıyor.
- Hacker Arise WiFi Hacking v4 arşivindeki 32 kaynak başlık sırası korunarak Türkçe, beş sayfalık ve quizli kablosuz güvenlik kursuna dönüştürüldü; mevcut içerik silinmedi.
- WiFi kursunun 32 dersine konuya özgü gerçek araç komutları, kurulum/iş akışı, çıktı yorumlama ve teknik teslimler eklendi; kaynak Radar arşivindeki Python araçları da WF25/WF27 laboratuvarlarına işlendi.
- Rana Khalil Web Security Academy Series arşivindeki 21 modül, 186 video ve 1 PDF eksiksiz envanterlenerek 187 ayrı beş sayfalık teknik ders ve quiz olarak eklendi; mevcut 93 ders korundu.
- Kurucu hesabı için eğitim kilitleri kaldırıldı; kurucu 280 derse doğrudan erişebilirken normal kullanıcıların sıralı quiz ön koşulu korunuyor.
- Kurucu profili Boss/Founder vitrini, 10 neon rozet, 8 uzmanlık göstergesi, root/kullanıcı/Academy yetki kartları ve otomatik kurucu biyografisiyle genişletildi.

### 2026-06-23

- Ders bazlı gerçek soru bankası `quiz_questions.lesson_key` ile sunucu tarafına taşındı; mevcut 322 ders için 1.288 quiz sorusu seed edildi.
- Her ders için `lesson_resources` kaydı oluşturuldu; admin dosya/PDF/link kaynağı bağlama endpointi eklendi.
- Lab kanıt teslimleri `lab_submissions` tablosu ve Academy okuyucu formuyla kalıcı hale getirildi.
- Sertifika üretme/doğrulama endpointleri, kurs kapak yükleme endpointi ve upload route'ları tamamlandı.
- `lessons_dump.json` kataloğu `data/courses/*.json` modüllerine ayrıldı ve `export_course_modules.py` bakım scripti eklendi.
- Public profil e-posta sızıntısı, leaderboard XP çarpan hatası, öğrenci sistem komutu çalıştırma açığı ve test DB migration eksikleri düzeltildi.
- Hassas içerik revizyonu hariç ikinci kalite turu tamamlandı: 8 öğrenme yolu track metadata'sı eklendi, Academy ana ekranına track filtresi bağlandı.
- Her derse yerel track çalışma rehberi bağlandı; `lesson_resources` artık 322 katalog + 322 gerçek yerel rehber kaydı içeriyor.
- 12 şablon lab komutu konuya özel Burp/etik/lab değerlendirme pratiğine dönüştürüldü; genel fallback komut sayısı 0'a indi.
- 12 öncelikli ders için elle yazılmış senaryo quizleri `data/curated-quizzes.json` dosyasına alındı ve DB'ye işlendi.
- Eğitmen/admin lab teslim inceleme API'leri ve admin panelindeki kabul/revizyon/inceleme arayüzü eklendi.
- Eventlet bağımlılığı kaldırılarak SocketIO `threading` moduna taşındı; deprecation uyarısı giderildi.
- 322 dersin tamamı tam anlatım standardına yükseltildi: her bölüm zihinsel model, mekanizma açıklaması, uygulamalı senaryo, sık hata/kalite kontrolü, kanıt standardı, terimler ve ustalık rubriğiyle zenginleştirildi.
- Zenginleştirilmiş katalog `lessons_dump.json`, `data/courses/*.json` ve veritabanındaki `lessons.content_json` alanına senkronlandı; `export_enriched_academy.js` bakım scripti eklendi.
- 18 kursun tamamı için yerel PNG kapak görseli üretildi ve kurs verisine bağlandı; Academy ve Courses ekranları gerçek görselleri kullanacak şekilde güncellendi.
- Ders okuyucuya kurs görseli, öğrenme akışı, kanıt/risk/düzeltme haritası ve görsel odak kutuları içeren görsel öğrenme paneli eklendi.
- Kaynak linkleri görsel içerikle desteklendi: 8 track kavram haritası ve 18 kurs öğrenme akışı görseli üretildi, 322 dersin her birine `visual-track` ve `visual-course` kaynakları bağlandı.
- Academy kaynak listesi PNG/JPG/WebP/SVG kaynakları thumbnail önizlemeli kart olarak gösterecek şekilde güncellendi.

## Files Changed

- `lessons.js`
- `app.js`
- `style.css`
- `index.html`
- `server.py`
