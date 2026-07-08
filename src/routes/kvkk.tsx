import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site-config";

export const Route = createFileRoute("/kvkk")({
  head: () => ({
    meta: [
      { title: "KVKK Aydınlatma Metni — SiberPHP" },
      { name: "description", content: "SiberPHP kişisel verilerin korunması ve işlenmesi aydınlatma metni." },
      { property: "og:title", content: "KVKK Aydınlatma Metni — SiberPHP" },
      { property: "og:description", content: "Kişisel verilerinizin nasıl işlendiğini öğrenin." },
    ],
  }),
  component: KvkkPage,
});

function KvkkPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="font-mono text-xs text-primary/70 mb-2">$ cat /legal/kvkk.md</div>
      <h1 className="font-mono text-3xl neon-text mb-6">KVKK Aydınlatma Metni</h1>
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 1. Veri Sorumlusu</h2>
          <p>
            6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, veri sorumlusu sıfatıyla {SITE.legalName}
            {" "}({SITE.url}) olarak tarafınıza aşağıdaki metin ile aydınlatma yükümlülüğümüzü yerine getiriyoruz.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 2. İşlenen Kişisel Veriler</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Kimlik/İletişim:</b> e-posta adresi, kullanıcı adı</li>
            <li><b>İşlem güvenliği:</b> IP adresi, oturum kayıtları, cihaz bilgisi</li>
            <li><b>Finans:</b> havale/EFT dekont bilgileri, cüzdan işlem geçmişi</li>
            <li><b>Müşteri işlem:</b> sipariş numarası, satın alınan ürün, teslim edilen lisans anahtarı</li>
          </ul>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 3. İşleme Amacı</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Sipariş ve ödeme süreçlerinin yürütülmesi</li>
            <li>Lisans anahtarının teslimi ve satış sonrası destek</li>
            <li>Sahtecilik/dolandırıcılık önleme ve hesap güvenliği</li>
            <li>Yasal yükümlülüklerin yerine getirilmesi (fatura, muhasebe)</li>
          </ul>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 4. Aktarılan Taraflar</h2>
          <p>
            Verileriniz; barındırma sağlayıcımız, ödeme aracıları, e-posta servis sağlayıcılarımız ve talep halinde
            yetkili kamu kurumları ile sınırlı olmak üzere aktarılabilir. Yurt dışına aktarım yalnızca hizmet aldığımız
            bulut sağlayıcılar için, gerekli güvenlik önlemleri alınarak yapılır.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 5. Haklarınız (KVKK m.11)</h2>
          <p>
            Kişisel verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini/silinmesini isteme, işlemeye itiraz etme
            ve zarara uğramanız halinde tazminat talep etme haklarına sahipsiniz. Taleplerinizi{" "}
            <a href={`mailto:${SITE.email}`} className="text-primary underline">{SITE.email}</a> adresine iletebilirsiniz.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 6. Saklama Süresi</h2>
          <p>
            Sipariş ve fatura verileri Türk Ticaret Kanunu ve Vergi Usul Kanunu gereği 10 yıl saklanır. Diğer veriler
            işleme amacı sona erdiğinde silinir veya anonim hale getirilir.
          </p>
        </section>
        <p className="text-xs text-primary/60 pt-4 border-t border-border/40">
          Son güncelleme: {new Date().toLocaleDateString("tr-TR")}
        </p>
      </div>
    </div>
  );
}
