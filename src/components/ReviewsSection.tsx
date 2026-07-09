import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { upsertReview, deleteMyReview } from "@/lib/reviews.functions";
import { StarRating } from "./StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquareText, Trash2 } from "lucide-react";

type Review = {
  id: string;
  masked_user: string;
  is_mine: boolean;
  rating: number;
  comment: string | null;
  created_at: string;
};

export function ReviewsSection({ productId }: { productId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertReview);
  const deleteFn = useServerFn(deleteMyReview);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: function not in generated types
        .rpc("list_product_reviews" as any, { _product_id: productId });
      if (error) throw error;
      return (data ?? []) as unknown as Review[];
    },
  });

  const mine = user ? reviews.find((r) => r.is_mine) : undefined;
  const hasReviewed = !!mine;

  // eligibility check: any approved order or order_items for this product+user
  const { data: canReview } = useQuery({
    queryKey: ["can-review", productId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const uid = user!.id;
      const { data: byOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", uid)
        .eq("status", "approved")
        .eq("product_id", productId)
        .limit(1);
      if (byOrder && byOrder.length > 0) return true;
      // find any order_items with this product, then check if any of those orders are ours + approved
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id")
        .eq("product_id", productId);
      const ids = (items ?? []).map((r) => r.order_id);
      if (ids.length === 0) return false;
      const { data: mine } = await supabase
        .from("orders")
        .select("id")
        .in("id", ids)
        .eq("user_id", uid)
        .eq("status", "approved")
        .limit(1);
      return !!(mine && mine.length > 0);
    },
  });

  async function submit() {
    if (rating < 1 || rating > 5) return;
    setSubmitting(true);
    try {
      await upsertFn({ data: { productId, rating, comment: comment.trim() || null } });
      toast.success(hasReviewed ? "Yorumun güncellendi" : "Yorumun eklendi");
      setComment("");
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
      qc.invalidateQueries({ queryKey: ["product", productId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!confirm("Yorumunu silmek istiyor musun?")) return;
    try {
      await deleteFn({ data: { productId } });
      toast.success("Yorumun silindi");
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="font-mono text-sm text-primary mb-3 flex items-center gap-2">
        <MessageSquareText className="h-4 w-4" />
        ./yorumlar
        <span className="text-muted-foreground">({reviews.length})</span>
      </h2>

      {user && canReview ? (
        <div className="glass-card rounded-md p-4 mb-4 border border-border/60">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">puanın:</span>
            <StarRating value={rating} onChange={setRating} interactive size={20} />
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={mine?.comment ?? "Deneyimini kısaca paylaş (opsiyonel)"}
            className="mt-3 font-mono text-sm"
            rows={3}
            maxLength={1000}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={submit} disabled={submitting} size="sm" className="font-mono">
              {submitting ? "…" : hasReviewed ? "$ güncelle" : "$ yorum ekle"}
            </Button>
            {hasReviewed && (
              <Button onClick={remove} variant="ghost" size="sm" className="text-destructive font-mono">
                <Trash2 className="h-3 w-3 mr-1" /> sil
              </Button>
            )}
          </div>
        </div>
      ) : user && !canReview ? (
        <div className="text-xs font-mono text-muted-foreground mb-4">
          Yorum bırakmak için bu ürünü satın almış olmalısın.
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-xs font-mono text-muted-foreground">yükleniyor…</div>
      ) : reviews.length === 0 ? (
        <div className="text-xs font-mono text-muted-foreground">Henüz yorum yok — ilk sen ol!</div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="glass-card rounded-md p-3 border border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StarRating value={r.rating} />
                  <span className="font-mono text-xs text-muted-foreground">
                    kullanıcı · {r.user_id.slice(0, 6)}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {new Date(r.created_at).toLocaleDateString("tr-TR")}
                </span>
              </div>
              {r.comment && (
                <p className="mt-2 text-sm font-mono text-foreground/90 whitespace-pre-wrap">{r.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
