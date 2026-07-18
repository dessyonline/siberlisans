import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Video, Eraser, Minimize2, QrCode, Palette, Wand2, Braces, Binary, Type, Crop, Stamp, ShieldCheck, FileText, Scissors, Film, Music, Layers, Gauge, RotateCw, VolumeX, Image as ImageIcon, Search, LayoutGrid, ImageIcon as PicIcon, Video as VidIcon, Code2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/")({
  component: Hub,
  head: () => ({ meta: [{ title: "Araçlar — SiberPHP" }] }),
});

type Category = "resim" | "video" | "gelistirici" | "ai";
type Badge = "FREE" | "₺";

interface Tool {
  to: string;
  label: string;
  desc: string;
  icon: typeof Video;
  badge: Badge;
  category: Category;
}

const TOOLS: Tool[] = [
  // Resim & Medya
  { to: "/araclar/arkaplan", label: "Arkaplan Kaldır", desc: "Resmin arkaplanını tarayıcıda kaldır — sınırsız.", icon: Eraser, badge: "FREE", category: "resim" },
  { to: "/araclar/sikistir", label: "Resim Sıkıştır", desc: "JPG/WebP/PNG · yeniden boyutlandır + sıkıştır.", icon: Minimize2, badge: "FREE", category: "resim" },
  { to: "/araclar/kirp", label: "Kırp & Döndür", desc: "Resmi kırp, döndür, yatay/dikey çevir.", icon: Crop, badge: "FREE", category: "resim" },
  { to: "/araclar/watermark", label: "Watermark Ekle", desc: "Metin filigranı ekle — 6 farklı konum.", icon: Stamp, badge: "FREE", category: "resim" },
  { to: "/araclar/exif", label: "EXIF Temizle", desc: "Konum/kamera metadata sil — gizlilik.", icon: ShieldCheck, badge: "FREE", category: "resim" },
  { to: "/araclar/pdf", label: "Resim → PDF", desc: "Birden fazla resmi tek PDF'e birleştir.", icon: FileText, badge: "FREE", category: "resim" },
  { to: "/araclar/palet", label: "Renk Paleti", desc: "Resimden hakim renkleri hex olarak çıkar.", icon: Palette, badge: "FREE", category: "resim" },
  { to: "/araclar/qr", label: "QR Kod Üret", desc: "URL/metin → özelleştirilebilir QR PNG.", icon: QrCode, badge: "FREE", category: "resim" },
  // Video
  { to: "/araclar/video-trim", label: "Video Kırp/Kes", desc: "Başlangıç-bitiş vererek videoyu hızlıca kes.", icon: Scissors, badge: "FREE", category: "video" },
  { to: "/araclar/video-gif", label: "Video → GIF", desc: "Video parçasını GIF'e çevir — FPS + boyut.", icon: Film, badge: "FREE", category: "video" },
  { to: "/araclar/video-sikistir", label: "Video Sıkıştır", desc: "H.264 + CRF ile dosya boyutunu düşür.", icon: Minimize2, badge: "FREE", category: "video" },
  { to: "/araclar/video-mp3", label: "Video → MP3", desc: "Videodan sesi çıkar ve MP3 indir.", icon: Music, badge: "FREE", category: "video" },
  { to: "/araclar/video-birlestir", label: "Video Birleştir", desc: "Birden fazla klibi sırayla birleştir.", icon: Layers, badge: "FREE", category: "video" },
  { to: "/araclar/video-watermark", label: "Video Watermark", desc: "Videoya metin filigranı ekle.", icon: Stamp, badge: "FREE", category: "video" },
  { to: "/araclar/video-hiz", label: "Video Hız Değiştir", desc: "0.5x yavaş / 2x-4x hızlı — ses senkron.", icon: Gauge, badge: "FREE", category: "video" },
  { to: "/araclar/video-dondur", label: "Video Döndür/Çevir", desc: "90°/180° döndür veya yatay/dikey çevir.", icon: RotateCw, badge: "FREE", category: "video" },
  { to: "/araclar/video-thumbnail", label: "Video Thumbnail", desc: "Kareden JPG kapak resmi çıkar.", icon: ImageIcon, badge: "FREE", category: "video" },
  { to: "/araclar/video-sessiz", label: "Video Sessizleştir", desc: "Ses kanalını sil — görüntü aynı kalır.", icon: VolumeX, badge: "FREE", category: "video" },
  // Geliştirici / Metin
  { to: "/araclar/json", label: "JSON Formatter", desc: "JSON doğrula, beautify veya minify et.", icon: Braces, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/base64", label: "Base64 Kodla/Çöz", desc: "Metin & dosya ↔ Base64 (data URI).", icon: Binary, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/sayac", label: "Metin Sayaç", desc: "Kelime, karakter, okuma süresi — canlı.", icon: Type, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/renk", label: "Renk Çevirici", desc: "HEX ↔ RGB ↔ HSL + ton skalası.", icon: Palette, badge: "FREE", category: "gelistirici" },
  // AI (Ücretli)
  { to: "/araclar/hd", label: "Resim HD Yap", desc: "Bulanık/eski fotoğrafı AI ile netleştir · ₺4-8/resim.", icon: Wand2, badge: "₺", category: "ai" },
  { to: "/araclar/video", label: "AI Video", desc: "Prompt'tan video üret — cüzdandan düşer.", icon: Video, badge: "₺", category: "ai" },
];

const CATEGORIES: { id: "hepsi" | Category; label: string; icon: typeof Video }[] = [
  { id: "hepsi", label: "Tümü", icon: LayoutGrid },
  { id: "resim", label: "Resim & Medya", icon: PicIcon },
  { id: "video", label: "Video", icon: VidIcon },
  { id: "gelistirici", label: "Geliştirici", icon: Code2 },
  { id: "ai", label: "AI · Ücretli", icon: Sparkles },
];

function Hub() {
  const [cat, setCat] = useState<"hepsi" | Category>("hepsi");
  const [q, setQ] = useState("");

  const filtered = TOOLS.filter((t) => {
    if (cat !== "hepsi" && t.category !== cat) return false;
    if (q.trim() && !`${t.label} ${t.desc}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const grouped: Record<Category, Tool[]> = { resim: [], video: [], gelistirici: [], ai: [] };
  for (const t of filtered) grouped[t.category].push(t);

  const showGrouped = cat === "hepsi" && !q.trim();

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

      {/* Kontrol paneli */}
      <div className="glass-card rounded-lg p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Araç ara..."
            className="w-full rounded-md bg-black/40 border border-primary/30 pl-9 pr-3 py-2 font-mono text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const count = c.id === "hepsi" ? TOOLS.length : TOOLS.filter((t) => t.category === c.id).length;
            const active = cat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-all ${
                  active
                    ? "border-primary bg-primary/10 text-primary neon-glow"
                    : "border-primary/20 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {c.label}
                <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-primary/20" : "bg-primary/5"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-lg p-8 text-center">
          <div className="font-mono text-sm text-muted-foreground">Eşleşen araç yok.</div>
        </div>
      ) : showGrouped ? (
        <div className="space-y-6">
          {CATEGORIES.filter((c) => c.id !== "hepsi").map((c) => {
            const list = grouped[c.id as Category];
            if (list.length === 0) return null;
            const Icon = c.icon;
            return (
              <section key={c.id} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-primary/20 pb-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h2 className="font-mono text-sm text-primary">{c.label}</h2>
                  <span className="font-mono text-[10px] text-muted-foreground">({list.length})</span>
                </div>
                <ToolGrid tools={list} />
              </section>
            );
          })}
        </div>
      ) : (
        <ToolGrid tools={filtered} />
      )}
    </div>
  );
}

function ToolGrid({ tools }: { tools: Tool[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => {
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
                  t.badge === "FREE" ? "text-primary/80" : "text-yellow-400/80"
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
  );
}
