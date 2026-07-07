import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, duration, price_try, image_url, category, featured, manual_fulfillment, stock_hint, license_keys(status)")
        .eq("active", true)
        .order("price_try");
      if (error) throw error;
      return data;
    },
  });

  const featured = (products ?? []).filter((p) => p.featured);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full glass-card px-4 py-1 font-mono text-xs">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-muted-foreground">SYSTEM_ONLINE</span>
            <span className="text-primary">·</span>
            <span>anlık teslimat aktif</span>
          </div>
          <h1 className="mt-8 font-mono text-4xl sm:text-6xl font-bold leading-tight glitch">
            Lisansını <span className="neon-text">Sanal</span> Değil,
            <br />
            <span className="cyan-text">Siber Güvenle</span> Al
            <span className="terminal-caret" />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground">
            SiberPHP, yazılım lisans anahtarlarını{" "}
            <span className="text-primary font-mono">havale/EFT</span> ile satın alıp
            saniyeler içinde teslim alabileceğin şifreli bir dağıtım katmanıdır.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="font-mono neon-glow">
              <Link to="/urunler">{"> "}lisansları gör</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-mono">
              <Link to="/nasil-calisir">./nasıl-çalışır</Link>
            </Button>
          </div>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto font-mono text-xs">
            {[
              { icon: Lock, label: "AES-256" },
              { icon: ShieldCheck, label: "SSL/TLS 1.3" },
              { icon: Zap, label: "Anlık Teslim" },
              { icon: Cpu, label: "RLS Korumalı" },
            ].map((b) => (
              <div key={b.label} className="glass-card rounded-md p-3 flex items-center justify-center gap-2">
                <b.icon className="h-4 w-4 text-primary" />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-8 font-mono">
          <div className="text-xs text-muted-foreground">$ ls /var/licenses/available</div>
          <h2 className="mt-2 text-2xl sm:text-3xl neon-text">Aktif Lisanslar</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(products ?? []).map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
          {!products && (
            <div className="col-span-full text-center text-muted-foreground font-mono text-sm py-12">
              yükleniyor...
            </div>
          )}
        </div>
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
}: {
  p: { id: string; name: string; slug: string; description: string | null; duration: string; price_try: number };
}) {
  return (
    <div className="glass-card rounded-lg p-5 flex flex-col group hover:neon-glow transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">./license</div>
          <h3 className="mt-1 font-mono text-lg font-semibold">{p.name}</h3>
        </div>
        <KeyRound className="h-5 w-5 text-primary opacity-70" />
      </div>
      <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{p.description}</p>
      <div className="mt-4 flex items-center gap-2 font-mono text-xs">
        <span className="rounded bg-primary/10 text-primary border border-primary/30 px-2 py-0.5">
          {DURATION_LABEL[p.duration] ?? p.duration}
        </span>
      </div>
      <div className="mt-auto pt-5 flex items-end justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">fiyat</div>
          <div className="font-mono text-2xl neon-text">
            ₺{Number(p.price_try).toLocaleString("tr-TR")}
          </div>
        </div>
        <Button asChild size="sm" className="font-mono">
          <Link to="/urun/$slug" params={{ slug: p.slug }}>satın al →</Link>
        </Button>
      </div>
    </div>
  );
}
