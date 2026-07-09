import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Trash2, Plus, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/capraz-satis")({
  component: CrossSellAdmin,
  head: () => ({ meta: [{ title: "Çapraz Satış — Admin" }] }),
});

type Rule = {
  id: string;
  from_category: string;
  to_category: string;
  discount_percent: number;
  promo_code: string | null;
  note: string | null;
  active: boolean;
};

function CrossSellAdmin() {
  const qc = useQueryClient();
  const { data: rules } = useQuery({
    queryKey: ["admin-cross-sell-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cross_sell_rules" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-product-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("category")
        .not("category", "is", null)
        .eq("active", true);
      if (error) throw error;
      const uniq = Array.from(new Set((data ?? []).map((r) => r.category).filter(Boolean))) as string[];
      return uniq.sort();
    },
  });

  const [draft, setDraft] = useState<Partial<Rule>>({
    discount_percent: 10,
    active: true,
  });

  const save = async () => {
    if (!draft.from_category || !draft.to_category) {
      toast.error("Kategoriler zorunlu");
      return;
    }
    if (draft.from_category === draft.to_category) {
      toast.error("Aynı kategori seçilemez");
      return;
    }
    const payload = {
      from_category: draft.from_category,
      to_category: draft.to_category,
      discount_percent: Number(draft.discount_percent ?? 10),
      promo_code: draft.promo_code?.trim() || null,
      note: draft.note?.trim() || null,
      active: draft.active ?? true,
    };
    const { error } = await supabase.from("cross_sell_rules" as never).insert(payload as never);
    if (error) return toast.error(error.message);
    toast.success("Kural eklendi");
    setDraft({ discount_percent: 10, active: true });
    qc.invalidateQueries({ queryKey: ["admin-cross-sell-rules"] });
  };

  const toggleActive = async (r: Rule) => {
    const { error } = await supabase
      .from("cross_sell_rules" as never)
      .update({ active: !r.active } as never)
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-cross-sell-rules"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Kuralı silmek istediğinden emin misin?")) return;
    const { error } = await supabase.from("cross_sell_rules" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Silindi");
    qc.invalidateQueries({ queryKey: ["admin-cross-sell-rules"] });
  };

  const cats = categories ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-muted-foreground">./admin/cross-sell</div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Çapraz Satış Kuralları
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          "Bu kategoriden ürün alan müşteriye şu kategoriden %X indirimli teklif göster."
          Kural devrede olduğu sürece ödeme sayfasında otomatik olarak çıkar.
        </p>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
          yeni kural
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-mono">
            <span className="block mb-1 text-muted-foreground">alınan kategori</span>
            <select
              value={draft.from_category ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, from_category: e.target.value }))}
              className="w-full h-9 rounded border border-border bg-input px-2 text-sm"
            >
              <option value="">— seç —</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-mono">
            <span className="block mb-1 text-muted-foreground">önerilecek kategori</span>
            <select
              value={draft.to_category ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, to_category: e.target.value }))}
              className="w-full h-9 rounded border border-border bg-input px-2 text-sm"
            >
              <option value="">— seç —</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs font-mono">
            <span className="block mb-1 text-muted-foreground">indirim %</span>
            <input
              type="number"
              min={1}
              max={90}
              value={draft.discount_percent ?? 10}
              onChange={(e) => setDraft((d) => ({ ...d, discount_percent: Number(e.target.value) }))}
              className="w-full h-9 rounded border border-border bg-input px-2 text-sm"
            />
          </label>
          <label className="text-xs font-mono">
            <span className="block mb-1 text-muted-foreground">promo kodu (ops.)</span>
            <input
              type="text"
              placeholder="COMBO10"
              value={draft.promo_code ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, promo_code: e.target.value.toUpperCase() }))}
              className="w-full h-9 rounded border border-border bg-input px-2 text-sm font-mono uppercase"
            />
          </label>
          <label className="text-xs font-mono sm:col-span-2 lg:col-span-1">
            <span className="block mb-1 text-muted-foreground">not (ops.)</span>
            <input
              type="text"
              placeholder="Kombo teklifi"
              value={draft.note ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="w-full h-9 rounded border border-border bg-input px-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-mono hover:bg-primary/90 neon-glow"
          >
            <Plus className="h-4 w-4" /> kural ekle
          </button>
        </div>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
          tanımlı kurallar · {rules?.length ?? 0}
        </div>
        {(rules ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground font-mono py-8 text-center">
            henüz kural yok
          </div>
        ) : (
          <div className="space-y-2">
            {(rules ?? []).map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                  r.active ? "border-primary/40 bg-primary/5" : "border-border/60 opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 font-mono text-sm flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-cyan/10 text-cyan border border-cyan/30 text-xs">
                    {r.from_category}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 text-xs">
                    {r.to_category}
                  </span>
                  <span className="text-warn font-semibold">%{r.discount_percent}</span>
                  {r.promo_code && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-warn/30 bg-warn/5 text-warn">
                      {r.promo_code}
                    </span>
                  )}
                  {r.note && <span className="text-xs text-muted-foreground truncate">· {r.note}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(r)}
                    className="text-xs font-mono px-2 py-1 rounded border border-border hover:border-primary/40"
                  >
                    {r.active ? "aktif" : "pasif"}
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="text-destructive hover:bg-destructive/10 p-1.5 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
