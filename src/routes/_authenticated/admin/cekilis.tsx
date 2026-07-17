import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListRaffles, upsertRaffle, drawRaffle, deleteRaffle } from "@/lib/raffles.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Trash2, Play, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cekilis")({
  ssr: false,
  component: AdminRafflesPage,
});

type Form = {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  product_id: string;
  custom_prize_name: string;
  entry_cost_points: number;
  max_entries_per_user: number;
  end_at: string;
  status: "draft" | "active" | "cancelled";
};

const emptyForm: Form = {
  title: "",
  description: "",
  image_url: "",
  product_id: "",
  custom_prize_name: "",
  entry_cost_points: 100,
  max_entries_per_user: 5,
  end_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  status: "active",
};

function AdminRafflesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-raffles"], queryFn: () => adminListRaffles() });
  const products = useQuery({
    queryKey: ["admin-raffles-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,name").eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  const [form, setForm] = useState<Form>(emptyForm);
  const [show, setShow] = useState(false);

  const upsertFn = useServerFn(upsertRaffle);
  const drawFn = useServerFn(drawRaffle);
  const delFn = useServerFn(deleteRaffle);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        title: form.title,
        description: form.description || null,
        image_url: form.image_url || null,
        product_id: form.product_id || null,
        custom_prize_name: form.custom_prize_name || null,
        entry_cost_points: Number(form.entry_cost_points),
        max_entries_per_user: Number(form.max_entries_per_user),
        end_at: new Date(form.end_at).toISOString(),
        status: form.status,
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
    mutationFn: (id: string) => drawFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Kazanan belirlendi${r.delivered_key ? ` · key teslim edildi` : ""}`);
      qc.invalidateQueries({ queryKey: ["admin-raffles"] });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-primary neon-text">$ /admin/cekilis</h1>
        <button
          onClick={() => { setForm(emptyForm); setShow(!show); }}
          className="flex items-center gap-2 rounded border border-primary/50 bg-primary/10 px-3 py-1.5 font-mono text-sm text-primary hover:bg-primary/20"
        >
          <Plus className="h-4 w-4" /> yeni çekiliş
        </button>
      </div>

      {show && (
        <div className="glass-card space-y-3 rounded-lg p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">başlık</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">bitiş tarihi</span>
              <input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs md:col-span-2">
              <span className="font-mono text-muted-foreground">açıklama</span>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" rows={2} />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">ödül ürün (havuzdan key gider)</span>
              <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5">
                <option value="">— yok / özel ödül —</option>
                {(products.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">özel ödül adı (ürün seçilmediyse)</span>
              <input value={form.custom_prize_name} onChange={(e) => setForm({ ...form, custom_prize_name: e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">bilet maliyeti (puan, 0=ücretsiz)</span>
              <input type="number" min={0} value={form.entry_cost_points}
                onChange={(e) => setForm({ ...form, entry_cost_points: +e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">kişi başı max bilet</span>
              <input type="number" min={1} value={form.max_entries_per_user}
                onChange={(e) => setForm({ ...form, max_entries_per_user: +e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">görsel url</span>
              <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-mono text-muted-foreground">durum</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}
                className="w-full rounded border border-primary/30 bg-card px-2 py-1.5">
                <option value="active">aktif</option>
                <option value="draft">taslak</option>
                <option value="cancelled">iptal</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button disabled={save.isPending || !form.title} onClick={() => save.mutate()}
              className="rounded bg-primary px-4 py-1.5 font-mono text-sm text-background disabled:opacity-40">
              {save.isPending ? "kaydediliyor…" : "kaydet"}
            </button>
            <button onClick={() => setShow(false)} className="rounded border border-primary/30 px-4 py-1.5 font-mono text-sm">
              iptal
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(list.data ?? []).map((r: any) => (
          <div key={r.id} className="glass-card flex flex-wrap items-center gap-3 rounded p-3">
            <Trophy className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold">{r.title}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {r.product?.name ?? r.custom_prize_name ?? "—"} · {r.entry_cost_points}p/bilet · max {r.max_entries_per_user} · bitiş {new Date(r.end_at).toLocaleString("tr-TR")}
              </div>
            </div>
            <span className={`rounded px-2 py-0.5 font-mono text-[10px] ${
              r.status === "active" ? "bg-primary/20 text-primary" :
              r.status === "drawn" ? "bg-blue-500/20 text-blue-400" :
              "bg-muted text-muted-foreground"
            }`}>{r.status}</span>
            {r.status === "active" && (
              <button onClick={() => { if (confirm("Kazananı şimdi çekmek istiyor musun?")) drawMut.mutate(r.id); }}
                className="flex items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs text-primary hover:bg-primary/20">
                <Play className="h-3 w-3" /> çek
              </button>
            )}
            <button onClick={() => {
              setForm({
                id: r.id, title: r.title, description: r.description ?? "",
                image_url: r.image_url ?? "", product_id: r.product_id ?? "",
                custom_prize_name: r.custom_prize_name ?? "",
                entry_cost_points: r.entry_cost_points, max_entries_per_user: r.max_entries_per_user,
                end_at: new Date(r.end_at).toISOString().slice(0, 16),
                status: r.status === "drawn" ? "active" : r.status,
              });
              setShow(true);
            }} className="rounded border border-primary/30 px-2 py-1 font-mono text-xs">düzenle</button>
            <button onClick={() => { if (confirm("Silinsin mi?")) delMut.mutate(r.id); }}
              className="rounded border border-red-500/40 px-2 py-1 text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {list.data?.length === 0 && (
          <div className="glass-card rounded p-8 text-center font-mono text-sm text-muted-foreground">
            henüz çekiliş yok.
          </div>
        )}
      </div>
    </div>
  );
}
