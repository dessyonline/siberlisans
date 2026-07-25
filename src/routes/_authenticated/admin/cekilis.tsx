import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminListRaffles,
  upsertRaffle,
  drawRaffle,
  deleteRaffle,
  disqualifyWinner,
  broadcastRaffle,
  raffleAnalytics,
  adminRaffleWinners,
  listRaffleParticipants,
} from "@/lib/raffles.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Trash2, Play, Plus, BarChart3, Megaphone, Users, Ban, X, Star, RefreshCw, Repeat } from "lucide-react";
import { LiveDrawReel, type ReelParticipant, type ReelWinner } from "@/components/LiveDrawReel";

export const Route = createFileRoute("/_authenticated/admin/cekilis")({
  ssr: false,
  component: AdminRafflesPage,
});


type Tier = "bronze" | "silver" | "gold" | "platinum";
type Form = {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  product_id: string;
  custom_prize_name: string;
  points_enabled: boolean;
  entry_cost_points: number;
  max_entries_per_user: number;
  end_at: string;
  status: "draft" | "active" | "cancelled";
  min_tier: "" | Tier;
  num_winners: number;
  featured: boolean;
  is_recurring: boolean;
  recurrence_days: number;
  daily_bonus_enabled: boolean;
  share_bonus_enabled: boolean;
};

const emptyForm: Form = {
  title: "",
  description: "",
  image_url: "",
  product_id: "",
  custom_prize_name: "",
  points_enabled: false,
  entry_cost_points: 100,
  max_entries_per_user: 5,
  end_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  status: "active",
  min_tier: "",
  num_winners: 1,
  featured: false,
  is_recurring: false,
  recurrence_days: 7,
  daily_bonus_enabled: false,
  share_bonus_enabled: false,
};

function AdminRafflesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-raffles"], queryFn: () => adminListRaffles() });
  const products = useQuery({
    queryKey: ["admin-raffles-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,name").eq("active", true).order("name");
      return data ?? [];
    },
  });
  const [form, setForm] = useState<Form>(emptyForm);
  const [show, setShow] = useState(false);
  const [analyticsFor, setAnalyticsFor] = useState<string | null>(null);
  const [winnersFor, setWinnersFor] = useState<string | null>(null);
  const [broadcastFor, setBroadcastFor] = useState<string | null>(null);
  const [bTitle, setBTitle] = useState("");
  const [bBody, setBBody] = useState("");

  const upsertFn = useServerFn(upsertRaffle);
  const drawFn = useServerFn(drawRaffle);
  const delFn = useServerFn(deleteRaffle);
  const dqFn = useServerFn(disqualifyWinner);
  const bcFn = useServerFn(broadcastRaffle);
  const partsFn = useServerFn(listRaffleParticipants);
  const winFn = useServerFn(adminRaffleWinners);

  const [reel, setReel] = useState<{
    title: string;
    participants: ReelParticipant[];
    winners: ReelWinner[];
  } | null>(null);

  async function playLiveDraw(raffleId: string, title: string) {
    try {
      const [parts, wins] = await Promise.all([
        partsFn({ data: { id: raffleId } }),
        winFn({ data: { id: raffleId } }),
      ]);
      const winners: ReelWinner[] = (wins as any[])
        .filter((w) => !w.disqualified_at)
        .map((w) => {
          const p = (parts as any[]).find((x) => x.user_id === w.user_id);
          return {
            user_id: w.user_id,
            display_name: w.display_name ?? p?.display_name ?? "Anonim",
            avatar_id: p?.avatar_id ?? null,
            tier: p?.tier ?? null,
            place: w.place,
          };
        });
      if (!winners.length) return;
      setReel({ title, participants: parts as ReelParticipant[], winners });
    } catch (e: any) {
      toast.error(e?.message ?? "Canlı çekim başlatılamadı");
    }
  }


  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        title: form.title,
        description: form.description || null,
        image_url: form.image_url || null,
        product_id: form.product_id || null,
        custom_prize_name: form.custom_prize_name || null,
        entry_cost_points: form.points_enabled ? Number(form.entry_cost_points) : 0,
        max_entries_per_user: Number(form.max_entries_per_user),
        end_at: new Date(form.end_at).toISOString(),
        status: form.status,
        min_tier: form.min_tier || null,
        num_winners: Number(form.num_winners) || 1,
        featured: form.featured,
        is_recurring: form.is_recurring,
        recurrence_days: form.is_recurring ? Number(form.recurrence_days) || 7 : null,
        daily_bonus_enabled: form.daily_bonus_enabled,
        share_bonus_enabled: form.share_bonus_enabled,
      };
      return upsertFn({ data: payload as any });
    },
    onSuccess: () => {
      toast.success("Kaydedildi");
      setForm(emptyForm);
      setShow(false);
      qc.invalidateQueries({ queryKey: ["admin-raffles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drawMut = useMutation({
    mutationFn: (v: { id: string; redraw?: boolean; title: string }) => drawFn({ data: { id: v.id, redraw: v.redraw } }),
    onSuccess: async (r, v) => {
      toast.success(`Çekim tamamlandı · ${r.delivered_keys?.length ?? 0} key teslim · hash: ${r.draw_hash.slice(0, 12)}…`);
      qc.invalidateQueries({ queryKey: ["admin-raffles"] });
      await playLiveDraw(v.id, v.title);
    },
    onError: (e: Error) => toast.error(e.message.replace(/^.*: /, "")),
  });


  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Silindi");
      qc.invalidateQueries({ queryKey: ["admin-raffles"] });
    },
  });

  const bcMut = useMutation({
    mutationFn: () => bcFn({ data: { raffleId: broadcastFor!, title: bTitle, body: bBody } }),
    onSuccess: (r) => {
      toast.success(`${r.sent} kişiye bildirim gönderildi`);
      setBroadcastFor(null);
      setBTitle("");
      setBBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-primary neon-text">$ /admin/cekilis</h1>
        <button
          onClick={() => {
            setForm(emptyForm);
            setShow(!show);
          }}
          className="flex items-center gap-2 rounded border border-primary/50 bg-primary/10 px-3 py-1.5 font-mono text-sm text-primary hover:bg-primary/20"
        >
          <Plus className="h-4 w-4" /> yeni çekiliş
        </button>
      </div>

      {show && (
        <div className="glass-card space-y-3 rounded-lg p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs md:col-span-2">
              <span className="font-mono text-muted-foreground">başlık</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">bitiş tarihi</span>
              <input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs md:col-span-3">
              <span className="font-mono text-muted-foreground">açıklama</span>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" rows={2} />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">ödül ürün (havuzdan key)</span>
              <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5">
                <option value="">— yok / özel —</option>
                {(products.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">özel ödül adı</span>
              <input value={form.custom_prize_name} onChange={(e) => setForm({ ...form, custom_prize_name: e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">görsel url</span>
              <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">min. tier (VIP kilit)</span>
              <select value={form.min_tier} onChange={(e) => setForm({ ...form, min_tier: e.target.value as any })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5">
                <option value="">— herkes —</option>
                <option value="silver">silver+</option>
                <option value="gold">gold+</option>
                <option value="platinum">platinum</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">kazanan sayısı</span>
              <input type="number" min={1} max={20} value={form.num_winners} onChange={(e) => setForm({ ...form, num_winners: +e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">kişi başı max bilet</span>
              <input type="number" min={1} value={form.max_entries_per_user} onChange={(e) => setForm({ ...form, max_entries_per_user: +e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">puan ile katılım</span>
              <div className="flex items-center gap-2 rounded border border-primary/30 bg-card px-2 py-1.5">
                <input type="checkbox" checked={form.points_enabled} onChange={(e) => setForm({ ...form, points_enabled: e.target.checked })} />
                <span className="font-mono text-xs">{form.points_enabled ? "açık" : "ücretsiz"}</span>
              </div>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">bilet maliyeti (puan)</span>
              <input type="number" min={0} disabled={!form.points_enabled} value={form.entry_cost_points} onChange={(e) => setForm({ ...form, entry_cost_points: +e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5 disabled:opacity-40" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">durum</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5">
                <option value="active">aktif</option>
                <option value="draft">taslak</option>
                <option value="cancelled">iptal</option>
              </select>
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded border border-primary/30 bg-card px-3 py-2 text-xs">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
              <Star className="h-3.5 w-3.5 text-primary" /> öne çıkar
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded border border-primary/30 bg-card px-3 py-2 text-xs">
              <input type="checkbox" checked={form.daily_bonus_enabled} onChange={(e) => setForm({ ...form, daily_bonus_enabled: e.target.checked })} />
              günlük bonus bilet
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded border border-primary/30 bg-card px-3 py-2 text-xs">
              <input type="checkbox" checked={form.share_bonus_enabled} onChange={(e) => setForm({ ...form, share_bonus_enabled: e.target.checked })} />
              paylaşınca +1 bilet
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded border border-primary/30 bg-card px-3 py-2 text-xs">
              <input type="checkbox" checked={form.is_recurring} onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })} />
              <RefreshCw className="h-3.5 w-3.5" /> tekrarlanan çekiliş
            </label>
            <label className="space-y-1 text-xs md:col-span-2">
              <span className="font-mono text-muted-foreground">tekrar periyodu (gün)</span>
              <input type="number" min={1} max={90} disabled={!form.is_recurring} value={form.recurrence_days} onChange={(e) => setForm({ ...form, recurrence_days: +e.target.value })} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5 disabled:opacity-40" />
            </label>
          </div>
          <div className="flex gap-2">
            <button disabled={save.isPending || !form.title} onClick={() => save.mutate()} className="rounded bg-primary px-4 py-1.5 font-mono text-sm text-background disabled:opacity-40">
              {save.isPending ? "kaydediliyor…" : "kaydet"}
            </button>
            <button onClick={() => setShow(false)} className="rounded border border-primary/30 px-4 py-1.5 font-mono text-sm">iptal</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(list.data ?? []).map((r: any) => (
          <div key={r.id} className="glass-card rounded p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Trophy className="h-5 w-5 text-primary" />
              <div className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  {r.featured && <Star className="h-4 w-4 fill-primary text-primary" />}
                  {r.title}
                  {r.min_tier && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-yellow-400">{r.min_tier}+</span>}
                  {r.is_recurring && <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">↻ {r.recurrence_days}g</span>}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {r.product?.name ?? r.custom_prize_name ?? "—"} · {r.entry_cost_points}p · max {r.max_entries_per_user} · {r.num_winners} kazanan · {new Date(r.end_at).toLocaleString("tr-TR")}
                </div>
                {r.seed_commit && (
                  <div className="font-mono text-[10px] text-muted-foreground/60">
                    commit: {String(r.seed_commit).slice(0, 24)}… {r.seed_reveal && <span className="text-primary">· reveal:{String(r.seed_reveal).slice(0, 10)}…</span>}
                  </div>
                )}
              </div>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                  r.status === "active" ? "bg-primary/20 text-primary" : r.status === "drawn" ? "bg-blue-500/20 text-blue-400" : "bg-muted text-muted-foreground"
                }`}
              >
                {r.status}
              </span>
              <button onClick={() => setAnalyticsFor(analyticsFor === r.id ? null : r.id)} className="flex items-center gap-1 rounded border border-primary/30 px-2 py-1 font-mono text-xs">
                <BarChart3 className="h-3 w-3" /> analitik
              </button>
              <button onClick={() => setBroadcastFor(r.id)} className="flex items-center gap-1 rounded border border-primary/30 px-2 py-1 font-mono text-xs">
                <Megaphone className="h-3 w-3" /> duyur
              </button>
              {r.status === "drawn" && (
                <>
                  <button onClick={() => setWinnersFor(winnersFor === r.id ? null : r.id)} className="flex items-center gap-1 rounded border border-primary/30 px-2 py-1 font-mono text-xs">
                    <Users className="h-3 w-3" /> kazananlar
                  </button>
                  <button onClick={() => playLiveDraw(r.id, r.title)} className="flex items-center gap-1 rounded border border-primary/30 px-2 py-1 font-mono text-xs">
                    <Play className="h-3 w-3" /> canlı göster
                  </button>
                  <button
                    onClick={() => { if (confirm("Mevcut kazananlar iptal edilip yeniden çekilsin mi?")) drawMut.mutate({ id: r.id, redraw: true, title: r.title }); }}
                    className="flex items-center gap-1 rounded border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 font-mono text-xs text-yellow-400 hover:bg-yellow-500/20"
                  >
                    <Repeat className="h-3 w-3" /> yeniden çek
                  </button>
                </>
              )}
              {r.status === "active" && (
                <button onClick={() => { if (confirm(`${r.num_winners} kazanan seçilecek. Devam?`)) drawMut.mutate({ id: r.id, title: r.title }); }} className="flex items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/20">
                  <Play className="h-3 w-3" /> çek
                </button>
              )}

              <button
                onClick={() => {
                  setForm({
                    id: r.id,
                    title: r.title,
                    description: r.description ?? "",
                    image_url: r.image_url ?? "",
                    product_id: r.product_id ?? "",
                    custom_prize_name: r.custom_prize_name ?? "",
                    points_enabled: (r.entry_cost_points ?? 0) > 0,
                    entry_cost_points: r.entry_cost_points,
                    max_entries_per_user: r.max_entries_per_user,
                    end_at: new Date(r.end_at).toISOString().slice(0, 16),
                    status: r.status === "drawn" ? "active" : r.status,
                    min_tier: r.min_tier ?? "",
                    num_winners: r.num_winners ?? 1,
                    featured: !!r.featured,
                    is_recurring: !!r.is_recurring,
                    recurrence_days: r.recurrence_days ?? 7,
                    daily_bonus_enabled: !!r.daily_bonus_enabled,
                    share_bonus_enabled: !!r.share_bonus_enabled,
                  });
                  setShow(true);
                }}
                className="rounded border border-primary/30 px-2 py-1 font-mono text-xs"
              >
                düzenle
              </button>
              <button onClick={() => { if (confirm("Silinsin mi?")) delMut.mutate(r.id); }} className="rounded border border-red-500/40 px-2 py-1 text-red-400">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {analyticsFor === r.id && <AnalyticsBlock raffleId={r.id} />}
            {winnersFor === r.id && <WinnersBlock raffleId={r.id} onDisqualify={(wid) => dqFn({ data: { winnerId: wid } }).then(() => qc.invalidateQueries({ queryKey: ["admin-raffle-winners", r.id] }))} />}
          </div>
        ))}
        {list.data?.length === 0 && <div className="glass-card rounded p-8 text-center font-mono text-sm text-muted-foreground">henüz çekiliş yok.</div>}
      </div>

      {broadcastFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setBroadcastFor(null)}>
          <div className="glass-card w-full max-w-md space-y-3 rounded-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-primary">$ katılımcılara duyuru</h3>
              <button onClick={() => setBroadcastFor(null)}><X className="h-4 w-4" /></button>
            </div>
            <input placeholder="başlık" value={bTitle} onChange={(e) => setBTitle(e.target.value)} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5 text-sm" />
            <textarea placeholder="mesaj" value={bBody} onChange={(e) => setBBody(e.target.value)} className="w-full rounded border border-primary/30 bg-card px-2 py-1.5 text-sm" rows={3} />
            <button disabled={bcMut.isPending || !bTitle || !bBody} onClick={() => bcMut.mutate()} className="w-full rounded bg-primary py-2 font-mono text-sm text-background disabled:opacity-40">
              {bcMut.isPending ? "gönderiliyor…" : "gönder"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsBlock({ raffleId }: { raffleId: string }) {
  const q = useQuery({
    queryKey: ["raffle-analytics", raffleId],
    queryFn: () => raffleAnalytics({ data: { id: raffleId } }),
  });
  if (q.isLoading) return <div className="mt-3 font-mono text-xs text-muted-foreground">yükleniyor…</div>;
  const d = q.data;
  if (!d) return null;
  const max = Math.max(1, ...(d.hourly ?? []).map((h) => h.count));
  return (
    <div className="mt-3 space-y-3 rounded border border-primary/20 bg-card/40 p-3">
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="rounded bg-primary/10 p-2"><div className="text-muted-foreground">bilet</div><div className="text-lg text-primary">{d.total_entries}</div></div>
        <div className="rounded bg-primary/10 p-2"><div className="text-muted-foreground">tekil</div><div className="text-lg text-primary">{d.unique_participants}</div></div>
        <div className="rounded bg-primary/10 p-2"><div className="text-muted-foreground">puan</div><div className="text-lg text-primary">{d.points_spent}</div></div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">saatlik trend</div>
        <div className="flex h-16 items-end gap-0.5">
          {(d.hourly ?? []).map((h, i) => (
            <div key={i} title={`${h.hour}: ${h.count}`} className="flex-1 bg-primary/50" style={{ height: `${(h.count / max) * 100}%` }} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">ilk 10 katılımcı</div>
        <ol className="grid gap-0.5 font-mono text-xs">
          {(d.top_users ?? []).map((u, i) => (
            <li key={u.user_id} className="flex justify-between rounded bg-card/60 px-2 py-1">
              <span>#{i + 1} {u.name ?? "anon"}</span>
              <span className="text-primary">{u.entries} bilet</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function WinnersBlock({ raffleId, onDisqualify }: { raffleId: string; onDisqualify: (winnerId: string) => Promise<any> }) {
  const q = useQuery({
    queryKey: ["admin-raffle-winners", raffleId],
    queryFn: () => adminRaffleWinners({ data: { id: raffleId } }),
  });
  if (q.isLoading) return <div className="mt-3 font-mono text-xs text-muted-foreground">yükleniyor…</div>;
  return (
    <div className="mt-3 space-y-1 rounded border border-primary/20 bg-card/40 p-3 font-mono text-xs">
      {(q.data ?? []).map((w: any) => (
        <div key={w.id} className={`flex items-center gap-2 rounded px-2 py-1 ${w.disqualified_at ? "bg-red-500/10 text-red-400 line-through" : "bg-card/60"}`}>
          <span className="text-primary">{w.place}.</span>
          <span className="truncate">{w.email ?? w.display_name ?? `${String(w.user_id).slice(0, 8)}…`}</span>
          {w.is_backup && <span className="rounded bg-blue-500/20 px-1 text-[10px] text-blue-400">yedek</span>}
          {w.delivered_key && <span className="text-muted-foreground">· key ✓</span>}
          <div className="ml-auto">
            {!w.disqualified_at && (
              <button onClick={() => { if (confirm("Diskalifiye edilsin ve yedek çekilsin mi?")) onDisqualify(w.id); }} className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-0.5 text-red-400">
                <Ban className="h-3 w-3" /> diskalifiye
              </button>
            )}
          </div>
        </div>
      ))}
      {q.data?.length === 0 && <div className="text-muted-foreground">kazanan yok.</div>}
    </div>
  );
}
