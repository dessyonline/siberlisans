import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, Languages, Code2, FileText, Sparkles, Video, Eraser, Minimize2, QrCode, Palette } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/")({
  component: Hub,
  head: () => ({ meta: [{ title: "AI Araçlar — SiberPHP" }] }),
});

const TOOLS = [
  { to: "/araclar/chat", label: "AI Chat", desc: "Genel amaçlı asistan — sorularını sor.", icon: MessageSquare, badge: "AI" as const },
  { to: "/araclar/ceviri", label: "Çevirmen", desc: "Anında dil çevirisi (TR/EN/DE/FR/AR...).", icon: Languages, badge: "AI" as const },
  { to: "/araclar/kod", label: "Kod Açıklayıcı", desc: "Kodu satır satır açıkla + refactor önerisi.", icon: Code2, badge: "AI" as const },
  { to: "/araclar/ozet", label: "Metin Özetleyici", desc: "Uzun metni 6 madde özete indirger.", icon: FileText, badge: "AI" as const },
  { to: "/araclar/slogan", label: "Slogan Üretici", desc: "Ürün açıklamandan 5 slogan çıkarır.", icon: Sparkles, badge: "AI" as const },
  { to: "/araclar/arkaplan", label: "Arkaplan Kaldır", desc: "Resmin arkaplanını tarayıcıda kaldır — sınırsız.", icon: Eraser, badge: "FREE" as const },
  { to: "/araclar/sikistir", label: "Resim Sıkıştır", desc: "JPG/WebP/PNG · yeniden boyutlandır + sıkıştır.", icon: Minimize2, badge: "FREE" as const },
  { to: "/araclar/qr", label: "QR Kod Üret", desc: "URL/metin → özelleştirilebilir QR PNG.", icon: QrCode, badge: "FREE" as const },
  { to: "/araclar/palet", label: "Renk Paleti", desc: "Resimden hakim renkleri hex olarak çıkar.", icon: Palette, badge: "FREE" as const },
  { to: "/araclar/video", label: "AI Video", desc: "Prompt'tan video üret — cüzdandan düşer.", icon: Video, badge: "₺" as const },
];

function Hub() {
  return (
    <div className="space-y-4">
      <div className="glass-card rounded-lg p-4 sm:p-6">
        <div className="font-mono text-xs text-muted-foreground">$ ./araclar --list<span className="terminal-caret" /></div>
        <h1 className="mt-2 font-mono text-2xl sm:text-3xl neon-text">Ücretsiz AI Araçlar</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Tier'ına göre günlük kota — bronze 10, silver 25, gold 60, platinum 150. Kotan bitince
          <span className="text-primary"> her 5 puan = 1 ekstra istek</span>. Video üretimi cüzdandan
          fiyatlanır (3s ₺25 · 5s ₺40 · 8s ₺60).
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
                {t.free ? (
                  <span className="ml-auto text-[10px] font-mono text-primary/80">FREE</span>
                ) : (
                  <span className="ml-auto text-[10px] font-mono text-yellow-400/80">₺</span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
