# Manuel bakiye hatası ve görünmeyen manuel yüklemeler

## Sorun
Manuel ekle/düş işlemi önce bakiyeyi değiştiriyor, sonra geçmişe "adjustment" türüyle kayıt yazmaya çalışıyor. Veritabanı yalnızca `admin_credit` / `admin_debit` türlerini kabul ettiği için kayıt reddediliyor:
- Ekranda "köprü hatası" çıkıyor ama bakiye zaten değişmiş oluyor.
- Geçmişe hiçbir kayıt düşmediği için manuel yüklemeler hiçbir yerde görünmüyor.

## Yapılacaklar
1. Manuel işlemde tür: artı ise `admin_credit`, eksi ise `admin_debit`.
2. Önce geçmiş kaydı hazırlanıp bakiye ile birlikte tek adımda yazılsın; kayıt yazılamazsa bakiye değişmesin (yarım işlem olmasın).
3. Admin cüzdan geçmişi filtresine "manuel ekleme" ve "manuel düşme" seçenekleri; listede türler Türkçe etiketle gösterilsin.
4. Geçmişte kayıtsız kalmış manuel işlemleri bulmak için: bakiye ile hareket toplamı uyuşmayan kullanıcıları admin sayfasında "kayıtsız fark" uyarısıyla listele (veriyi değiştirmeden).
5. Müşteri cüzdan sayfası zaten `admin_credit/admin_debit` etiketlerini tanıyor; değişiklik gerekmez.

## Teknik
- `src/lib/wallet.functions.ts` `adminAdjustWallet`: kind düzeltmesi; bakiye güncelleme + insert'i tek SQL/RPC (var olan `admin_adjust_wallet` fonksiyonu veya CTE) ile atomik yap.
- `src/lib/wallet-read.functions.ts`: kullanıcı başına bakiye − hareket toplamı farkı sorgusu.
- `src/routes/_authenticated/admin/cuzdan.tsx`: filtre seçenekleri, etiketler, fark uyarı bölümü.
- Test: manuel ekle/düş sonrası tek hareket kaydı ve doğru tür.
