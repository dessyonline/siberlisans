import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/site-config";

export const Route = createFileRoute("/gizlilik")({
  head: () => ({
    meta: [
      { title: "Gizlilik Politikası — SiberPHP" },
      { name: "description", content: "SiberPHP gizlilik politikası, çerezler ve veri güvenliği." },
      { property: "og:title", content: "Gizlilik Politikası — SiberPHP" },
      { property: "og:description", content: "Verilerinizin nasıl korunduğunu öğrenin." },
    ],
  }),
  component: GizlilikPage,
});

function GizlilikPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="font-mono text-xs text-primary/70 mb-2">$ cat /legal/privacy.md</div>
      <h1 className="font-mono text-3xl neon-text mb-6">Gizlilik Politikası</h1>
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># Toplanan Bilgiler</h2>
          <p>
            {SITE.name} olarak yalnızca hizmeti sunmak için gerekli minimum veriyi topluyoruz: e-posta adresiniz,
            oturum tokenları, IP adresi ve sipariş/ödeme kayıtları.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># Çerezler</h2>
          <p>
            Kimlik doğrulama oturumunuzu sürdürmek için zorunlu çerezler kullanıyoruz. Reklam veya üçüncü taraf
            takip çerezleri kullanmıyoruz.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># Veri Güvenliği</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tüm iletişim TLS 1.3 ile şifrelenir</li>
            <li>Şifreler bcrypt / argon2 ile hashlenir</li>
            <li>Lisans anahtarları izole edilmiş havuzda tutulur</li>
            <li>Yalnızca yetkili yöneticiler siparişleri görüntüleyebilir (Row-Level Security)</li>
          </ul>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># Üçüncü Taraflar</h2>
          <p>
            Veri işleyicilerimiz: barındırma altyapısı (Cloudflare/Supabase), e-posta sağlayıcısı, ödeme aracısı ve
            Telegram bildirimleri. Verileriniz reklam amaçlı hiçbir tarafla paylaşılmaz.
          </p>
        </section>
        <section>
          <h2 className="text-foreground font-mono text-lg mb-2"># Hesap Silme</h2>
          <p>
            Hesabınızın silinmesini{" "}
            <a href={`mailto:${SITE.email}`} className="text-primary underline">{SITE.email}</a>{" "}
            adresine talep göndererek isteyebilirsiniz. Yasal olarak saklanması zorunlu veriler (fatura kayıtları)
            hariç tüm bilgileriniz 7 gün içinde silinir.
          </p>
        </section>
        <p className="text-xs text-primary/60 pt-4 border-t border-border/40">
          Son güncelleme: {new Date().toLocaleDateString("tr-TR")}
        </p>
      </div>
    </div>
  );
}
