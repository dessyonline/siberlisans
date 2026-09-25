import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toggleFavorite, listMyFavoriteIds } from "@/lib/favorites.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function FavoriteButton({
  productId,
  className = "",
  size = 18,
}: {
  productId: string;
  className?: string;
  size?: number;
}) {
  const { user, ensureUser } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listMyFavoriteIds);
  const toggleFn = useServerFn(toggleFavorite);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["my-favorites"],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const [busy, setBusy] = useState(false);
  const [localFavored, setLocalFavored] = useState<boolean | null>(null);
  const isFav = localFavored ?? (data?.productIds ?? []).includes(productId);

  useEffect(() => {
    setLocalFavored(null);
  }, [data]);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!(user ?? (await ensureUser()))) {
      toast("Favorilere eklemek için giriş yap");
      navigate({ to: "/auth" });
      return;
    }
    setBusy(true);
    try {
      const res = await toggleFn({ data: { productId } });
      setLocalFavored(res.favored);
      toast.success(res.favored ? "Favorilere eklendi" : "Favorilerden çıkarıldı");
      qc.invalidateQueries({ queryKey: ["my-favorites"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={isFav ? "Favorilerden çıkar" : "Favorilere ekle"}
      className={`inline-flex items-center justify-center h-9 w-9 rounded border border-border/60 bg-background/70 hover:border-primary/60 transition ${className}`}
    >
      <Heart
        width={size}
        height={size}
        className={isFav ? "fill-destructive text-destructive" : "text-muted-foreground"}
      />
    </button>
  );
}
