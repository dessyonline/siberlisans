import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns, upsertCampaign, deleteCampaign, sendCampaignNow, testTelegramChannel } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Megaphone, Plus, Send, Trash2, Pencil, Clock, CheckCircle2, AlertTriangle, FileText, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/kampanyalar")({
  component: CampaignsAdmin,
});

type Draft = {
  id?: string;
  title: string;
  body: string;
  image_url: string;
  product_id: string | null;
  promo_code_id: string | null;
  scheduled_at: string; // datetime-local
  status: "draft" | "scheduled";
};

const EMPTY: Draft = {
  title: "",
  body: "",
  image_url: "",
  product_id: null,
  promo_code_id: null,
  scheduled_at: "",
  status: "draft",
};

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  draft: { label: "taslak", cls: "text-muted-foreground border-border bg-muted/20", icon: FileText },
  scheduled: { label: "zamanlandı", cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10", icon: Clock },
  sent: { label: "gönderildi", cls: "text-primary border-primary/40 bg-primary/10", icon: CheckCircle2 },
  failed: { label: "hata", cls: "text-red-400 border-red-400/40 bg-red-400/10", icon: AlertTriangle },
};

function CampaignsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaigns);
  const upsertFn = useServerFn(upsertCampaign);
  const deleteFn = useServerFn(deleteCampaign);
  const sendFn = useServerFn(sendCampaignNow);
  const testFn = useServerFn(testTelegramChannel);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof testTelegramChannel>> | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await testFn();
      setTestResult(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const { data: campaigns } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => listFn(),
  });

  const { data: products } = useQuery({
    queryKey: ["admin-campaigns-products"],
    queryFn: async () => (await supabase.from("products").select("id,name,slug").order("name")).data ?? [],
  });

  const { data: promos } = useQuery({
    queryKey: ["admin-campaigns-promos"],
    queryFn: async () => (await supabase.from("promo_codes").select("id,code").eq("active", true).order("code")).data ?? [],
  });

  const save = async (opts: { sendNow?: boolean } = {}) => {
    if (!draft) return;
    if (draft.title.trim().length < 2) { toast.error("Başlık gerekli"); return; }
    try {
      const status: "draft" | "scheduled" = draft.scheduled_at ? "scheduled" : "draft";
      const res = await upsertFn({
        data: {
          id: draft.id,
          title: draft.title.trim(),
          body: draft.body.trim() || null,
          image_url: draft.image_url.trim() || null,
          product_id: draft.product_id,
          promo_code_id: draft.promo_code_id,
          scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null,
          status,
        },
      });
      if (opts.sendNow) {
        await sendFn({ data: { id: res.id } });
        toast.success("Kanala gönderildi");
      } else {
        toast.success(status === "scheduled" ? "Zamanlandı" : "Taslak kaydedildi");
      }
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const sendOne = async (id: string) => {
    try {
      await sendFn({ data: { id } });
      toast.success("Kanala gönderildi");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Silindi");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-xs text-muted-foreground">./admin/kampanyalar</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Telegram Kampanyaları
          </h1>
          <p className="mt-1 text-xs text-muted-foreground font-mono">
            Kanala manuel veya zamanlanmış duyuru gönder. Yeni ürün / yeni promosyon kodu eklendiğinde otomatik post düşer.
          </p>
        </div>
        <Dialog open={!!draft} onOpenChange={(v) => setDraft(v ? draft ?? { ...EMPTY } : null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setDraft({ ...EMPTY })} className="font-mono">
              <Plus className="h-4 w-4 mr-1" /> yeni kampanya
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{draft?.id ? "Kampanyayı Düzenle" : "Yeni Kampanya"}</DialogTitle>
            </DialogHeader>
            {draft && (
              <div className="space-y-3">
                <div>
                  <Label>Başlık *</Label>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="🔥 Hafta sonu indirimi" />
                </div>
                <div>
                  <Label>Metin</Label>
                  <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} placeholder="Kampanya açıklaması…" />
                </div>
                <div>
                  <Label>Görsel URL (opsiyonel)</Label>
                  <Input value={draft.image_url} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} placeholder="https://…" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Boşsa seçili ürünün görseli kullanılır.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ürün bağla</Label>
                    <select
                      value={draft.product_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, product_id: e.target.value || null })}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm"
                    >
                      <option value="">(yok)</option>
                      {(products ?? []).map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <Label>Promo kodu bağla</Label>
                    <select
                      value={draft.promo_code_id ?? ""}
                      onChange={(e) => setDraft({ ...draft, promo_code_id: e.target.value || null })}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm"
                    >
                      <option value="">(yok)</option>
                      {(promos ?? []).map((p) => (<option key={p.id} value={p.id}>{p.code}</option>))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label>Zamanla (boş bırakılırsa taslak)</Label>
                  <Input
                    type="datetime-local"
                    value={draft.scheduled_at}
                    onChange={(e) => setDraft({ ...draft, scheduled_at: e.target.value })}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>iptal</Button>
              <Button variant="outline" onClick={() => save()}>kaydet</Button>
              <Button onClick={() => save({ sendNow: true })}>
                <Send className="h-4 w-4 mr-1" /> şimdi gönder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {(campaigns ?? []).length === 0 && (
          <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
            Henüz kampanya yok.
          </div>
        )}
        {(campaigns ?? []).map((c) => {
          const meta = STATUS_META[c.status] ?? STATUS_META.draft;
          const Icon = meta.icon;
          const product = c.product as { name: string; slug: string } | null;
          const promo = c.promo as { code: string } | null;
          return (
            <div key={c.id} className="glass-card rounded-xl p-5 flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${meta.cls}`}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                  <h3 className="font-semibold truncate">{c.title}</h3>
                </div>
                {c.body && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.body}</p>}
                <div className="mt-2 font-mono text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  {product && <span>ürün: <span className="text-foreground">{product.name}</span></span>}
                  {promo && <span>promo: <span className="text-foreground">{promo.code}</span></span>}
                  {c.scheduled_at && <span>zaman: {new Date(c.scheduled_at).toLocaleString("tr-TR")}</span>}
                  {c.sent_at && <span>gönderildi: {new Date(c.sent_at).toLocaleString("tr-TR")}</span>}
                  {c.error && <span className="text-red-400">hata: {c.error}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {c.status !== "sent" && (
                  <Button size="sm" variant="default" onClick={() => sendOne(c.id)} title="Şimdi gönder">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setDraft({
                  id: c.id,
                  title: c.title,
                  body: c.body ?? "",
                  image_url: c.image_url ?? "",
                  product_id: c.product_id,
                  promo_code_id: c.promo_code_id,
                  scheduled_at: c.scheduled_at ? c.scheduled_at.slice(0, 16) : "",
                  status: c.status === "scheduled" ? "scheduled" : "draft",
                })}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
