import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Video, Eraser, Minimize2, QrCode, Palette, Braces, Binary, Type,
  Crop, Stamp, ShieldCheck, FileText, Scissors, Film, Music, Layers, Gauge,
  RotateCw, VolumeX, Image as ImageIcon, Search, LayoutGrid, ImageIcon as PicIcon,
  Video as VidIcon, Code2, Sparkles, Zap, Infinity as InfIcon, Cpu, ArrowRight,
  KeyRound, Fingerprint, ShieldAlert, Link2, Hash, Lock, Star, History, X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/araclar/")({
  component: Hub,
  head: () => ({
    meta: [
      { title: "Araçlar Laboratuvarı — SiberPHP" },
      { name: "description", content: "31 profesyonel araç — arka plan kaldırma, video düzenleme, şifre/hash üretimi ve AI video. Tarayıcında çalışır, hesap dışına veri çıkmaz." },
      { property: "og:title", content: "Araçlar Laboratuvarı — SiberPHP" },
      { property: "og:description", content: "31 ücretsiz ve AI destekli araç tek panelde. Dosyaların tarayıcından çıkmaz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Category = "resim" | "video" | "gelistirici" | "guvenlik" | "uretme";
type Badge = "FREE" | "AI";

interface Tool {
  to: string;
  label: string;
  desc: string;
  icon: typeof Video;
  badge: Badge;
  category: Category;
  featured?: boolean;
  keywords?: string;
  isNew?: boolean;
}

const TOOLS: Tool[] = [
  // Resim & Medya
  { to: "/araclar/arkaplan", label: "Arkaplan Kaldır", desc: "Resmin arkaplanını tarayıcında sil — sınırsız.", icon: Eraser, badge: "FREE", category: "resim", featured: true, keywords: "background remove png şeffaf" },
  { to: "/araclar/sikistir", label: "Resim Sıkıştır", desc: "JPG/WebP/PNG · yeniden boyutlandır + sıkıştır.", icon: Minimize2, badge: "FREE", category: "resim", keywords: "compress boyut küçült webp" },
  { to: "/araclar/kirp", label: "Kırp & Döndür", desc: "Resmi kırp, döndür, yatay/dikey çevir.", icon: Crop, badge: "FREE", category: "resim", keywords: "crop rotate" },
  { to: "/araclar/watermark", label: "Watermark Ekle", desc: "Metin filigranı — 6 farklı konum.", icon: Stamp, badge: "FREE", category: "resim", keywords: "filigran logo" },
  { to: "/araclar/exif", label: "EXIF Temizle", desc: "Konum/kamera metadata sil — gizlilik.", icon: ShieldCheck, badge: "FREE", category: "resim", keywords: "metadata gizlilik konum" },
  { to: "/araclar/pdf", label: "Resim → PDF", desc: "Birden fazla resmi tek PDF'e birleştir.", icon: FileText, badge: "FREE", category: "resim", keywords: "pdf birleştir" },
  { to: "/araclar/palet", label: "Renk Paleti", desc: "Resimden hakim renkleri hex olarak çıkar.", icon: Palette, badge: "FREE", category: "resim", keywords: "color palette hex" },
  { to: "/araclar/qr", label: "QR Kod Üret", desc: "URL/metin → özelleştirilebilir QR PNG.", icon: QrCode, badge: "FREE", category: "uretme", keywords: "qr barkod" },
  // Video
  { to: "/araclar/video-trim", label: "Video Kırp/Kes", desc: "Başlangıç-bitiş vererek hızlıca kes.", icon: Scissors, badge: "FREE", category: "video", keywords: "trim cut kes" },
  { to: "/araclar/video-gif", label: "Video → GIF", desc: "Video parçasını GIF'e çevir — FPS + boyut.", icon: Film, badge: "FREE", category: "video" },
  { to: "/araclar/video-sikistir", label: "Video Sıkıştır", desc: "H.264 + CRF ile dosya boyutunu düşür.", icon: Minimize2, badge: "FREE", category: "video" },
  { to: "/araclar/video-mp3", label: "Video → MP3", desc: "Videodan sesi çıkar ve MP3 indir.", icon: Music, badge: "FREE", category: "video", keywords: "ses audio çıkar" },
  { to: "/araclar/video-birlestir", label: "Video Birleştir", desc: "Birden fazla klibi sırayla birleştir.", icon: Layers, badge: "FREE", category: "video", keywords: "merge concat" },
  { to: "/araclar/video-watermark", label: "Video Watermark", desc: "Videoya metin filigranı ekle.", icon: Stamp, badge: "FREE", category: "video" },
  { to: "/araclar/video-hiz", label: "Video Hız Değiştir", desc: "0.5x yavaş / 2x-4x hızlı — ses senkron.", icon: Gauge, badge: "FREE", category: "video", keywords: "speed slowmo" },
  { to: "/araclar/video-dondur", label: "Video Döndür/Çevir", desc: "90°/180° döndür veya çevir.", icon: RotateCw, badge: "FREE", category: "video" },
  { to: "/araclar/video-thumbnail", label: "Video Thumbnail", desc: "Kareden JPG kapak resmi çıkar.", icon: ImageIcon, badge: "FREE", category: "video", keywords: "kapak frame" },
  { to: "/araclar/video-sessiz", label: "Video Sessizleştir", desc: "Ses kanalını sil — görüntü aynı kalır.", icon: VolumeX, badge: "FREE", category: "video", keywords: "mute" },
  // Geliştirici
  { to: "/araclar/json", label: "JSON Formatter", desc: "JSON doğrula, beautify veya minify et.", icon: Braces, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/base64", label: "Base64 Kodla/Çöz", desc: "Metin & dosya ↔ Base64 (data URI).", icon: Binary, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/sayac", label: "Metin Sayaç", desc: "Kelime, karakter, okuma süresi — canlı.", icon: Type, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/renk", label: "Renk Çevirici", desc: "HEX ↔ RGB ↔ HSL + ton skalası.", icon: Palette, badge: "FREE", category: "gelistirici" },
  { to: "/araclar/uuid", label: "UUID / ID Üretici", desc: "UUID v4, NanoID, kısa kod ve hex token.", icon: Hash, badge: "FREE", category: "gelistirici", isNew: true, keywords: "id token random rastgele" },
  { to: "/araclar/url", label: "URL Kodla / Çöz", desc: "Encode/decode + query parametre analizi.", icon: Link2, badge: "FREE", category: "gelistirici", isNew: true, keywords: "urlencode query param" },
  { to: "/araclar/slug", label: "Slug Üretici", desc: "Türkçe karakterli başlıktan SEO URL üret.", icon: Type, badge: "FREE", category: "gelistirici", isNew: true, keywords: "seo url permalink türkçe" },
  // Güvenlik
  { to: "/araclar/sifre", label: "Şifre Üreteci", desc: "Kriptografik güçlü şifre + entropi analizi.", icon: KeyRound, badge: "FREE", category: "guvenlik", isNew: true, featured: true, keywords: "password parola güvenli" },
  { to: "/araclar/hash", label: "Hash Üretici", desc: "Metin/dosya → SHA-1/256/384/512 özeti.", icon: Fingerprint, badge: "FREE", category: "guvenlik", isNew: true, keywords: "sha md5 checksum bütünlük" },
  { to: "/araclar/jwt", label: "JWT Çözümleyici", desc: "Token header/payload çöz, süresini gör.", icon: ShieldAlert, badge: "FREE", category: "guvenlik", isNew: true, keywords: "token decode bearer" },
  { to: "/araclar/exif", label: "EXIF Temizle", desc: "Fotoğraftaki konum verisini sil.", icon: ShieldCheck, badge: "FREE", category: "guvenlik", keywords: "gizlilik metadata" },
  // AI Üretme
  { to: "/araclar/video", label: "AI Video", desc: "Prompt'tan cinematic video üret.", icon: Video, badge: "AI", category: "uretme", featured: true },
  { to: "/araclar/video-uzun", label: "AI Uzun Video", desc: "2-6 sahne yaz — otomatik birleştir.", icon: Film, badge: "AI", category: "uretme" },
];

const CATEGORIES: { id: "hepsi" | Category; label: string; icon: typeof Video; hint: string }[] = [
  { id: "hepsi", label: "Tümü", icon: LayoutGrid, hint: "bütün araçlar" },
  { id: "resim", label: "Resim", icon: PicIcon, hint: "görsel işlemleri" },
  { id: "video", label: "Video", icon: VidIcon, hint: "kesme, sıkıştırma, dönüştürme" },
  { id: "gelistirici", label: "Kod", icon: Code2, hint: "geliştirici yardımcıları" },
  { id: "guvenlik", label: "Güvenlik", icon: Lock, hint: "şifre, hash, gizlilik" },
  { id: "uretme", label: "AI", icon: Sparkles, hint: "yapay zeka üretimi" },
];

const FAV_KEY = "siber_tool_favs";
const RECENT_KEY = "siber_tool_recents";

function readStore(key: string): string[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

function Hub() {
  const [cat, setCat] = useState<"hepsi" | Category>("hepsi");
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [now, setNow] = useState<string>("--:--:--");

  useEffect(() => {
    setFavs(readStore(FAV_KEY));
    setRecents(readStore(RECENT_KEY));
    setNow(new Date().toLocaleTimeString("tr-TR", { hour12: false }));
    const t = setInterval(() => setNow(new Date().toLocaleTimeString("tr-TR", { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape" && typing && el === searchRef.current) { setQ(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFav = useCallback((to: string) => {
    setFavs((prev) => {
      const next = prev.includes(to) ? prev.filter((x) => x !== to) : [...prev, to];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const pushRecent = useCallback((to: string) => {
    setRecents((prev) => {
      const next = [to, ...prev.filter((x) => x !== to)].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const filtered = useMemo(() => TOOLS.filter((t) => {
    if (cat !== "hepsi" && t.category !== cat) return false;
    if (q.trim() && !`${t.label} ${t.desc} ${t.keywords ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [cat, q]);

  const byPath = useMemo(() => new Map(TOOLS.map((t) => [t.to, t])), []);
  const favTools = favs.map((f) => byPath.get(f)).filter(Boolean) as Tool[];
  const recentTools = recents.map((f) => byPath.get(f)).filter(Boolean) as Tool[];

  const featured = TOOLS.filter((t) => t.featured);
  const totalFree = TOOLS.filter((t) => t.badge === "FREE").length;
  const totalAi = TOOLS.filter((t) => t.badge === "AI").length;

  const grouped: Record<Category, Tool[]> = { resim: [], video: [], gelistirici: [], guvenlik: [], uretme: [] };
  for (const t of filtered) grouped[t.category].push(t);
  const showGrouped = cat === "hepsi" && !q.trim();


  return (
    <div className="space-y-6">
      {/* CINEMATIC HERO */}
      <section className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-background via-background to-primary/5 p-6 sm:p-8">
        <div className="cyber-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="hero-orb absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="hero-orb absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" aria-hidden style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-[11px] text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              LAB v2.0 — {TOOLS.length} araç çevrimiçi
            </div>

            <h1 className="font-mono text-3xl sm:text-5xl leading-tight">
              <span className="neon-text">Araç</span>
              <span className="text-foreground">Laboratuvarı</span>
              <span className="terminal-caret ml-1" />
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
              Görselini rötuşla, videonu kes, JSON'unu formatla veya bir prompt yaz — AI sana video üretsin. Hepsi <span className="text-primary font-semibold">tek yerde</span>, dosyaların hesabından dışarı çıkmaz.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <a href="#araclar" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-mono text-primary-foreground neon-glow hover:brightness-110 transition">
                <Zap className="h-4 w-4" /> Araçları keşfet
              </a>
              <Link
                to="/paketler/ai"
                className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-4 py-2 text-sm font-mono text-primary hover:bg-primary/10 transition"
              >
                <Sparkles className="h-4 w-4" /> AI paketleri
              </Link>
            </div>
          </div>

          {/* TERMINAL WIDGET */}
          <div className="relative">
            <div className="glass-card rounded-lg border-primary/30 overflow-hidden">
              <div className="flex items-center justify-between border-b border-primary/20 bg-black/40 px-3 py-2 font-mono text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500/70" />
                  <span className="h-2 w-2 rounded-full bg-yellow-500/70" />
                  <span className="h-2 w-2 rounded-full bg-primary/70" />
                  <span className="ml-2">lab.siberphp ~ status</span>
                </div>
                <span>{now}</span>
              </div>
              <div className="p-4 font-mono text-xs space-y-2">
                <StatRow icon={InfIcon} label="Ücretsiz araçlar" value={`${totalFree}`} accent />
                <StatRow icon={Cpu} label="AI üretim modülü" value={`${totalAi}`} />
                <StatRow icon={ShieldCheck} label="Dosya sunucuya çıkışı" value="0" mute />
                <div className="pt-2 border-t border-primary/10 space-y-1">
                  <div className="text-muted-foreground">$ available_categories</div>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORIES.filter((c) => c.id !== "hepsi").map((c) => (
                      <span key={c.id} className="rounded border border-primary/20 px-1.5 py-0.5 text-primary/80 text-[10px]">
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="scan-line pointer-events-none absolute inset-0" aria-hidden />
          </div>
        </div>
      </section>

      {/* FAVORİLER */}
      {favTools.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-400" />
            <h2 className="font-mono text-sm text-yellow-400">Favorilerim</h2>
            <span className="font-mono text-[10px] text-muted-foreground">// yıldıza basarak ekle</span>
          </div>
          <ToolGrid tools={favTools} favs={favs} onFav={toggleFav} onOpen={pushRecent} />
        </section>
      )}

      {/* SON KULLANILANLAR */}
      {recentTools.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-mono text-sm text-primary">Son kullandıkların</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentTools.map((t) => {
              const Icon = t.icon;
              return (
                <Link
                  key={`r-${t.to}`}
                  to={t.to as "/araclar/palet"}
                  onClick={() => pushRecent(t.to)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-card/40 px-3 py-1.5 font-mono text-xs text-muted-foreground hover:border-primary hover:text-primary transition"
                >
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* SPOTLIGHT / FEATURED */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-mono text-sm text-primary">Öne çıkanlar</h2>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">// en çok kullanılan araçlar</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {featured.map((t) => <FeaturedCard key={t.to} tool={t} onOpen={pushRecent} />)}
        </div>
      </section>

      {/* KONTROL PANELİ */}
      <section id="araclar" className="glass-card rounded-lg p-3 space-y-3 sticky top-2 z-20 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Araç ara — örn: 'arka plan', 'gif', 'şifre'..."
            className="w-full rounded-md bg-black/40 border border-primary/30 pl-9 pr-20 py-2.5 font-mono text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:shadow-[0_0_20px_hsl(var(--primary)/0.2)] transition"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Aramayı temizle"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:block rounded border border-primary/25 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">/</kbd>
          )}
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
                title={c.hint}
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
      </section>

      {/* GRID */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-lg p-10 text-center space-y-2">
          <div className="font-mono text-sm text-muted-foreground">// no match</div>
          <div className="font-mono text-xs text-muted-foreground/60">Aramanı temizle veya farklı bir kategori dene.</div>
        </div>
      ) : showGrouped ? (
        <div className="space-y-8">
          {CATEGORIES.filter((c) => c.id !== "hepsi").map((c) => {
            const list = grouped[c.id as Category];
            if (list.length === 0) return null;
            const Icon = c.icon;
            return (
              <section key={c.id} className="space-y-3">
                <div className="flex items-center gap-3 border-b border-primary/20 pb-2">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-1.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-mono text-sm text-primary">./{c.id}</h3>
                    <div className="font-mono text-[10px] text-muted-foreground">{c.hint} · {list.length} araç</div>
                  </div>
                </div>
                <ToolGrid tools={list} favs={favs} onFav={toggleFav} onOpen={pushRecent} />
              </section>
            );
          })}
        </div>
      ) : (
        <ToolGrid tools={filtered} favs={favs} onFav={toggleFav} onOpen={pushRecent} />
      )}

    </div>
  );
}

function StatRow({ icon: Icon, label, value, accent, mute }: { icon: typeof Video; label: string; value: string; accent?: boolean; mute?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className={`h-3 w-3 ${accent ? "text-primary" : ""}`} /> {label}
      </span>
      <span className={`${accent ? "text-primary neon-text-glow" : mute ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function FeaturedCard({ tool, onOpen }: { tool: Tool; onOpen: (to: string) => void }) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.to as "/araclar/palet"}
      onClick={() => onOpen(tool.to)}
      className="group relative overflow-hidden rounded-lg border border-primary/30 bg-gradient-to-br from-background to-primary/5 p-4 hover:border-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.35)] transition-all"
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/20 transition" aria-hidden />
      <div className="relative flex items-start justify-between">
        <div className="rounded-md border border-primary/30 bg-primary/10 p-2.5 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className={`font-mono text-[10px] rounded-full border px-2 py-0.5 ${tool.badge === "FREE" ? "border-primary/40 text-primary" : "border-yellow-400/40 text-yellow-400"}`}>
          {tool.badge}
        </span>
      </div>
      <div className="relative mt-3 font-mono text-sm text-foreground">{tool.label}</div>
      <p className="relative mt-1 text-xs text-muted-foreground">{tool.desc}</p>
      <div className="relative mt-3 inline-flex items-center gap-1 font-mono text-[10px] text-primary opacity-70 group-hover:opacity-100 transition">
        aç <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition" />
      </div>
    </Link>
  );
}

function ToolGrid({
  tools,
  favs,
  onFav,
  onOpen,
}: {
  tools: Tool[];
  favs: string[];
  onFav: (to: string) => void;
  onOpen: (to: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => {
        const Icon = t.icon;
        const isFav = favs.includes(t.to);
        return (
          <div key={`${t.category}-${t.to}`} className="relative">
            <Link
              to={t.to as "/araclar/palet"}
              onClick={() => onOpen(t.to)}
              className="group block relative overflow-hidden rounded-lg border border-primary/15 bg-card/40 backdrop-blur p-4 hover:border-primary/60 hover:bg-card/70 hover:shadow-[0_0_20px_hsl(var(--primary)/0.25)] transition-all"
            >
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition" aria-hidden />
              <div className="flex items-center gap-2 pr-7">
                <div className="rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary/20 group-hover:scale-105 transition-transform">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-mono text-sm text-foreground flex-1 truncate">{t.label}</div>
                {t.isNew && (
                  <span className="text-[9px] font-mono rounded px-1.5 py-0.5 border border-primary/50 bg-primary/10 text-primary">YENİ</span>
                )}
                <span className={`text-[10px] font-mono rounded px-1.5 py-0.5 border ${t.badge === "FREE" ? "border-primary/30 text-primary/80" : "border-yellow-400/30 text-yellow-400/80"}`}>
                  {t.badge}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{t.desc}</p>
            </Link>
            <button
              type="button"
              onClick={() => onFav(t.to)}
              aria-label={isFav ? `${t.label} favorilerden çıkar` : `${t.label} favorilere ekle`}
              className={`absolute right-2 top-2 z-10 rounded p-1 transition ${isFav ? "text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`}
            >
              <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
            </button>
          </div>
        );
      })}

    </div>
  );
}
