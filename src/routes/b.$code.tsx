import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DEALER_CODE_KEY } from "@/components/DealerAttach";
import { Button } from "@/components/ui/button";
import { Handshake } from "lucide-react";

export const Route = createFileRoute("/b/$code")({
  head: () => ({
    meta: [
      { title: "Bayi daveti | SiberLisans" },
      {
        name: "description",
        content: "Yetkili SiberLisans bayisi seni davet etti. Kayıt ol, lisanslarını güvenle satın al.",
      },
      { property: "og:title", content: "Bayi daveti | SiberLisans" },
      { property: "og:description", content: "Yetkili bayi daveti ile kayıt ol, lisanslarını güvenle satın al." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealerInvite,
});

function DealerInvite() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem(DEALER_CODE_KEY, code);
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => navigate({ to: "/urunler" }), 2200);
    return () => clearTimeout(t);
  }, [code, navigate]);

  return (
    <div className="relative grid min-h-[70vh] place-items-center overflow-hidden px-4">
      <div className="cyber-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="hero-orb absolute -top-24 -left-24 h-80 w-80" aria-hidden />
      <div className="glass-card relative w-full max-w-md rounded-xl border border-primary/40 p-8 text-center corner-cut">
        <Handshake className="mx-auto h-10 w-10 text-primary" />
        <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-primary/80">
          $ ./dealer --link {code}
        </div>
        <h1 className="mt-2 font-mono text-2xl neon-text">Bayi daveti kabul edildi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hesabın bu yetkili bayiye bağlanacak. Ürünlere yönlendiriliyorsun…
        </p>
        <Button asChild className="mt-5 w-full font-mono">
          <Link to="/urunler">$ ürünlere git</Link>
        </Button>
      </div>
    </div>
  );
}
