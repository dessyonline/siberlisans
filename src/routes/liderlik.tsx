import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMonthlyLeaderboard } from "@/lib/missions.functions";
import { UserAvatar } from "@/components/UserAvatar";
import { Crown, Trophy, Medal, Target } from "lucide-react";

export const Route = createFileRoute("/liderlik")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "Aylık Liderlik Tablosu — SiberPHP" },
      {
        name: "description",
        content: "Bu ayın en aktif SiberPHP kullanıcıları. Görevleri tamamla, puanları topla, sıralamada yüksel.",
      },
      { property: "og:title", content: "Aylık Liderlik Tablosu — SiberPHP" },
      { property: "og:description", content: "Bu ayın en aktif SiberPHP kullanıcıları." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TIER_COLOR: Record<string, string> = {
  bronze: "text-amber-600",
  silver: "text-slate-300",
  gold: "text-yellow-400",
  platinum: "text-primary",
};

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronz",
  silver: "Gümüş",
  gold: "Altın",
  platinum: "Platin",
};

function LeaderboardPage() {
  const fn = useServerFn(getMonthlyLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["monthly-leaderboard"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  const monthLabel = new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <div className="container mx-auto max-w-3xl px-4 py-10 space-y-6">
      <header className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <Crown className="h-3 w-3" /> aylık liderlik · {monthLabel}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold neon-text">Top Kullanıcılar</h1>
        <p className="text-sm text-muted-foreground font-mono max-w-lg mx-auto">
          bu ay en çok puan kazanan 20 hacker. görev tamamla, yorum yaz, davet et — sıralamada yüksel.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            to="/gorevler"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-primary/40 text-xs font-mono text-primary hover:bg-primary/10 transition"
          >
            <Target className="h-3 w-3" /> görevleri gör
          </Link>
        </div>
      </header>

      <div className="glass-card corner-cut rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground font-mono">yükleniyor...</div>
        ) : !data || data.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground font-mono">
            bu ay henüz puan kazanan yok. ilk sıra senin olabilir.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {data.map((row) => {
              const rankIcon =
                row.rank === 1 ? (
                  <Crown className="h-5 w-5 text-yellow-400" />
                ) : row.rank === 2 ? (
                  <Trophy className="h-5 w-5 text-slate-300" />
                ) : row.rank === 3 ? (
                  <Medal className="h-5 w-5 text-amber-600" />
                ) : (
                  <span className="text-sm font-mono text-muted-foreground w-5 text-center">{row.rank}</span>
                );
              return (
                <li
                  key={row.user_id}
                  className={`flex items-center gap-3 p-3 sm:p-4 ${
                    row.rank <= 3 ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="w-6 flex justify-center">{rankIcon}</div>
                  <UserAvatar id={row.avatar_id} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{row.display_masked}</div>
                    <div className={`text-[11px] font-mono ${TIER_COLOR[row.tier] ?? ""}`}>
                      {TIER_LABEL[row.tier] ?? row.tier}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-mono neon-text">
                      +{row.points_earned.toLocaleString("tr-TR")}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">puan</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] font-mono text-muted-foreground/70 text-center">
        sıralama her ayın 1'inde sıfırlanır · anonim gösterim
      </p>
    </div>
  );
}
