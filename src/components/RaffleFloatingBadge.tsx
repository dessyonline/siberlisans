import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Gift, Sparkles, X } from "lucide-react";
import { listActiveRaffles } from "@/lib/raffles.functions";

function fmt(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return d > 0 ? `${d}g ${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(h)}:${pad(m)}:${pad(ss)}`;
}

export function RaffleFloatingBadge() {
  const fetchRaffles = useServerFn(listActiveRaffles);
  const { data } = useQuery({
    queryKey: ["home-raffle-floating"],
    queryFn: () => fetchRaffles(),
    staleTime: 60_000,
  });
  const [hidden, setHidden] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(sessionStorage.getItem("raffle-float-hidden") === "1");
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = ((data ?? []) as unknown as Array<{ id: string; title: string; status: string; end_at: string; featured?: boolean }>)
    .filter((r) => r.status === "active" && new Date(r.end_at).getTime() > now)
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))[0];

  if (!active || hidden) return null;
  const remaining = new Date(active.end_at).getTime() - now;

  return (
    <div className="fixed bottom-24 right-4 z-40 sm:bottom-28 sm:right-6 animate-fade-in pointer-events-none">
      <div className="relative pointer-events-auto">
        <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-2xl animate-pulse" />
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/60 via-primary/10 to-transparent opacity-70 blur-md" />
        <Link
          to="/cekilis"
          className="relative group flex items-center gap-3 rounded-2xl border border-primary/50 bg-background/90 px-4 py-3 backdrop-blur-xl shadow-2xl transition-transform hover:scale-[1.03] corner-cut neon-glow"
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 border border-primary/40">
            <Gift className="h-5 w-5 text-primary" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          </div>
          <div className="min-w-0 max-w-[180px] sm:max-w-[220px]">
            <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> canlı çekiliş
            </div>
            <div className="truncate text-sm font-semibold text-foreground">{active.title}</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              bitiş: <span className="text-primary">{fmt(remaining)}</span>
            </div>
          </div>
        </Link>
        <button
          type="button"
          aria-label="Kapat"
          onClick={() => {
            sessionStorage.setItem("raffle-float-hidden", "1");
            setHidden(true);
          }}
          className="pointer-events-auto absolute -top-2 -left-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/60 transition"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
