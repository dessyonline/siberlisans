import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { upsertPromoCode, deletePromoCode, listPromoCodesAdmin, listProductOptionsForPromo } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ticket, Plus, Pencil, Trash2, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/promosyonlar")({
  component: PromoAdmin,
});

type Promo = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  active: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  product_id: string | null;
  min_amount: number;
  note: string | null;
};

type Draft = Omit<Promo, "id" | "used_count"> & { id?: string };

const EMPTY: Draft = {
  code: "",
  discount_type: "percent",
  discount_value: 10,
  active: true,
  max_uses: null,
  expires_at: null,
  product_id: null,
  min_amount: 0,
  note: null,
};

function PromoAdmin() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertPromoCode);
  const deleteFn = useServerFn(deletePromoCode);
  const [draft, setDraft] = useState<Draft | null>(null);

  const listPromosFn = useServerFn(listPromoCodesAdmin);
  const listProductsFn = useServerFn(listProductOptionsForPromo);

  const { data: promos } = useQuery({
    queryKey: ["admin-promos"],
    queryFn: async () => listPromosFn(),
  });

  const { data: products } = useQuery({
    queryKey: ["admin-promos-products"],
    queryFn: async () => listProductsFn(),
  });

  const save = async () => {
    if (!draft) return;
    try {
      await upsertFn({
        data: {
          id: draft.id,
          code: draft.code,
          discount_type: draft.discount_type,
          discount_value: Number(draft.discount_value),
          active: draft.active,
          max_uses: draft.max_uses,
          expires_at: draft.expires_at,
          product_id: draft.product_id,
          min_amount: Number(draft.min_amount),
          note: draft.note,
        },
      });
      toast.success("Kaydedildi");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-promos"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Silindi");
      qc.invalidateQueries({ queryKey: ["admin-promos"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-mono text-xs text-muted-foreground">./admin/promosyonlar</div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Promosyon Kodları
          </h1>
        </div>
        <Dialog open={!!draft} onOpenChange={(v) => setDraft(v ? draft ?? { ...EMPTY } : null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setDraft({ ...EMPTY })} className="font-mono">
              <Plus className="h-4 w-4 mr-1" /> yeni kod
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{draft?.id ? "Kodu Düzenle" : "Yeni Promosyon Kodu"}</DialogTitle>
            </DialogHeader>
            {draft && (
              <div className="space-y-3">
                <div>
                  <Label>Kod</Label>
                  <Input
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                    placeholder="INDIRIM20"
                    className="font-mono uppercase"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tür</Label>
                    <select
                      value={draft.discount_type}
                      onChange={(e) => setDraft({ ...draft, discount_type: e.target.value as "percent" | "fixed" })}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm"
                    >
                      <option value="percent">Yüzde (%)</option>
                      <option value="fixed">Sabit (₺)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Değer</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.discount_value}
                      onChange={(e) => setDraft({ ...draft, discount_value: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Kullanım limiti (boş = sınırsız)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.max_uses ?? ""}
                      onChange={(e) => setDraft({ ...draft, max_uses: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label>Min. tutar (₺)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.min_amount}
                      onChange={(e) => setDraft({ ...draft, min_amount: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Bitiş tarihi (boş = süresiz)</Label>
                  <Input
                    type="datetime-local"
                    value={draft.expires_at ? draft.expires_at.slice(0, 16) : ""}
                    onChange={(e) => setDraft({ ...draft, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                </div>
                <div>
                  <Label>Ürün (boş = tüm ürünler)</Label>
                  <select
                    value={draft.product_id ?? ""}
                    onChange={(e) => setDraft({ ...draft, product_id: e.target.value || null })}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm"
                  >
                    <option value="">Tüm ürünler</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Not (opsiyonel)</Label>
                  <Input
                    value={draft.note ?? ""}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value || null })}
                  />
                </div>
                <label className="flex items-center gap-2 font-mono text-sm">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                  />
                  Aktif
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDraft(null)}>iptal</Button>
              <Button onClick={save}>kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {(promos ?? []).length === 0 && (
          <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
            Henüz promosyon kodu yok.
          </div>
        )}
        {(promos ?? []).map((p) => {
          const expired = p.expires_at && new Date(p.expires_at) < new Date();
          const exhausted = p.max_uses !== null && p.used_count >= p.max_uses;
          return (
            <div key={p.id} className="glass-card rounded-xl p-5 flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { navigator.clipboard.writeText(p.code); toast.success("Kod kopyalandı"); }}
                    className="font-mono text-lg text-primary neon-text flex items-center gap-1 hover:underline"
                  >
                    {p.code} <Copy className="h-3.5 w-3.5 opacity-60" />
                  </button>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${p.active && !expired && !exhausted ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-border bg-muted/30"}`}>
                    {!p.active ? "pasif" : expired ? "süresi doldu" : exhausted ? "limit doldu" : "aktif"}
                  </span>
                </div>
                <div className="mt-2 font-mono text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    indirim:{" "}
                    <span className="text-foreground">
                      {p.discount_type === "percent" ? `%${p.discount_value}` : `₺${p.discount_value}`}
                    </span>
                  </span>
                  <span>
                    kullanım: <span className="text-foreground">{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ""}</span>
                  </span>
                  {p.min_amount > 0 && <span>min: ₺{p.min_amount}</span>}
                  {p.expires_at && <span>bitiş: {new Date(p.expires_at).toLocaleString("tr-TR")}</span>}
                  {p.product_id && (
                    <span>ürün: {products?.find((x) => x.id === p.product_id)?.name ?? "?"}</span>
                  )}
                </div>
                {p.note && <div className="mt-1 text-xs text-muted-foreground">{p.note}</div>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft({
                  id: p.id, code: p.code, discount_type: p.discount_type, discount_value: p.discount_value,
                  active: p.active, max_uses: p.max_uses, expires_at: p.expires_at,
                  product_id: p.product_id, min_amount: p.min_amount, note: p.note,
                })}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(p.id)}>
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
