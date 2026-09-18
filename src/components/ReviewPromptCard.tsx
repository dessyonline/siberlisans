import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { upsertReview, getPendingReviewProducts, type PendingReviewProduct } from "@/lib/reviews.functions";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, MessageSquarePlus, X } from "lucide-react";

export const REVIEW_POINTS = 20;

/**
 * Satın alma sonrası "yorum yap, puan kazan" daveti.
 * productId verilirse sadece o ürünü hedefler (ödeme sayfası),
 * verilmezse yorumlanmamış tüm ürünleri listeler (hesabım).
 */
export function ReviewPromptCard({ productId, limit = 3 }: { productId?: string; limit?: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertReview);
  const pendingFn = useServerFn(getPendingReviewProducts);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: pending = [] } = useQuery({
    queryKey: ["pending-reviews", user?.id],
    enabled: !!user,
    queryFn: () => pendingFn(),
  });

  const list = pending
    .filter((p) => (productId ? p.product_id === productId : true))
    .filter((p) => !dismissed.includes(p.product_id))
    .slice(0, productId ? 1 : limit);

  if (!user || list.length === 0) return null;

  async function submit(pid: string) {
    setBusy(true);
    try {
      await upsertFn({ data: { productId: pid, rating, comment: comment.trim() || null } });
      toast.success(`Teşekkürler! +${REVIEW_POINTS} puan hesabına eklendi 🎉`);
      setActive(null);
      setComment("");
      setRating(5);
      qc.invalidateQueries({ queryKey: ["pending-reviews"] });
      qc.invalidateQueries({ queryKey: ["reviews", pid] });
      qc.invalidateQueries({ queryKey: ["points"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-card corner-cut rounded-md border border-primary/40 p-4 neon-glow">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-mono text-sm text-primary">./yorum_yap → +{REVIEW_POINTS} puan</h3>
      </div>
      <p className="text-xs font-mono text-muted-foreground mb-3">
        Satın aldığın ürünü değerlendir, her yorum için {REVIEW_POINTS} puan kazan.
      </p>
      <ul className="space-y-2">
        {list.map((p) => (
          <li key={p.product_id} className="rounded-md border border-border/60 bg-card/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-foreground/90 truncate">{p.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant={active === p.product_id ? "secondary" : "default"}
                  className="font-mono text-[11px] h-7"
                  onClick={() => setActive(active === p.product_id ? null : p.product_id)}
                >
                  <MessageSquarePlus className="h-3 w-3 mr-1" />
                  {active === p.product_id ? "kapat" : "yorum yap"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setDismissed((d) => [...d, p.product_id])}
                  aria-label="daha sonra"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {active === p.product_id && (
              <div className="mt-3">
                <StarRating value={rating} onChange={setRating} interactive size={20} />
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Deneyimini kısaca paylaş (opsiyonel)"
                  className="mt-2 font-mono text-sm"
                  rows={3}
                  maxLength={1000}
                />
                <Button
                  size="sm"
                  className="mt-2 font-mono"
                  disabled={busy}
                  onClick={() => submit(p.product_id)}
                >
                  {busy ? "…" : `$ gönder ve +${REVIEW_POINTS} puan al`}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
