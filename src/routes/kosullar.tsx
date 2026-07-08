import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site-config";

export const Route = createFileRoute("/kosullar")({
  head: () => ({
    meta: [
      { title: "Kullanım Koşulları — SiberPHP" },
      { name: "description", content: "SiberPHP hizmet kullanım koşulları ve üyelik sözleşmesi." },
      { property: "og:title", content: "Kullanım Koşulları — SiberPHP" },
      { property: "og:description", content: "Hizmeti kullanmadan önce lütfen okuyun." },
    ],
  }),
  component: KosullarPage,
});

function KosullarPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="font-mono text-xs text-primary/70 mb-2">$ cat /legal/terms.md</div>
      <h1 className="font-mono text-3xl neon-text mb-6">Kullanım Koşulları</h1>
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 1. Taraflar</h2>
          <p>
            İşbu koşullar, {SITE.name} ({SITE.url}) ("Hizmet") ile Hizmet'e üye olan gerçek/tüzel kişi ("Kullanıcı")
            arasındaki hakları ve yükümlülükleri düzenler. Hesap oluşturarak veya satın alma yaparak bu koşulları
            kabul etmiş sayılırsınız.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 2. Hizmetin Kapsamı</h2>
          <p>
            {SITE.name}, üçüncü taraf yazılımlar için lisans anahtarı satışı sağlar. Satılan anahtarlar orijinaldir
            ve ilgili yazılımın üreticisi/dağıtıcısı tarafından belirlenen kullanım koşullarına tabidir.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 3. Kullanıcı Yükümlülükleri</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Hesap bilgilerinizi kimseyle paylaşmamak</li>
            <li>Doğru ve güncel iletişim bilgisi kullanmak</li>
            <li>Hizmeti yalnızca yasal amaçlarla kullanmak</li>
            <li>Satın alınan lisansı yeniden satmamak (kişisel kullanım)</li>
          </ul>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 4. Yasaklı Kullanım</h2>
          <p>
            Hizmetin otomatik araçlarla taranması, tersine mühendislik, sunucuya yük bindirme girişimleri, sahte
            dekont yükleme ve dolandırıcılık girişimleri hesabın <b>kalıcı olarak kapatılmasına</b> ve yasal
            işlem başlatılmasına neden olur.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 5. Ödeme & Teslim</h2>
          <p>
            Ödemeler havale/EFT ve cüzdan bakiyesi ile yapılır. Dekont onayı sonrası lisans anahtarı hesap panelinizde
            anında görüntülenir. Ortalama teslim süresi 5-30 dakikadır.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 6. Sorumluluk Sınırı</h2>
          <p>
            {SITE.name}, satılan yazılımın üretici hataları, güncelleme politikası değişiklikleri veya kullanıcının
            yanlış kullanımından kaynaklanan zararlardan sorumlu tutulamaz. Toplam sorumluluk, ilgili siparişin
            ödeme tutarı ile sınırlıdır.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 7. Değişiklikler</h2>
          <p>
            Bu koşullarda değişiklik yapma hakkımız saklıdır. Önemli değişiklikler hesap paneli üzerinden bildirilir.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 8. Uyuşmazlık Çözümü</h2>
          <p>
            Uyuşmazlıklarda Türkiye Cumhuriyeti kanunları uygulanır. Yetkili mahkeme ve icra daireleri Türkiye
            Cumhuriyeti sınırları içindedir. Tüketici uyuşmazlıklarında Tüketici Hakem Heyetleri ve Tüketici
            Mahkemeleri yetkilidir.
          </p>
        </section>
        <p className="text-xs text-primary/60 pt-4 border-t border-border/40">
          Son güncelleme: {new Date().toLocaleDateString("tr-TR")}
        </p>
      </div>
    </div>
  );
}
