import { useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { Trophy, Sparkles, X } from "lucide-react";

export type ReelParticipant = {
  user_id: string;
  display_name: string;
  avatar_id: string | null;
  tier: string | null;
  tickets: number;
};

export type ReelWinner = {
  user_id: string;
  display_name: string;
  avatar_id: string | null;
  tier: string | null;
  place: number;
  masked_email?: string | null;
};

/**
 * Cinematic "live drawing" reel. Spins through weighted participant list
 * and slows to reveal each winner in sequence. Purely client-side visual —
 * the actual result is decided server-side (provably fair).
 */
export function LiveDrawReel({
  participants,
  winners,
  onClose,
  title,
}: {
  participants: ReelParticipant[];
  winners: ReelWinner[];
  onClose: () => void;
  title?: string;
}) {
  const pool = useMemo(() => {
    // Weighted expansion so users with more tickets appear more often in the reel
    const expanded: ReelParticipant[] = [];
    for (const p of participants) {
      const w = Math.max(1, Math.min(20, p.tickets));
      for (let i = 0; i < w; i++) expanded.push(p);
    }
    // Ensure winners always appear at least a few times so the reveal frame exists
    for (const w of winners) {
      for (let i = 0; i < 3; i++) {
        expanded.push({
          user_id: w.user_id,
          display_name: w.display_name,
          avatar_id: w.avatar_id,
          tier: w.tier,
          tickets: 1,
        });
      }
    }
    return expanded.length ? shuffle(expanded) : [];
  }, [participants, winners]);

  const [revealedIdx, setRevealedIdx] = useState(0);
  const [currentName, setCurrentName] = useState<ReelParticipant | null>(pool[0] ?? null);
  const [spinning, setSpinning] = useState(true);
  const [confetti, setConfetti] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const totalSpinMs = 5000;

  useEffect(() => {
    if (!pool.length || revealedIdx >= winners.length) return;
    setSpinning(true);
    startRef.current = performance.now();
    let last = 0;
    const tick = (t: number) => {
      const elapsed = t - startRef.current;
      // Ease-out: interval starts fast (30ms) and slows to ~350ms
      const progress = Math.min(1, elapsed / totalSpinMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interval = 30 + eased * 320;
      if (t - last >= interval) {
        last = t;
        setCurrentName(pool[Math.floor(Math.random() * pool.length)]);
      }
      if (elapsed >= totalSpinMs) {
        // Reveal winner
        const w = winners[revealedIdx];
        setCurrentName({
          user_id: w.user_id,
          display_name: w.display_name,
          avatar_id: w.avatar_id,
          tier: w.tier,
          tickets: 0,
        });
        setSpinning(false);
        setConfetti(true);
        setTimeout(() => setConfetti(false), 2600);
        // Auto advance to next winner after a hold
        if (revealedIdx + 1 < winners.length) {
          setTimeout(() => setRevealedIdx((i) => i + 1), 3200);
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pool, revealedIdx, winners]);

  const currentWinner = winners[revealedIdx];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-lg">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full border border-primary/30 bg-card p-2 text-muted-foreground hover:text-primary"
        aria-label="Kapat"
      >
        <X className="h-4 w-4" />
      </button>

      {confetti && <ConfettiBurst />}

      <div className="mx-4 w-full max-w-2xl">
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
            <Sparkles className="h-3 w-3 animate-pulse" />
            {spinning ? "$ ./draw --live" : `$ ./winner --place=${currentWinner?.place ?? 1}`}
          </div>
          {title && <h2 className="mt-3 text-xl font-bold neon-text-glow">{title}</h2>}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {spinning
              ? `${currentWinner?.place ?? 1}. kazanan seçiliyor…`
              : `${winners.length} kazanandan ${revealedIdx + 1}. açıklandı`}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-card p-8 neon-glow-strong">
          <div className="scan-line pointer-events-none absolute inset-0 opacity-40" />
          <div
            key={currentName?.user_id + "-" + (spinning ? Math.random() : "final")}
            className={`flex items-center justify-center gap-4 transition-all duration-100 ${
              spinning ? "opacity-100" : "scale-110 opacity-100"
            }`}
          >
            <UserAvatar id={currentName?.avatar_id ?? null} size={spinning ? 56 : 88} />
            <div className="min-w-0">
              <div
                className={`truncate font-bold ${
                  spinning ? "text-2xl text-foreground/90" : "text-4xl text-primary neon-text-glow"
                }`}
              >
                {currentName?.display_name ?? "…"}
              </div>
              {currentName?.tier && (
                <div className="mt-1 inline-block rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase text-primary/80">
                  {currentName.tier}
                </div>
              )}
              {!spinning && currentWinner && (
                <div className="mt-2 flex items-center gap-2 font-mono text-sm text-primary">
                  <Trophy className="h-4 w-4" /> {currentWinner.place}. kazanan
                </div>
              )}
            </div>
          </div>

          {/* Ticker of names for visual density */}
          {spinning && pool.length > 0 && (
            <div className="mt-6 flex justify-center gap-3 overflow-hidden opacity-60">
              {Array.from({ length: 7 }).map((_, i) => {
                const p = pool[(Math.floor(Math.random() * pool.length) + i) % pool.length];
                return (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-2 py-1 font-mono text-[10px]"
                  >
                    <UserAvatar id={p?.avatar_id ?? null} size={14} />
                    <span className="max-w-[70px] truncate">{p?.display_name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {winners.map((w, i) => (
            <div
              key={w.user_id + i}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] transition ${
                i <= revealedIdx && !spinning
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : i < revealedIdx
                    ? "border-primary/40 bg-primary/10 text-primary/80"
                    : "border-muted/40 bg-card text-muted-foreground"
              }`}
            >
              <span>{w.place}.</span>
              {i <= revealedIdx && !spinning ? w.display_name : "???"}
            </div>
          ))}
        </div>

        {!spinning && revealedIdx + 1 >= winners.length && (
          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="rounded-md border border-primary/50 bg-primary/10 px-6 py-2 font-mono text-sm text-primary hover:bg-primary/20"
            >
              &gt; kapat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        rotate: Math.random() * 360,
        color: ["#00ff9d", "#22d3ee", "#facc15", "#f472b6", "#a78bfa"][i % 5],
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute -top-4 h-2 w-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s linear forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
