import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * Admin gezerken ürün kartlarının köşesinde beliren düzenleme rozeti.
 * Sadece admin rolü olan kullanıcılara görünür; tıklama üst kartın Link'ini
 * tetiklemesin diye event yayılımını durdurur.
 */
export function AdminEditBadge({ productId, className }: { productId: string; className?: string }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return (
    <Link
      to="/admin/urunler"
      search={{ edit: productId } as never}
      onClick={(e) => e.stopPropagation()}
      title="Ürünü düzenle"
      className={
        "absolute top-2 right-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md " +
        "border border-primary/40 bg-background/80 backdrop-blur text-primary shadow-sm " +
        "hover:bg-primary hover:text-background transition-colors neon-glow " +
        (className ?? "")
      }
    >
      <Pencil className="h-3.5 w-3.5" />
    </Link>
  );
}
