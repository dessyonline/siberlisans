import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";

/**
 * Puan indirimi widget'ı. code_snapshot='PUAN-<miktar>' formatında order_discounts'a yazar.
 * Zaten PUAN indirimi uygulanmışsa "iade et" butonu gösterir.
 * Aktif bir başka indirim varsa (kupon) hiç render etmez.
 */
export function PointsBlock({
  orderId,
  originalPrice,
  hasOtherDiscount,
  appliedPointsAmount,
}: {
  orderId: string;
  originalPrice: number;
  hasOtherDiscount: boolean;
  appliedPointsAmount: number | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile-points", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("total_points, tier")
        .eq("id", user!.id)
        .single();
      return {
        points: (data?.total_points as number | undefined) ?? 0,
        tier: (data?.tier as string | undefined) ?? "bronze",
      };
    },
  });

  if (hasOtherDiscount && !appliedPointsAmount) return null;

  const maxDiscountTry = Math.floor(originalPrice * 0.3);
  const maxPointsForOrder = maxDiscountTry * 100;
  const usable = Math.min(profile?.points ?? 0, maxPointsForOrder);
  const parsed = Math.max(0, Math.floor(Number(amount) || 0));
  const previewDiscount = Math.min(parsed / 100, maxDiscountTry);

  const apply = async () => {
    if (parsed < 100) {
      toast.error("En az 100 puan kullanabilirsin");
      return;
    }
    if (parsed > (profile?.points ?? 0)) {
      toast.error("Yetersiz puan");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("spend_points" as never, {
        _amount: parsed,
        _order_id: orderId,
      } as never);
      if (error) throw new Error(error.message);
      const disc = Array.isArray(data) ? data[0] : data;
      toast.success(
        `−₺${Number((disc as { discount_try: number })?.discount_try ?? 0).toLocaleString("tr-TR")} indirim uygulandı`,
      );
      setAmount("");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["profile-points"] });
      qc.invalidateQueries({ queryKey: ["tier-card"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const refund = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("refund_points_discount" as never, {
        _order_id: orderId,
      } as never);
      if (error) throw new Error(error.message);
      toast.success("Puanların iade edildi");
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["profile-points"] });
      qc.invalidateQueries({ queryKey: ["tier-card"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card rounded-lg p-5">
      <div className="flex items-center gap-2 font-mono text-sm">
        <Trophy className="h-4 w-4 text-primary" />
        <span className="neon-text">Puanlarınla Öde</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          bakiye: <span className="text-primary">{(profile?.points ?? 0).toLocaleString("tr-TR")}</span>
        </span>
      </div>

      {appliedPointsAmount ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-primary text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {appliedPointsAmount.toLocaleString("tr-TR")} puan kullanıldı · −₺
              {(appliedPointsAmount / 100).toLocaleString("tr-TR")}
            </div>
            <div className="mt-1 text-[11px] font-mono text-muted-foreground">
              vazgeçersen puanların anında hesabına geri döner
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={refund} disabled={busy}>
            iade et
          </Button>
        </div>
      ) : (profile?.points ?? 0) < 100 ? (
        <div className="mt-3 text-[11px] font-mono text-muted-foreground">
          en az 100 puan gerekli. Sipariş verdikçe ve yorum yazdıkça puan kazanırsın.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input
              type="number"
              min={100}
              step={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`en fazla ${usable.toLocaleString("tr-TR")}`}
              className="font-mono"
            />
            <Button onClick={apply} disabled={busy || parsed < 100}>
              uygula
            </Button>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>100 puan = ₺1 · sepetin en fazla %30'u indirilebilir</span>
            {parsed >= 100 && (
              <span className="text-primary">−₺{previewDiscount.toLocaleString("tr-TR")}</span>
            )}
          </div>
          {usable < (profile?.points ?? 0) && (
            <button
              type="button"
              onClick={() => setAmount(String(usable))}
              className="text-[11px] font-mono text-primary hover:underline"
            >
              maksimum kullan ({usable.toLocaleString("tr-TR")} puan → ₺
              {(usable / 100).toLocaleString("tr-TR")})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
