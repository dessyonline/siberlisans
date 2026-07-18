import { createFileRoute, Link } from "@tanstack/react-router";
import { Video, Eraser, Minimize2, QrCode, Palette, Wand2, Braces, Binary, Type, Crop, Stamp, ShieldCheck, FileText, Scissors, Film, Music, Layers, Gauge, RotateCw, VolumeX, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/")({
  component: Hub,
  head: () => ({ meta: [{ title: "Araçlar — SiberPHP" }] }),
});

const TOOLS = [
  // Resim & Medya
  { to: "/araclar/arkaplan", label: "Arkaplan Kaldır", desc: "Resmin arkaplanını tarayıcıda kaldır — sınırsız.", icon: Eraser, badge: "FREE" as const },
  { to: "/araclar/sikistir", label: "Resim Sıkıştır", desc: "JPG/WebP/PNG · yeniden boyutlandır + sıkıştır.", icon: Minimize2, badge: "FREE" as const },
  { to: "/araclar/kirp", label: "Kırp & Döndür", desc: "Resmi kırp, döndür, yatay/dikey çevir.", icon: Crop, badge: "FREE" as const },
  { to: "/araclar/watermark", label: "Watermark Ekle", desc: "Metin filigranı ekle — 6 farklı konum.", icon: Stamp, badge: "FREE" as const },
  { to: "/araclar/exif", label: "EXIF Temizle", desc: "Konum/kamera metadata sil — gizlilik.", icon: ShieldCheck, badge: "FREE" as const },
  { to: "/araclar/pdf", label: "Resim → PDF", desc: "Birden fazla resmi tek PDF'e birleştir.", icon: FileText, badge: "FREE" as const },
  { to: "/araclar/palet", label: "Renk Paleti", desc: "Resimden hakim renkleri hex olarak çıkar.", icon: Palette, badge: "FREE" as const },
  { to: "/araclar/qr", label: "QR Kod Üret", desc: "URL/metin → özelleştirilebilir QR PNG.", icon: QrCode, badge: "FREE" as const },
  // Video (ffmpeg.wasm — tarayıcıda)
  { to: "/araclar/video-trim", label: "Video Kırp/Kes", desc: "Başlangıç-bitiş vererek videoyu hızlıca kes.", icon: Scissors, badge: "FREE" as const },
  { to: "/araclar/video-gif", label: "Video → GIF", desc: "Video parçasını GIF'e çevir — FPS + boyut.", icon: Film, badge: "FREE" as const },
  { to: "/araclar/video-sikistir", label: "Video Sıkıştır", desc: "H.264 + CRF ile dosya boyutunu düşür.", icon: Minimize2, badge: "FREE" as const },
  { to: "/araclar/video-mp3", label: "Video → MP3", desc: "Videodan sesi çıkar ve MP3 indir.", icon: Music, badge: "FREE" as const },
  { to: "/araclar/video-birlestir", label: "Video Birleştir", desc: "Birden fazla klibi sırayla birleştir.", icon: Layers, badge: "FREE" as const },
  { to: "/araclar/video-watermark", label: "Video Watermark", desc: "Videoya metin filigranı ekle.", icon: Stamp, badge: "FREE" as const },
  { to: "/araclar/video-hiz", label: "Video Hız Değiştir", desc: "0.5x yavaş / 2x-4x hızlı — ses senkron.", icon: Gauge, badge: "FREE" as const },
  { to: "/araclar/video-dondur", label: "Video Döndür/Çevir", desc: "90°/180° döndür veya yatay/dikey çevir.", icon: RotateCw, badge: "FREE" as const },
  { to: "/araclar/video-thumbnail", label: "Video Thumbnail", desc: "Kareden JPG kapak resmi çıkar.", icon: ImageIcon, badge: "FREE" as const },
  { to: "/araclar/video-sessiz", label: "Video Sessizleştir", desc: "Ses kanalını sil — görüntü aynı kalır.", icon: VolumeX, badge: "FREE" as const },
  // Geliştirici / Metin
  { to: "/araclar/json", label: "JSON Formatter", desc: "JSON doğrula, beautify veya minify et.", icon: Braces, badge: "FREE" as const },
  { to: "/araclar/base64", label: "Base64 Kodla/Çöz", desc: "Metin & dosya ↔ Base64 (data URI).", icon: Binary, badge: "FREE" as const },
  { to: "/araclar/sayac", label: "Metin Sayaç", desc: "Kelime, karakter, okuma süresi — canlı.", icon: Type, badge: "FREE" as const },
  { to: "/araclar/renk", label: "Renk Çevirici", desc: "HEX ↔ RGB ↔ HSL + ton skalası.", icon: Palette, badge: "FREE" as const },
  // Ücretli
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
