import { createFileRoute, Link } from "@tanstack/react-router";
import { Video, Eraser, Minimize2, QrCode, Palette, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/")({
  component: Hub,
  head: () => ({ meta: [{ title: "Araçlar — SiberPHP" }] }),
});

const TOOLS = [
  { to: "/araclar/arkaplan", label: "Arkaplan Kaldır", desc: "Resmin arkaplanını tarayıcıda kaldır — sınırsız.", icon: Eraser, badge: "FREE" as const },
  { to: "/araclar/sikistir", label: "Resim Sıkıştır", desc: "JPG/WebP/PNG · yeniden boyutlandır + sıkıştır.", icon: Minimize2, badge: "FREE" as const },
  { to: "/araclar/qr", label: "QR Kod Üret", desc: "URL/metin → özelleştirilebilir QR PNG.", icon: QrCode, badge: "FREE" as const },
  { to: "/araclar/palet", label: "Renk Paleti", desc: "Resimden hakim renkleri hex olarak çıkar.", icon: Palette, badge: "FREE" as const },
  { to: "/araclar/hd", label: "Resim HD Yap", desc: "Bulanık/eski fotoğrafı AI ile netleştir · ₺4-8/resim.", icon: Wand2, badge: "₺" as const },
  { to: "/araclar/video", label: "AI Video", desc: "Prompt'tan video üret — cüzdandan düşer.", icon: Video, badge: "₺" as const },
];

function Hub() {
  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./araclar --list<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl sm:text-3xl neon-text">Araçlar</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          <span className="text-primary">FREE</span> araçlar tarayıcında çalışır — sınırsız & ücretsiz.
          <span className="text-yellow-400"> ₺</span> araçlar cüzdandan fiyatlanır.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to as "/araclar/chat"}
              className="glass-card rounded-lg p-4 hover:border-primary/60 hover:shadow-[0_0_20px_hsl(var(--primary)/0.25)] transition-all group"
            >
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary/20">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-mono text-sm text-foreground">{t.label}</div>
                <span
                  className={`ml-auto text-[10px] font-mono ${
                    t.badge === "FREE"
                      ? "text-primary/80"
                      : t.badge === "₺"
                      ? "text-yellow-400/80"
                      : "text-blue-400/80"
                  }`}
                >
                  {t.badge}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
