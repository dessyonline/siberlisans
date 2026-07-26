## Amaç

`/admin/siparisler` şu an tek dosyada (630 satır) kart listesi olarak çalışıyor: tüm siparişler tek seferde çekiliyor, detay yok, işlem seti onayla/reddet/iptal + UL sync ile sınırlı. Dört alanda yenileyeceğiz.

## 1. Üst KPI şeridi + canlı akış

- Sayfanın üstüne 4 kart: bekleyen (pending+reviewing), bugünkü onaylı ciro, bugünkü sipariş adedi, ortalama onay süresi.
- Değerler tek bir admin server fonksiyonundan gelir (`getOrderKpis`), 30 sn'de bir tazelenir.
- `orders` tablosuna realtime aboneliği: yeni sipariş/durum değişiminde liste ve KPI otomatik tazelenir, yeni kayıt gelirse toast + kısa "yeni sipariş" vurgusu. Kanal `useEffect` içinde açılıp unmount'ta kapatılır.

## 2. Liste/tablo modu + gelişmiş filtre

- Görünüm anahtarı: **tablo** (varsayılan, kompakt) / **kart** (mevcut görünüm korunur).
- Tablo kolonları: seçim, referans, müşteri, ürün, tutar (indirim varsa brüt→net), ödeme yöntemi, durum, tarih, hızlı işlemler.
- Filtreler URL search param'a taşınır (durum, tarih aralığı, arama, ürün, ödeme yöntemi, min/max tutar, sadece mesajlı) — böylece filtreli görünüm paylaşılabilir/yenilemede korunur.
- Sıralama: tarih / tutar / durum. Sunucu tarafında sayfalama (50'lik sayfalar) + toplam sayaç; artık tüm tablo tek seferde çekilmez.
- Arama referans, ürün adı, müşteri e-postası/adı ve dış sipariş kimliği üzerinde çalışır.

## 3. Sipariş detay paneli (drawer)

Satıra tıklayınca sağdan açılan panel:
- **Özet**: durum, tutar kırılımı (liste fiyatı, kupon/indirim, ödenen), ödeme yöntemi, dekont önizleme.
- **Müşteri**: ad/e-posta, cüzdan bakiyesi, toplam sipariş sayısı ve harcaması, son 5 siparişi, risk işareti (ilk sipariş / iade geçmişi).
- **Teslimat**: teslim edilen anahtar/mail-şifre/link kayıtları (maskeli, kopyala butonu), dış sağlayıcı durumu ve yanıtı.
- **Zaman çizelgesi**: oluşturma, dekont yükleme, durum değişimleri, admin işlemleri — denetim kaydından okunur.
- **Notlar**: müşteri notu + admin notu ekleme/düzenleme.

## 4. Manuel teslim & işlem araçları

Panel içinden:
- **Manuel teslim**: serbest metin/anahtar/mail-şifre/link girip siparişi onaylı-teslim edilmiş işaretleme (havuz stoğuna dokunmadan), müşteriye bildirim gönderilir.
- **Kısmi iade**: tutar girilerek cüzdana iade; işlem cüzdan hareketi ve denetim kaydı bırakır.
- **Müşteriye mesaj**: sipariş bağlamıyla bildirim (ve varsa destek bileti mesajı) gönderme.
- **Ürün değiştirme**: siparişi başka ürüne taşıma, fiyat farkı cüzdana yansır.
- Toplu işlemler tablo modunda korunur: toplu onay, toplu red, seçili kayıtları CSV dışa aktarma (mevcut CSV filtreli sonucun tamamını verir).

## Teknik notlar

- Yeni `src/lib/admin-orders.functions.ts`: `listOrders` (sayfalı/filtreli), `getOrderKpis`, `getOrderDetail`, `manualDeliver`, `partialRefund`, `messageCustomer`, `changeOrderProduct`. Hepsi `requireSupabaseAuth` + `has_role(admin)` kontrolü ile.
- Sayfa parçalanır: `src/components/admin/orders/` altında `OrdersKpiBar`, `OrdersTable`, `OrdersFilters`, `OrderDetailDrawer`, `ManualDeliverDialog`.
- Para hareketi gerektiren işlemler (kısmi iade, ürün değişimi, manuel teslim) atomik olması için SQL fonksiyonu olarak yazılır; bunun için bir migration gerekir (yeni tablo yok, yalnız fonksiyonlar + denetim kaydı). `orders` realtime yayına eklenir.
- Mevcut `approveOrder` / `rejectOrder` / `adminCancelOrder` / UL sync akışları aynen korunur.
- Tasarım dili değişmez: cyber/terminal, neon yeşil vurgular, mono etiketler.
