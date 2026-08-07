# Academy Learning Library Research

## Overview

CyberLab içindeki tek cümlelik Academy kartlarını, sıfırdan başlayan bir kullanıcı için sıralı ve büyütülebilir Türkçe eğitim arşivine dönüştürür.

## Problem Statement

Eski veri modeli yalnızca başlık ve HTML parçası tutuyordu. Arama, öğrenme sırası, kazanım, uygulama, güvenlik notu, kaynak ve ilerleme takibi yoktu.

## User Stories / Use Cases

- Yeni kullanıcı CMD ve Linux komutlarından başlayarak doğru sırada ilerler.
- Kullanıcı komutu açıklamasıyla görür ve tek tıkla kopyalar.
- Kullanıcı dersi tamamlar, ilerleme ve XP bilgisini yerel olarak saklar.
- Ders PDF olarak yazdırılabilir.
- Yeni kaynaklar ana arayüz kodu değiştirilmeden veri dosyasına eklenir.

## Technical Research

### Recommended Approach

Mevcut bağımlılıksız HTML/CSS/JavaScript yapısı korunur. Dersler `lessons.js` içinde veri odaklı bir şemada, okuyucu ve kütüphane davranışı `app.js` içinde tutulur. İlerleme `localStorage` ile saklanır.

### Data Requirements

Her kurs sıra, kategori, seviye ve açıklama; her ders sıra, özet, süre, XP, kazanımlar, bölümler, komutlar, görev ve güvenlik notu içerir.

## UI/UX Considerations

Müfredat global sırayla gösterilir. Arama konu ve kazanımları tarar. Ders okuyucu ile kaynak konu haritası ayrı görünümlerdir. Mobil düzen ve yazdırma görünümü desteklenir.

## Risks and Challenges

- Güvenlik eğitimi yetkisiz kullanıma yönelmemeli; kapsam notları her aktif dersin parçasıdır.
- Üçüncü taraf ücretli kurslar birebir kopyalanmamalı; yalnız herkese açık başlıklar konu haritası olarak kullanılır ve metinler özgün yazılır.
- Büyük arşivde tek JS dosyası ileride bölünmelidir.

## References

- Kullanıcının paylaştığı iki Google Drive klasörünün herkese açık modül/dosya adları
- CyberLab mevcut Academy ve araç rehberi entegrasyonu
