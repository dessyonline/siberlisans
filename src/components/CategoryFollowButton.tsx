import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BellPlus, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { followCategory, unfollowCategory, isFollowingCategory } from "@/lib/category-follow.functions";

export function CategoryFollowButton({ category }: { category: string }) {
  const { user, ensureUser } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const followFn = useServerFn(followCategory);
  const unfollowFn = useServerFn(unfollowCategory);
  const checkFn = useServerFn(isFollowingCategory);
  const [pending, setPending] = useState(false);

  const { data } = useQuery({
    queryKey: ["cat-follow", category, user?.id ?? "anon"],
    enabled: !!user,
    queryFn: () => checkFn({ data: { category } }),
  });
  const following = !!data?.following;

  const onClick = async () => {
    const me = user ?? (await ensureUser());
    if (!me) {
      toast("Takip etmek için giriş yap");
      navigate({ to: "/auth" });
      return;
    }
    setPending(true);
    try {
      if (following) {
        await unfollowFn({ data: { category } });
        toast.success(`${category} takibi bırakıldı`);
      } else {
        await followFn({ data: { category } });
        toast.success(`${category} kategorisine yeni ürün gelince haber vereceğiz`);
      }
      await qc.invalidateQueries({ queryKey: ["cat-follow", category] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 font-mono text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
    >
      {following ? <BellRing className="h-3.5 w-3.5 text-primary" /> : <BellPlus className="h-3.5 w-3.5" />}
      {following ? `${category} takip ediliyor` : `${category} kategorisine yeni ürün gelince haber ver`}
    </button>
  );
}
