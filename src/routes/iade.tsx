import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site-config";

export const Route = createFileRoute("/iade")({
  head: () => ({
    meta: [
      { title: "İade & Cayma Politikası — SiberPHP" },
      { name: "description", content: "Dijital lisans ürünleri için iade koşulları." },
      { property: "og:title", content: "İade & Cayma Politikası — SiberPHP" },
      { property: "og:description", content: "Dijital ürünlerde iade koşulları ve garanti." },
    ],
  }),
  component: IadePage,
});

function IadePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="font-mono text-xs text-primary/70 mb-2">$ cat /legal/refund.md</div>
      <h1 className="font-mono text-3xl neon-text mb-6">İade & Cayma Politikası</h1>
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <div className="glass-card rounded-lg p-4 border border-primary/30">
          <div className="font-mono text-primary mb-1">⚡ Kısaca</div>
          <p>
            Lisans anahtarı size teslim edilmeden önce iptal ve tam iade mümkündür. Anahtar teslim edildikten sonra —
            dijital ürünün doğası gereği — cayma hakkı sona erer, ancak <b>anahtar çalışmıyorsa 24 saat içinde</b>{" "}
            ücretsiz değişim yaparız.
          </p>
        </div>

        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 1. Cayma Hakkı</h2>
          <p>
            6502 sayılı Tüketicinin Korunması Hakkında Kanun'un 15/1-ğ maddesi ve Mesafeli Sözleşmeler Yönetmeliği'nin
            15/1-h maddesi uyarınca, <b>elektronik ortamda anında ifa edilen</b> ve tüketiciye anında teslim edilen
            gayri maddi mallar (yazılım lisansı, dijital anahtar) cayma hakkı kapsamı dışındadır.
          </p>
        </section>

        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 2. Anahtar Çalışmıyorsa</h2>
          <p>
            Teslim aldığınız lisans anahtarı satıcı hatası nedeniyle çalışmıyorsa, teslim tarihinden itibaren{" "}
            <b>24 saat içinde</b> destek hattımıza bildirmeniz durumunda:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Aynı ürüne ait yeni bir anahtar ile ücretsiz değiştirilir, veya</li>
            <li>Cüzdanınıza tam iade yapılır, veya</li>
            <li>Talebiniz halinde havale ile ödeme iadesi başlatılır.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 3. Ödeme Bekleyen Sipariş</h2>
          <p>
            Havale/EFT ödemesi henüz yapılmamış siparişler kullanıcı tarafından iptal edilebilir. Herhangi bir ücret
            kesintisi olmaz.
          </p>
        </section>

        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 4. Reddedilen Sipariş</h2>
          <p>
            Dekont doğrulanamadığı veya stok tükendiği gerekçesiyle admin tarafından reddedilen siparişlerde ödeme
            tutarı <b>cüzdanınıza iade edilir</b>. Cüzdan bakiyesi tekrar satın almada kullanılabilir veya banka
            hesabınıza aktarım için destekle iletişime geçebilirsiniz.
          </p>
        </section>

        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># 5. İletişim</h2>
          <p>
            Tüm iade taleplerinizi{" "}
            <a href={`mailto:${SITE.email}`} className="text-primary underline">{SITE.email}</a>{" "}
            adresine sipariş numaranız ile birlikte iletebilirsiniz.
          </p>
        </section>

        <p className="text-xs text-primary/60 pt-4 border-t border-border/40">
          Son güncelleme: {new Date().toLocaleDateString("tr-TR")}
        </p>
      </div>
    </div>
  );
}
