import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyBadges } from "@/lib/badges.functions";
import { Trophy } from "lucide-react";

export function BadgesBlock() {
  const fn = useServerFn(listMyBadges);
  const { data } = useQuery({ queryKey: ["my-badges"], queryFn: () => fn() });
  const badges = data?.badges ?? [];
  const earned = badges.filter((b) => b.earned);
  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
            <Trophy className="h-3 w-3" /> rozetler
          </div>
          <div className="text-lg font-semibold">
            {earned.length}/{badges.length} kazanıldı
          </div>
        </div>
        <div className="text-right text-xs font-mono">
          <div className="text-primary">🔥 {data?.streak ?? 0} gün seri</div>
          <div className="text-muted-foreground">⭐ {data?.totalPoints ?? 0} puan</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {badges.map((b) => (
          <div
            key={b.id}
            className={`rounded-lg border p-3 text-center transition ${
              b.earned
                ? "border-primary/40 bg-primary/5"
                : "border-border/40 bg-muted/20 opacity-50 grayscale"
            }`}
            title={b.description ?? ""}
          >
            <div className="text-2xl">{b.icon}</div>
            <div className="text-[11px] font-semibold mt-1 truncate">{b.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
