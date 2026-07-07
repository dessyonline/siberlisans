import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/nasil-calisir")({
  component: () => (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="font-mono text-xs text-muted-foreground">$ man siberphp --steps</div>
      <h1 className="mt-2 font-mono text-3xl neon-text">Nasıl Çalışır?</h1>
      <ol className="mt-6 space-y-4 font-mono text-sm">
        {[
          ["01", "Ürün seçin.", "Kataloğumuzdan lisansı belirleyin ve satın al butonuna basın."],
          ["02", "Referans kodunu alın.", "Sistem, size özel bir referans kodu ve havale bilgileri gösterir."],
          ["03", "Havale yapın.", "Açıklama alanına referans kodunu yazarak tam tutarı gönderin."],
          ["04", "Dekont yükleyin.", "Panelden dekont görselini yükleyin. Durum 'inceleniyor' olur."],
          ["05", "Anahtarı alın.", "Admin onayından sonra key hem panelde hem e-postanızda görünür."],
        ].map(([n, t, d]) => (
          <li key={n} className="glass-card rounded-md p-4 flex gap-4">
            <div className="neon-text text-2xl">{n}</div>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="text-muted-foreground">{d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Nasıl Çalışır? — SiberPHP" },
      {
        name: "description",
        content: "SiberPHP'te lisans satın alma adımları: ürün seç, referans kodunla havale yap, dekont yükle, anahtarını dakikalar içinde al.",
      },
      { property: "og:title", content: "Nasıl Çalışır? — SiberPHP" },
      { property: "og:description", content: "5 adımda güvenli lisans teslimi — referans, havale, dekont, onay, anahtar." },
      { property: "og:url", content: "https://siberlisans.lovable.app/nasil-calisir" },
    ],
    links: [{ rel: "canonical", href: "https://siberlisans.lovable.app/nasil-calisir" }],
  }),
});
