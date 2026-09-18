import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMissions, claimMission, redeemPointsForCoupon } from "@/lib/missions.functions";
import { getAccountHero } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Trophy, Sparkles, Copy, Gift, Target, ArrowLeft, Crown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gorevler")({
  component: MissionsPage,
  head: () => ({
    meta: [
      { title: "Görevler & Puan Bozdur — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const REDEEM_TIERS = [
  { pts: 500, try: 10 },
  { pts: 1000, try: 25 },
  { pts: 2000, try: 60 },
];

function MissionsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listMissions);
  const claimFn = useServerFn(claimMission);
  const redeemFn = useServerFn(redeemPointsForCoupon);
  const heroFn = useServerFn(getAccountHero);

  const { data: missions, isLoading } = useQuery({
    queryKey: ["missions"],
    queryFn: () => listFn(),
  });

  const { data: profile } = useQuery({
    queryKey: ["profile-points-missions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const hero = await heroFn();
      return {
        points: hero.total_points ?? 0,
        tier: hero.tier ?? "bronze",
      };
    },
  });

  const claim = useMutation({
    mutationFn: (missionId: string) => claimFn({ data: { missionId } }),
    onSuccess: (r) => {
      if (r.awarded > 0) toast.success(`+${r.awarded} puan kazandın!`);
      else toast.info("henüz tamamlanmadı ya da zaten alındı");
      qc.invalidateQueries({ queryKey: ["missions"] });
      qc.invalidateQueries({ queryKey: ["profile-points-missions"] });
      qc.invalidateQueries({ queryKey: ["tier-card"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const redeem = useMutation({
    mutationFn: (points: 500 | 1000 | 2000) => redeemFn({ data: { points } }),
    onSuccess: (r) => {
      toast.success(`Kupon oluşturuldu: ${r.coupon_code} (₺${r.discount_try})`);
      navigator.clipboard?.writeText(r.coupon_code).catch(() => {});
      qc.invalidateQueries({ queryKey: ["profile-points-missions"] });
      qc.invalidateQueries({ queryKey: ["tier-card"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Link to="/hesabim" className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3 w-3" /> hesabım
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Görevler
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            görevleri tamamla → puan kazan → puanı indirim kuponuna çevir
          </p>
        </div>
        <div className="glass-card corner-cut rounded-md px-4 py-3 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-primary" />
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground">puan</div>
            <div className="text-xl neon-text font-mono">{(profile?.points ?? 0).toLocaleString("tr-TR")}</div>
          </div>
          <Link to="/liderlik" className="ml-2 text-xs font-mono text-primary hover:underline flex items-center gap-1">
            <Crown className="h-3 w-3" /> liderlik
          </Link>
        </div>
      </header>

      {/* Missions grid */}
      <section>
        <h2 className="text-lg font-semibold mb-3 font-mono">&gt; aktif görevler</h2>
        {isLoading ? (
          <div className="text-sm text-muted-foreground font-mono">yükleniyor...</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(missions ?? []).map((m) => {
              const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
              return (
                <div
                  key={m.id}
                  className={`glass-card rounded-lg p-4 border ${
                    m.claimed
                      ? "border-primary/30 opacity-70"
                      : m.completed
                        ? "border-primary/60 neon-glow"
                        : "border-border/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{m.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold truncate">{m.name}</div>
                        <div className="text-xs font-mono text-primary shrink-0">+{m.reward_points}p</div>
                      </div>
                      {m.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                      )}
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {Math.min(m.progress, m.target).toLocaleString("tr-TR")} / {m.target.toLocaleString("tr-TR")}
                        </span>
                        {m.claimed ? (
                          <span className="text-[11px] font-mono text-primary">✓ alındı</span>
                        ) : (
                          <Button
                            size="sm"
                            disabled={!m.completed || claim.isPending}
                            onClick={() => claim.mutate(m.id)}
                          >
                            {m.completed ? "ödülü al" : "devam et"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Points → coupon */}
      <section className="glass-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold font-mono">&gt; puanı kupona çevir</h2>
        </div>
        <p className="text-xs text-muted-foreground font-mono mb-4">
          puanlarını tek kullanımlık indirim kuponuna dönüştür · 60 gün geçerli · sepette otomatik uygulanır
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {REDEEM_TIERS.map((t) => {
            const enough = (profile?.points ?? 0) >= t.pts;
            return (
              <div
                key={t.pts}
                className={`rounded-lg border p-4 text-center ${
                  enough ? "border-primary/40 bg-primary/5" : "border-border/40 bg-muted/10 opacity-60"
                }`}
              >
                <div className="text-3xl neon-text font-mono">₺{t.try}</div>
                <div className="text-[11px] font-mono text-muted-foreground mt-1">
                  {t.pts.toLocaleString("tr-TR")} puan
                </div>
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  variant={enough ? "default" : "outline"}
                  disabled={!enough || redeem.isPending}
                  onClick={() => redeem.mutate(t.pts as 500 | 1000 | 2000)}
                >
                  {enough ? "bozdur" : "yetersiz puan"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="text-[11px] font-mono text-muted-foreground/70 text-center">
        <Sparkles className="inline h-3 w-3 mr-1" />
        her ay puan sıfırlanmıyor · liderlik tablosu aylık kazanılan puana göre sıralanır
      </div>
    </div>
  );
}
