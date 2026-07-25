import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import {
  listActiveRaffles,
  getMyEntries,
  enterRaffle,
  claimDailyTicket,
  claimShareTicket,
  listPastWinners,
  getMyRaffleWins,
  listRaffleParticipants,
} from "@/lib/raffles.functions";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, Trophy, Clock, Users, Sparkles, Gift, Share2, Lock, Shield, Star, Copy, PartyPopper, Play } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { LiveDrawReel, type ReelParticipant, type ReelWinner } from "@/components/LiveDrawReel";
import { toast } from "sonner";


export const Route = createFileRoute("/cekilis")({
  head: () => ({
    meta: [
      { title: "Çekilişler — Siber Lisans" },
      { name: "description", content: "Puan harcayarak lisans çekilişlerine katıl, günlük bonus biletlerle ücretsiz kazanma şansı yakala. Kanıtlanabilir adil çekim." },
    ],
  }),
  component: RafflesPage,
});

const errorMap: Record<string, string> = {
  auth_required: "Katılmak için giriş yap.",
  raffle_not_active: "Çekiliş aktif değil.",
  raffle_closed: "Çekiliş süresi doldu.",
  max_entries_reached: "Maksimum bilet sınırına ulaştın.",
  insufficient_points: "Yeterli puanın yok.",
  tier_too_low: "Bu çekiliş sadece belirli seviye üstü için.",
  daily_bonus_disabled: "Günlük bonus kapalı.",
  share_bonus_disabled: "Paylaşım bonusu kapalı.",
  already_claimed_today: "Bugünkü bonus biletini zaten aldın.",
  already_shared: "Bu platformdan paylaşım bonusunu zaten aldın.",
};

function CountDown({ end }: { end: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(end).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const s = Math.floor((diff / 1000) % 60);
  const pill = (n: number, l: string) => (
    <div className="flex flex-col items-center rounded bg-primary/10 px-2 py-1 leading-none">
      <span className="font-mono text-base font-bold text-primary tabular-nums">{String(n).padStart(2, "0")}</span>
      <span className="mt-0.5 text-[9px] uppercase text-muted-foreground">{l}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1">
      {d > 0 && pill(d, "gün")}
      {pill(h, "sa")}
      {pill(m, "dk")}
      {pill(s, "sn")}
    </div>
  );
}

function tierRank(t?: string | null) {
  return t === "platinum" ? 4 : t === "gold" ? 3 : t === "silver" ? 2 : t === "bronze" ? 1 : 0;
}

function RafflesPage() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(false);
  const [myTier, setMyTier] = useState<string | null>(null);
  const [buyCounts, setBuyCounts] = useState<Record<string, number>>({});
  const [reel, setReel] = useState<{ title: string; participants: ReelParticipant[]; winners: ReelWinner[] } | null>(null);
  const seenDrawnRef = useRef<Set<string>>(new Set());
  const partsFn = useServerFn(listRaffleParticipants);

  async function playLive(r: any) {
    try {
      const parts = (await partsFn({ data: { id: r.id } })) as ReelParticipant[];
      const winners: ReelWinner[] = (r.winners ?? []).map((w: any) => {
        const p = parts.find((x) => x.display_name === w.display_name);
        return {
          user_id: p?.user_id ?? w.display_name,
          display_name: w.display_name,
          avatar_id: w.avatar_id ?? p?.avatar_id ?? null,
          tier: w.tier ?? p?.tier ?? null,
          place: w.place,
          masked_email: w.masked_email,
        };
      });
      if (!winners.length) return;
      setReel({ title: r.title, participants: parts, winners });
    } catch { /* ignore */ }
  }


  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      setAuthed(!!u);
      if (u) {
        const { data: p } = await supabase.from("profiles").select("tier").eq("id", u.id).maybeSingle();
        setMyTier((p as any)?.tier ?? null);
      }
    });
  }, []);

  const list = useQuery({ queryKey: ["raffles"], queryFn: () => listActiveRaffles(), refetchInterval: 30_000 });
  const past = useQuery({ queryKey: ["past-winners"], queryFn: () => listPastWinners() });
  const mine = useQuery({ queryKey: ["my-raffle-entries"], queryFn: () => getMyEntries(), enabled: authed });
  const myWins = useQuery({ queryKey: ["my-raffle-wins"], queryFn: () => getMyRaffleWins(), enabled: authed });
  const winByRaffle = new Map<string, any>();
  for (const w of myWins.data ?? []) winByRaffle.set((w as any).raffle_id, w);

  const enter = useServerFn(enterRaffle);
  const daily = useServerFn(claimDailyTicket);
  const share = useServerFn(claimShareTicket);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["raffles"] });
    qc.invalidateQueries({ queryKey: ["my-raffle-entries"] });
  };

  const enterMut = useMutation({
    mutationFn: (v: { raffleId: string; count: number }) => enter({ data: v }),
    onSuccess: (r) => {
      toast.success(`Biletin alındı! Toplam: ${r.total_entries}${r.points_spent ? ` (−${r.points_spent}p)` : ""}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(errorMap[e.message.replace(/^.*: /, "")] ?? e.message),
  });
  const dailyMut = useMutation({
    mutationFn: (raffleId: string) => daily({ data: { raffleId } }),
    onSuccess: (r) => { toast.success(`🎁 Günlük bonus biletin alındı! Toplam: ${r.total_entries}`); invalidate(); },
    onError: (e: Error) => toast.error(errorMap[e.message.replace(/^.*: /, "")] ?? e.message),
  });
  const shareMut = useMutation({
    mutationFn: (v: { raffleId: string; platform: "twitter" | "telegram" | "whatsapp" }) => share({ data: v }),
    onSuccess: (r) => { toast.success(`Paylaşım bonusu alındı! Toplam: ${r.total_entries}`); invalidate(); },
    onError: (e: Error) => toast.error(errorMap[e.message.replace(/^.*: /, "")] ?? e.message),
  });

  const featured = (list.data ?? []).filter((r: any) => r.featured && r.status === "active");
  const others = (list.data ?? []).filter((r: any) => !r.featured || r.status === "drawn");

  // Detect active→drawn transition and auto-play live reel once per raffle
  useEffect(() => {
    if (!list.data) return;
    for (const r of list.data as any[]) {
      if (r.status === "drawn" && (r.winners?.length ?? 0) > 0 && !seenDrawnRef.current.has(r.id)) {
        // Skip on first load: only trigger when we've seen it before as active
        if (seenDrawnRef.current.has(r.id + ":seen")) {
          playLive(r);
        }
        seenDrawnRef.current.add(r.id);
      }
      if (r.status === "active") seenDrawnRef.current.add(r.id + ":seen");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);



  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" /> $ ./raffle --provably-fair
        </div>
        <h1 className="mt-4 text-4xl font-bold neon-text-glow">Çekilişler</h1>
        <p className="mt-2 text-muted-foreground">
          Kanıtlanabilir adil çekim · Günlük bonus bilet · Paylaşınca +1 · VIP kilitler
        </p>
      </header>

      {list.isLoading && <div className="text-center font-mono text-muted-foreground">yükleniyor…</div>}
      {list.data?.length === 0 && (
        <div className="glass-card rounded-lg p-12 text-center">
          <Ticket className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">Şu an aktif çekiliş yok. Yakında!</p>
        </div>
      )}

      {featured.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center gap-2 font-mono text-xs text-primary/80">
            <Star className="h-3 w-3 fill-primary text-primary" /> öne çıkan
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {featured.map((r: any) => (
              <RaffleCard
                key={r.id}
                r={r}
                large
                authed={authed}
                myTier={myTier}
                mine={mine.data?.[r.id]}
                myWin={winByRaffle.get(r.id)}
                buyCount={buyCounts[r.id] ?? 1}
                onBuyCountChange={(n) => setBuyCounts({ ...buyCounts, [r.id]: n })}
                onEnter={(c) => enterMut.mutate({ raffleId: r.id, count: c })}
                onDaily={() => dailyMut.mutate(r.id)}
                onShare={(p) => shareMut.mutate({ raffleId: r.id, platform: p })}
                onReplay={() => playLive(r)}
                busy={enterMut.isPending || dailyMut.isPending || shareMut.isPending}
              />

            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {others.map((r: any) => (
          <RaffleCard
            key={r.id}
            r={r}
            authed={authed}
            myTier={myTier}
            mine={mine.data?.[r.id]}
            myWin={winByRaffle.get(r.id)}
            buyCount={buyCounts[r.id] ?? 1}
            onBuyCountChange={(n) => setBuyCounts({ ...buyCounts, [r.id]: n })}
            onEnter={(c) => enterMut.mutate({ raffleId: r.id, count: c })}
            onDaily={() => dailyMut.mutate(r.id)}
            onShare={(p) => shareMut.mutate({ raffleId: r.id, platform: p })}
            onReplay={() => playLive(r)}
            busy={enterMut.isPending || dailyMut.isPending || shareMut.isPending}
          />

        ))}
      </div>

      {(past.data?.length ?? 0) > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 font-mono text-lg text-primary">$ ./winners --recent</h2>
          <div className="glass-card rounded-lg p-4">
            <div className="flex flex-wrap gap-2">
              {(past.data ?? []).map((w: any) => (
                <div key={w.id} className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 py-1 pl-1 pr-3 font-mono text-xs">
                  <UserAvatar id={w.avatar_id} size={22} />
                  <span className="truncate max-w-[160px]">{w.masked_email ?? w.display_name}</span>
                  {w.tier && <span className="rounded bg-primary/10 px-1 text-[9px] uppercase text-primary/80">{w.tier}</span>}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-primary">{w.place}.</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RaffleCard({
  r,
  large,
  authed,
  myTier,
  mine,
  myWin,
  buyCount,
  onBuyCountChange,
  onEnter,
  onDaily,
  onShare,
  onReplay,
  busy,
}: {
  r: any;
  large?: boolean;
  authed: boolean;
  myTier: string | null;
  mine?: { entries: number; spent: number; daily_today: boolean; shared: string[] };
  myWin?: { id: string; place: number; delivered_key: string | null; is_backup: boolean } | null;
  buyCount: number;
  onBuyCountChange: (n: number) => void;
  onEnter: (c: number) => void;
  onDaily: () => void;
  onShare: (p: "twitter" | "telegram" | "whatsapp") => void;
  onReplay?: () => void;
  busy: boolean;
}) {

  const closed = new Date(r.end_at).getTime() < Date.now();
  const drawn = r.status === "drawn";
  const prizeName = r.product?.name ?? r.custom_prize_name ?? "Sürpriz ödül";
  const img = r.image_url ?? r.product?.image_url;
  const myEntries = mine?.entries ?? 0;
  const remaining = Math.max(0, r.max_entries_per_user - myEntries);
  const tierLocked = r.min_tier && tierRank(myTier) < tierRank(r.min_tier);
  const shareUrl = typeof window !== "undefined" ? window.location.origin + "/cekilis" : "";
  const shareText = encodeURIComponent(`"${r.title}" çekilişine katıl, ücretsiz lisans kazan! ${shareUrl}`);

  const doShare = (platform: "twitter" | "telegram" | "whatsapp") => {
    const url =
      platform === "twitter" ? `https://twitter.com/intent/tweet?text=${shareText}` :
      platform === "telegram" ? `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${shareText}` :
      `https://wa.me/?text=${shareText}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => onShare(platform), 800);
  };

  return (
    <div className={`glass-card corner-cut relative flex flex-col overflow-hidden rounded-lg ${large ? "md:flex-row" : ""}`}>
      {drawn && (
        <div className="absolute right-2 top-2 z-10 rounded bg-primary/90 px-2 py-0.5 font-mono text-[10px] font-bold text-background">
          ÇEKİLİŞ TAMAMLANDI
        </div>
      )}
      {r.featured && !drawn && (
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-yellow-500/90 px-2 py-0.5 font-mono text-[10px] font-bold text-background">
          <Star className="h-2.5 w-2.5 fill-current" /> ÖNE ÇIKAN
        </div>
      )}
      {img && (
        <div className={`overflow-hidden bg-black/30 ${large ? "md:w-1/2 aspect-video md:aspect-auto" : "aspect-video"}`}>
          <img src={img} alt={prizeName} className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase text-primary/70">
            <Trophy className="h-3 w-3" /> ödül · {r.num_winners > 1 && <span className="text-primary">{r.num_winners} kazanan</span>}
            {r.min_tier && (
              <span className="ml-auto flex items-center gap-1 rounded bg-yellow-500/20 px-1.5 py-0.5 text-yellow-400">
                <Lock className="h-2.5 w-2.5" /> {r.min_tier}+
              </span>
            )}
          </div>
          <div className="font-bold">{prizeName}</div>
          {r.product?.retail_price_try && (
            <div className="mt-1 font-mono text-xs text-muted-foreground line-through">
              piyasa ₺{Number(r.product.retail_price_try).toFixed(0)}
            </div>
          )}
        </div>
        <h3 className="text-lg font-semibold">{r.title}</h3>
        {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}

        <div className="mt-auto space-y-2 border-t border-primary/10 pt-3">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              {drawn ? <span>sona erdi</span> : <CountDown end={r.end_at} />}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3 w-3" /> {r.unique_participants ?? 0} kişi · {r.total_entries ?? 0} bilet
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <div className="text-muted-foreground">
              bilet: <span className="text-primary">{r.entry_cost_points === 0 ? "ücretsiz" : `${r.entry_cost_points}p`}</span>
            </div>
            <div className="text-right text-muted-foreground">
              limit: <span className="text-primary">{r.max_entries_per_user}/kişi</span>
            </div>
          </div>
          {mine && myEntries > 0 && (
            <div className="rounded bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
              biletin: {myEntries}/{r.max_entries_per_user} {mine.spent > 0 && `· −${mine.spent}p`}
            </div>
          )}

          {!drawn && !closed && !tierLocked && (
            authed ? (
              <div className="space-y-2">
                {remaining > 0 && (
                  <div className="flex gap-2">
                    {r.max_entries_per_user > 1 && r.entry_cost_points > 0 && (
                      <input
                        type="number"
                        min={1}
                        max={remaining}
                        value={Math.min(buyCount, remaining)}
                        onChange={(e) => onBuyCountChange(Math.max(1, Math.min(remaining, +e.target.value)))}
                        className="w-16 rounded border border-primary/30 bg-card px-2 py-2 text-center font-mono text-sm"
                      />
                    )}
                    <button
                      disabled={busy}
                      onClick={() => onEnter(Math.min(buyCount, remaining))}
                      className="flex-1 rounded-md border border-primary/50 bg-primary/10 py-2 font-mono text-sm text-primary neon-glow transition hover:bg-primary/20 disabled:opacity-40"
                    >
                      &gt; katıl ({Math.min(buyCount, remaining)}x{r.entry_cost_points > 0 ? ` = ${buyCount * r.entry_cost_points}p` : ""})
                    </button>
                  </div>
                )}
                {remaining === 0 && (
                  <div className="rounded bg-primary/5 py-2 text-center font-mono text-xs text-primary/60">✓ maksimum bilete ulaştın</div>
                )}
                {r.daily_bonus_enabled && (
                  <button
                    disabled={busy || mine?.daily_today || remaining === 0}
                    onClick={onDaily}
                    className="flex w-full items-center justify-center gap-2 rounded border border-cyan-500/50 bg-cyan-500/10 py-1.5 font-mono text-xs text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40"
                  >
                    <Gift className="h-3 w-3" /> {mine?.daily_today ? "bugünkü bonus alındı" : "günlük ücretsiz bilet"}
                  </button>
                )}
                {r.share_bonus_enabled && (
                  <div className="grid grid-cols-3 gap-1">
                    {(["twitter", "telegram", "whatsapp"] as const).map((p) => {
                      const done = mine?.shared.includes(p);
                      return (
                        <button
                          key={p}
                          disabled={busy || done || remaining === 0}
                          onClick={() => doShare(p)}
                          className="flex items-center justify-center gap-1 rounded border border-primary/30 py-1 font-mono text-[10px] hover:bg-primary/10 disabled:opacity-40"
                        >
                          <Share2 className="h-2.5 w-2.5" /> {done ? "✓" : p}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <Link to="/auth" className="block rounded-md border border-primary/50 bg-primary/10 py-2 text-center font-mono text-sm text-primary hover:bg-primary/20">
                giriş yap & katıl
              </Link>
            )
          )}
          {tierLocked && (
            <div className="flex items-center justify-center gap-2 rounded border border-yellow-500/40 bg-yellow-500/10 py-2 font-mono text-xs text-yellow-400">
              <Lock className="h-3 w-3" /> {r.min_tier}+ seviye gerekli
            </div>
          )}
          {drawn && myWin && (
            <div className="relative overflow-hidden rounded-lg border-2 border-primary bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-4 neon-glow-strong">
              <div className="scan-line pointer-events-none absolute inset-0 opacity-30" />
              <div className="relative flex items-center gap-2 font-mono text-sm text-primary">
                <PartyPopper className="h-5 w-5" /> ÇEKİLİŞİ KAZANDIN — #{myWin.place}{myWin.is_backup && <span className="rounded bg-blue-500/20 px-1 text-[10px] text-blue-400">yedek</span>}
              </div>
              {myWin.delivered_key ? (
                <div className="relative mt-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">🏆 Ödülün:</div>
                  <div className="flex items-center gap-2 rounded border border-primary/40 bg-background/80 px-2 py-1.5">
                    <code className="flex-1 truncate font-mono text-xs text-primary">{myWin.delivered_key}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(myWin.delivered_key!); toast.success("Kopyalandı!"); }}
                      className="rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10"
                      aria-label="kopyala"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <Link to="/hesabim/lisanslar" className="block text-center font-mono text-[10px] text-primary/80 underline">tüm lisanslarım →</Link>
                </div>
              ) : (
                <div className="relative mt-2 rounded bg-card/60 p-2 font-mono text-[11px] text-muted-foreground">Ödülün hazırlanıyor, kısa süre içinde bildirim gelecek.</div>
              )}
            </div>
          )}
          {drawn && (
            <div className="space-y-1">
              <div className="rounded bg-primary/10 p-2 text-center font-mono text-xs text-primary">
                {r.winners?.length ?? 0} kazanan belirlendi
              </div>
              {(r.winners ?? []).slice(0, 3).map((w: any, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded bg-card/40 px-2 py-1 font-mono text-[11px]">
                  <UserAvatar id={w.avatar_id} size={20} />
                  <span className="text-primary">#{w.place}</span>
                  <span className="flex-1 truncate">{w.masked_email ?? w.display_name}</span>
                  {w.tier && <span className="rounded bg-primary/10 px-1 text-[9px] uppercase text-primary/80">{w.tier}</span>}
                  <Trophy className="h-3 w-3 text-primary" />
                </div>
              ))}
            </div>
          )}

          {r.seed_commit && (
            <details className="rounded border border-primary/10 bg-card/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              <summary className="flex cursor-pointer items-center gap-1"><Shield className="h-2.5 w-2.5" /> kanıtlanabilir adil</summary>
              <div className="mt-1 space-y-0.5 break-all">
                <div>commit: <span className="text-primary/80">{String(r.seed_commit).slice(0, 40)}…</span></div>
                {r.seed_reveal && <div>seed: <span className="text-primary/80">{String(r.seed_reveal).slice(0, 40)}…</span></div>}
                {r.draw_hash && <div>hash: <span className="text-primary/80">{String(r.draw_hash).slice(0, 40)}…</span></div>}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
