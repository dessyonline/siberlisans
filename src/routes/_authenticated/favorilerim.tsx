import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyFavoriteProducts } from "@/lib/favorites.functions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Heart, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/favorilerim")({
  component: FavoritesPage,
  head: () => ({
    meta: [
      { title: "Favorilerim — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Product = {
  id: string;
  slug: string;
  name: string;
  price_try: number;
  image_url: string | null;
  active: boolean;
};

function FavoritesPage() {
  const listFn = useServerFn(listMyFavoriteProducts);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["fav-products"],
    queryFn: async () => (await listFn()) as Product[],
  });
  const ids = products.map((p) => p.id);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="font-mono text-2xl neon-text mb-6 flex items-center gap-2">
        <Heart className="h-5 w-5 text-destructive fill-destructive" />
        ./favorilerim
      </h1>

      {ids.length === 0 && !isLoading && (
        <div className="text-center py-16 font-mono text-muted-foreground">
          <Heart className="mx-auto mb-3 h-10 w-10 text-primary/40" />
          <div>Henüz favori ürünün yok</div>
          <Link to="/urunler" className="mt-3 inline-block text-primary hover:underline">
            $ ürünlere göz at
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => (
          <div key={p.id} className="glass-card rounded-md p-4 border border-border/60 relative">
            <FavoriteButton productId={p.id} className="absolute top-3 right-3" />
            <Link to="/urun/$slug" params={{ slug: p.slug }} className="block">
              <div className="h-32 rounded bg-black/40 flex items-center justify-center overflow-hidden mb-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-contain p-2" />
                ) : (
                  <Package className="h-8 w-8 text-primary/40" />
                )}
              </div>
              <div className="font-mono text-sm truncate">{p.name}</div>
              <div className="mt-1 font-mono text-primary text-lg neon-text">
                ₺{Number(p.price_try).toLocaleString("tr-TR")}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
