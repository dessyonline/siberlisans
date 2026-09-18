import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getAlsoBoughtProducts } from "@/lib/storefront.functions";
import { Users, ArrowRight } from "lucide-react";
import { ProductLogo } from "@/components/ProductLogo";

type AlsoBought = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price_try: number | null;
  category: string | null;
  buyers: number;
};

export function AlsoBoughtSection({ productId }: { productId: string }) {
  const fetchAlsoBought = useServerFn(getAlsoBoughtProducts);
  const { data: items = [] } = useQuery({
    queryKey: ["also-bought", productId],
    staleTime: 5 * 60_000,
    queryFn: async () => (await fetchAlsoBought({ data: { productId, limit: 6 } })) as AlsoBought[],
  });

  if (items.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-mono text-sm text-primary">bunu alanlar bunları da aldı</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map((p) => (
          <Link
            key={p.id}
            to="/urun/$slug"
            params={{ slug: p.slug }}
            className="glass-card corner-cut p-3 group hover:border-primary/50 transition-colors flex flex-col gap-2"
          >
            <ProductLogo name={p.name} src={p.image_url} className="h-10 w-10" />
            <span className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">
              {p.name}
            </span>
            <span className="font-mono text-[11px] text-primary mt-auto">
              {p.price_try ? `₺${Number(p.price_try).toLocaleString("tr-TR")}` : "—"}
            </span>
            {p.buyers > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {p.buyers} kişi birlikte aldı
              </span>
            )}
          </Link>
        ))}
      </div>
      <Link
        to="/urunler"
        className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary transition-colors"
      >
        tüm ürünler <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
