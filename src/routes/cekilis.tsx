import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listActiveRaffles, getMyEntries, enterRaffle } from "@/lib/raffles.functions";
import { supabase } from "@/integrations/supabase/client";
import { Ticket, Trophy, Clock, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/cekilis")({
  head: () => ({
    meta: [
      { title: "Çekilişler — Siber Lisans" },
      { name: "description", content: "Puan harcayarak lisans çekilişlerine katıl, ücretsiz kazanma şansı yakala." },
    ],
  }),
  component: RafflesPage,
});

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
  return (
    <span className="font-mono text-sm text-primary">
      {d > 0 && `${d}g `}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function RafflesPage() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);
  const list = useQuery({ queryKey: ["raffles"], queryFn: () => listActiveRaffles() });
  const mine = useQuery({
    queryKey: ["my-raffle-entries"],
    queryFn: () => getMyEntries(),
    enabled: authed,
  });
  const enter = useServerFn(enterRaffle);
  const enterMut = useMutation({
    mutationFn: (v: { raffleId: string; count: number }) => enter({ data: v }),
    onSuccess: (r) => {
      toast.success(`Katılım başarılı! Toplam biletin: ${r.total_entries}${r.points_spent ? ` (−${r.points_spent} puan)` : ""}`);
      qc.invalidateQueries({ queryKey: ["raffles"] });
      qc.invalidateQueries({ queryKey: ["my-raffle-entries"] });
    },
    onError: (e: Error) => {
      const map: Record<string, string> = {
        auth_required: "Katılmak için giriş yap.",
        raffle_not_active: "Çekiliş aktif değil.",
        raffle_closed: "Çekiliş süresi doldu.",
        max_entries_reached: "Maksimum bilet sınırına ulaştın.",
        insufficient_points: "Yeterli puanın yok.",
      };
      const key = e.message.replace(/^.*: /, "");
      toast.error(map[key] ?? e.message);
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-xs text-primary">
          <Sparkles className="h-3.5 w-3.5" /> $ ./raffle --live
        </div>
        <h1 className="mt-4 text-4xl font-bold neon-text-glow">Çekilişler</h1>
        <p className="mt-2 text-muted-foreground">Puanlarını harca, lisansı ücretsiz kazanma şansı yakala.</p>
      </header>

      {list.isLoading && <div className="text-center font-mono text-muted-foreground">yükleniyor…</div>}
      {list.data?.length === 0 && (
        <div className="glass-card rounded-lg p-12 text-center">
          <Ticket className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">Şu an aktif çekiliş yok. Yakında!</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(list.data ?? []).map((r: any) => {
          const my = mine.data?.[r.id];
          const closed = new Date(r.end_at).getTime() < Date.now();
          const drawn = r.status === "drawn";
          const prizeName = r.product?.name ?? r.custom_prize_name ?? "Sürpriz ödül";
          const img = r.image_url ?? r.product?.image_url;
          return (
            <div key={r.id} className="glass-card corner-cut relative flex flex-col overflow-hidden rounded-lg">
              {drawn && (
                <div className="absolute right-2 top-2 z-10 rounded bg-primary/90 px-2 py-0.5 font-mono text-[10px] font-bold text-background">
                  ÇEKİLİŞ TAMAMLANDI
                </div>
              )}
              {img && (
                <div className="aspect-video overflow-hidden bg-black/30">
                  <img src={img} alt={prizeName} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase text-primary/70">
                    <Trophy className="mr-1 inline h-3 w-3" /> ödül
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

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-primary/10 pt-3 font-mono text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {drawn ? <span>sona erdi</span> : <CountDown end={r.end_at} />}
                  </div>
                  <div className="flex items-center justify-end gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" /> {r.total_entries} bilet
                  </div>
                  <div className="text-muted-foreground">
                    bilet: <span className="text-primary">{r.entry_cost_points === 0 ? "ücretsiz" : `${r.entry_cost_points} puan`}</span>
                  </div>
                  <div className="text-right text-muted-foreground">
                    limit: <span className="text-primary">{r.max_entries_per_user}/kişi</span>
                  </div>
                  {my && (
                    <div className="col-span-2 rounded bg-primary/10 px-2 py-1 text-primary">
                      biletin: {my.entries} {my.spent > 0 && `(−${my.spent}p)`}
                    </div>
                  )}
                </div>

                {!drawn && !closed && (
                  authed ? (
                    <button
                      disabled={enterMut.isPending || (my?.entries ?? 0) >= r.max_entries_per_user}
                      onClick={() => enterMut.mutate({ raffleId: r.id, count: 1 })}
                      className="rounded-md border border-primary/50 bg-primary/10 py-2 font-mono text-sm text-primary transition hover:bg-primary/20 disabled:opacity-40"
                    >
                      {(my?.entries ?? 0) >= r.max_entries_per_user ? "sınırına ulaştın" : "> katıl"}
                    </button>
                  ) : (
                    <Link to="/auth" className="rounded-md border border-primary/50 bg-primary/10 py-2 text-center font-mono text-sm text-primary hover:bg-primary/20">
                      giriş yap & katıl
                    </Link>
                  )
                )}
                {drawn && r.winner_user_id && (
                  <div className="rounded bg-primary/10 p-2 text-center font-mono text-xs text-primary">
                    kazanan belirlendi
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
