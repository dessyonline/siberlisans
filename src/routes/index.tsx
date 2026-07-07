import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShieldCheck,
  Zap,
  Lock,
  KeyRound,
  Terminal,
  CheckCircle2,
  Cpu,
  Wifi,
  Star,
  Search,
  X,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const DURATION_LABEL: Record<string, string> = {
  monthly: "aylık",
  yearly: "yıllık",
  lifetime: "ömürlük",
};

function Index() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, image_url, category, featured, manual_fulfillment, stock_hint, unlimited_stock, created_at, license_keys(status)")
        .eq("active", true)
        .order("price_try");
      if (error) throw error;
      return data;
    },
  });

  const featured = (products ?? []).filter((p) => p.featured);

  const recent = useMemo(() => {
    return [...(products ?? [])]
      .sort(
        (a, b) =>
          new Date((b as { created_at: string }).created_at).getTime() -
          new Date((a as { created_at: string }).created_at).getTime(),
      )
      .slice(0, 8);
  }, [products]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [products, search]);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="mx-auto max-w-6xl px-4 pt-24 pb-20">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-mono text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-muted-foreground">system_online</span>
                <span className="text-primary">·</span>
                <span className="text-primary">anlık teslim aktif</span>
              </div>
              <h1 className="mt-6 text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
                Yazılım lisansları<br />
                <span className="text-primary">güvenli</span> ve <span className="text-primary">anında</span>.
              </h1>
              <p className="mt-6 max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
                Havale / EFT ile öde, referans kodunla eşleştir, anahtarını saniyeler
                içinde teslim al. Tüm süreç uçtan uca şifrelidir.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="font-medium">
                  <Link to="/urunler">Lisansları keşfet</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-medium">
                  <Link to="/nasil-calisir">Nasıl çalışır</Link>
                </Button>
              </div>
              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                {[
                  { icon: Lock, label: "AES-256" },
                  { icon: ShieldCheck, label: "TLS 1.3" },
                  { icon: Zap, label: "Anlık" },
                  { icon: Cpu, label: "RLS" },
                ].map((b) => (
                  <div key={b.label} className="rounded-md border border-border/60 bg-card/40 p-2.5 flex items-center justify-center gap-2">
                    <b.icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero side panel: featured preview / terminal */}
            <div className="hidden lg:block">
              <div className="glass-card rounded-2xl p-1 neon-glow">
                <div className="rounded-xl border border-border/40 bg-background/60 p-5 font-mono text-xs">
                  <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                    <span className="h-2 w-2 rounded-full bg-destructive/70" />
                    <span className="h-2 w-2 rounded-full bg-warn/70" />
                    <span className="h-2 w-2 rounded-full bg-primary/70" />
                    <span className="ml-2 text-muted-foreground">siberphp@secure</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-muted-foreground">
                    <div><span className="text-primary">$</span> connect --secure</div>
                    <div className="text-primary">[✓] TLS 1.3 handshake OK</div>
                    <div className="text-primary">[✓] session encrypted</div>
                    <div><span className="text-primary">$</span> order --list</div>
                    <div className="text-foreground">→ {featured.length} öne çıkan ürün</div>
                    <div className="text-foreground">→ {(products?.length ?? 0)} aktif lisans</div>
                    <div><span className="text-primary">$</span> _<span className="terminal-caret" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-4">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                <Star className="h-3 w-3 text-warn fill-warn" /> öne çıkan
              </div>
              <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                Popüler Lisanslar
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/urunler">Tümünü gör →</Link>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 6).map((p) => (
              <ProductCard key={p.id} p={p} featured />
            ))}
          </div>
        </section>
      )}

      {/* PRODUCTS */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 font-mono">
          <div className="text-xs text-muted-foreground">$ ls /var/licenses/available</div>
          <h2 className="mt-2 text-2xl sm:text-3xl neon-text">Aktif Lisanslar</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(products ?? []).slice(0, 9).map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
          {!products && (
            <div className="col-span-full text-center text-muted-foreground font-mono text-sm py-12">
              yükleniyor...
            </div>
          )}
        </div>
        {(products?.length ?? 0) > 9 && (
          <div className="mt-8 flex justify-center">
            <Button asChild variant="outline" className="font-mono">
              <Link to="/urunler">tüm lisansları gör →</Link>
            </Button>
          </div>
        )}
      </section>


      {/* HOW IT WORKS */}
      <section id="nasil-calisir" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 font-mono">
          <div className="text-xs text-muted-foreground">$ man siberphp</div>
          <h2 className="mt-2 text-2xl sm:text-3xl neon-text">Nasıl Çalışır?</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "01", t: "Ürün Seç", d: "Kataloğumuzdan lisansı seç, satın al butonuna bas." },
            { n: "02", t: "Havale Yap", d: "Otomatik oluşturulan referans kodunu açıklamaya yazarak transfer et." },
            { n: "03", t: "Dekont Yükle", d: "Panel üzerinden dekont/makbuz görselini yükle." },
            { n: "04", t: "Anahtarını Al", d: "Onay sonrası key panelde ve e-postanda görünür." },
          ].map((s) => (
            <div key={s.n} className="glass-card rounded-lg p-5">
              <div className="font-mono text-3xl neon-text">{s.n}</div>
              <div className="mt-2 font-mono font-semibold">{s.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECURITY */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="glass-card rounded-xl p-8 sm:p-10 scan-line">
          <div className="grid gap-8 md:grid-cols-2 items-center">
            <div>
              <div className="font-mono text-xs text-muted-foreground">$ security --status</div>
              <h2 className="mt-2 font-mono text-2xl sm:text-3xl neon-text">
                Güvenlik Katmanları
              </h2>
              <p className="mt-3 text-muted-foreground">
                Her satın alma; uçtan uca şifreli aktarım, izole edilmiş key havuzu ve rol
                tabanlı erişim kontrolü ile korunur.
              </p>
            </div>
            <ul className="space-y-3 font-mono text-sm">
              {[
                "Row Level Security politikaları",
                "SHA-256 imzalı sipariş referansları",
                "İzole key havuzu — atomic atama",
                "Şifreli dekont depolama",
                "Şüpheli aktivite izleme",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="sss" className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-8 font-mono">
          <div className="text-xs text-muted-foreground">$ cat FAQ.md</div>
          <h2 className="mt-2 text-2xl sm:text-3xl neon-text">Sık Sorulan Sorular</h2>
        </div>
        <Accordion type="single" collapsible className="glass-card rounded-lg px-6">
          {[
            {
              q: "Kredi kartı ile ödeme yapabilir miyim?",
              a: "Hayır. SiberPHP güvenlik politikası gereği yalnızca banka havalesi / EFT kabul eder.",
            },
            {
              q: "Ödeme sonrası anahtarı ne kadar sürede alırım?",
              a: "Dekont onayından sonra saniyeler içinde e-postanıza ve panelinize düşer. Ortalama onay süresi çalışma saatlerinde 5–15 dakikadır.",
            },
            {
              q: "Anahtarım çalışmazsa ne olur?",
              a: "24 saat içinde destek üzerinden ulaşırsanız yeni bir key ile değiştiririz.",
            },
            {
              q: "Faturamı alabilir miyim?",
              a: "Evet, kurumsal müşteriler için e-arşiv fatura düzenlenir.",
            },
          ].map((item, i) => (
            <AccordionItem key={i} value={`i${i}`}>
              <AccordionTrigger className="font-mono text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* SUPPORT */}
      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div className="glass-card rounded-lg p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-mono">
            <Wifi className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm">Canlı destek hattı aktif</div>
              <div className="text-xs text-muted-foreground">7/24 · Ortalama yanıt: 3 dk</div>
            </div>
          </div>
          <Button variant="outline" className="font-mono">
            <Terminal className="mr-2 h-4 w-4" />destek başlat
          </Button>
        </div>
      </section>
    </div>
  );
}

function ProductCard({
  p,
  featured,
}: {
  p: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    duration: string;
    price_try: number;
    image_url?: string | null;
    category?: string | null;
    manual_fulfillment?: boolean | null;
    stock_hint?: number | null;
    unlimited_stock?: boolean | null;
    license_keys?: { status: string }[] | null;
  };
  featured?: boolean;
}) {
  const manual = !!p.manual_fulfillment;
  const unlimited = !!p.unlimited_stock;
  const liveStock = (p.license_keys ?? []).filter((k) => k.status === "available").length;
  const stock = liveStock > 0 ? liveStock : (p.stock_hint ?? 0);
  const soldOut = !manual && !unlimited && stock === 0;
  return (
    <div className={`glass-card rounded-xl p-5 flex flex-col group transition-all hover:-translate-y-0.5 hover:border-primary/40 ${featured ? "border-warn/30" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 uppercase tracking-wider">
            {featured && <Star className="h-3 w-3 text-warn fill-warn" />}
            {p.category ?? "license"}
          </div>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight truncate">{p.name}</h3>
        </div>
        <KeyRound className="h-5 w-5 text-primary opacity-60 shrink-0" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">{p.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="rounded-md bg-muted/40 text-muted-foreground border border-border px-2 py-0.5">
          {DURATION_LABEL[p.duration] ?? p.duration}
        </span>
        <span className={`rounded-md px-2 py-0.5 border ${unlimited || manual ? "text-cyan border-cyan/40 bg-cyan/5" : soldOut ? "text-destructive border-destructive/40 bg-destructive/5" : "text-primary border-primary/40 bg-primary/5"}`}>
          {unlimited ? "stok: ∞" : manual ? "sipariş sonrası" : soldOut ? "tükendi" : `stok: ${stock}`}
        </span>
      </div>
      <div className="mt-auto pt-5 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">fiyat</div>
          <div className="font-mono text-2xl font-semibold text-primary">
            ₺{Number(p.price_try).toLocaleString("tr-TR")}
          </div>
        </div>
        <Button asChild size="sm" disabled={soldOut}>
          <Link to="/urun/$slug" params={{ slug: p.slug }}>
            {soldOut ? "tükendi" : "Satın al →"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
