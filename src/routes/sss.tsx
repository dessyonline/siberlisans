import { createFileRoute } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQS = [
  { q: "Kredi kartı ile ödeme yapabilir miyim?", a: "Hayır. SiberPHP güvenlik politikası gereği yalnızca banka havalesi / EFT kabul eder." },
  { q: "Ödeme sonrası anahtarı ne kadar sürede alırım?", a: "Dekont onayından sonra saniyeler içinde. Ortalama onay 5-15 dakika." },
  { q: "Anahtarım çalışmazsa?", a: "24 saat içinde destek ile iletişime geçerseniz yeni bir key ile değiştiririz." },
  { q: "Siparişimi nereden takip ederim?", a: "Hesabım sayfasındaki siparişler bölümünden durumunu anlık görebilirsiniz." },
  { q: "Kişisel verilerim güvende mi?", a: "Tüm veriler AES-256 ile şifrelenir; KVKK uyumluluğu sağlanır." },
];

export const Route = createFileRoute("/sss")({
  component: () => (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="font-mono text-xs text-muted-foreground">$ cat FAQ.md</div>
      <h1 className="mt-2 font-mono text-3xl neon-text">Sık Sorulan Sorular</h1>
      <Accordion type="single" collapsible className="glass-card mt-6 rounded-lg px-6">
        {FAQS.map((f, i) => (
          <AccordionItem key={i} value={`i${i}`}>
            <AccordionTrigger className="font-mono text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Sık Sorulan Sorular — SiberPHP" },
      {
        name: "description",
        content: "Ödeme, teslim süresi, key değişimi, fatura, KVKK — SiberPHP hakkında en çok sorulan soruların yanıtları.",
      },
      { property: "og:title", content: "SSS — SiberPHP" },
      { property: "og:description", content: "SiberPHP hakkında en çok sorulan sorular ve yanıtları." },
      { property: "og:url", content: "https://siberlisans.lovable.app/sss" },
    ],
    links: [{ rel: "canonical", href: "https://siberlisans.lovable.app/sss" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
});
