import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { bumpStreak, listMyBadges } from "@/lib/badges.functions";
import { Button } from "@/components/ui/button";
import { Flame, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// day1..day7+ → 5, 10, 15, 20, 30, 40, 60
const REWARDS = [0, 5, 10, 15, 20, 30, 40, 60];
const rewardFor = (n: number) => REWARDS[Math.min(Math.max(n, 1), 7)] ?? 60;

export function DailyStreakCard() {
  const badges = useServerFn(listMyBadges);
  const bump = useServerFn(bumpStreak);
  const [streak, setStreak] = useState(0);
  const [claimedToday, setClaimedToday] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await badges();
      setStreak(r.streak ?? 0);
      setClaimedToday(isToday(r.lastStreakAt));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claim = async () => {
    setBusy(true);
    try {
      const res = await bump();
      setStreak(res.streak);
      setClaimedToday(true);
      if (res.bonus > 0) {
        toast.success(`+${res.bonus} puan · ${res.streak} günlük seri!`);
      } else {
        toast.info("Bugünü zaten aldın 🔥");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nextReward = rewardFor(claimedToday ? streak + 1 : streak || 1);

  return (
    <div className="glass-card corner-cut rounded-md p-4 relative overflow-hidden">
      <div className="absolute -right-4 -top-4 opacity-10">
        <Flame className="h-24 w-24 text-primary" />
      </div>
      <div className="relative">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> günlük seri
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="font-mono text-3xl neon-text">{streak}</div>
          <div className="text-xs text-muted-foreground">gün üst üste</div>
        </div>

        <div className="mt-3 flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const filled = d <= streak;
            const isNext = d === (claimedToday ? Math.min(streak + 1, 7) : streak || 1);
            return (
              <div
                key={d}
                className={`h-8 flex-1 rounded flex flex-col items-center justify-center text-[9px] font-mono border ${
                  filled
                    ? "bg-primary/20 border-primary/60 text-primary"
                    : isNext && !claimedToday
                    ? "border-primary/40 text-primary/80 animate-pulse"
                    : "border-border/40 text-muted-foreground/60"
                }`}
                title={`gün ${d} · +${REWARDS[d] ?? 60}p`}
              >
                <span>{d}</span>
                <span className="opacity-70">+{REWARDS[d] ?? 60}</span>
              </div>
            );
          })}
        </div>

        <Button
          size="sm"
          onClick={claim}
          disabled={busy || loading || claimedToday}
          className="mt-3 w-full font-mono neon-glow"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : claimedToday ? (
            "bugün alındı ✓ yarın +" + nextReward + "p"
          ) : (
            `> ödülü al · +${nextReward}p`
          )}
        </Button>
      </div>
    </div>
  );
}
