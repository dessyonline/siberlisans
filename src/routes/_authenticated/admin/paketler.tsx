import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { Package, Plus, Trash2, Save, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/paketler")({
  component: AdminBundles,
  head: () => ({ meta: [{ title: "Paketler — Admin" }] }),
});

type BundleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_try: number;
  discount_percent: number;
  active: boolean;
  items: {
    product_id: string;
    quantity: number;
    product: { name: string; price_try: number; cost_try: number | null } | null;
  }[];
};

function AdminBundles() {
  const qc = useQueryClient();
  const { data: bundles } = useQuery({
    queryKey: ["admin-bundles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_bundles")
        .select(
          "*, items:product_bundle_items(product_id, quantity, product:products(name, price_try, cost_try))",
        )
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as BundleRow[];
    },
  });
  const { data: products } = useQuery({
    queryKey: ["admin-bundles-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price_try, cost_try")
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    slug: "",
    name: "",
    description: "",
    price_try: 0,
    discount_percent: 0,
  });
  const [editing, setEditing] = useState<Record<string, Partial<BundleRow>>>({});

  async function create() {
    if (!form.slug || !form.name || form.price_try <= 0)
      return toast.error("Zorunlu alanlar");
    const { error } = await supabase.from("product_bundles").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Paket eklendi");
    setForm({ slug: "", name: "", description: "", price_try: 0, discount_percent: 0 });
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from("product_bundles").update({ active: !active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  async function deleteBundle(id: string) {
    if (!confirm("Sil?")) return;
    await supabase.from("product_bundles").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  async function addItem(bundleId: string, productId: string) {
    if (!productId) return;
    const { error } = await supabase
      .from("product_bundle_items")
      .insert({ bundle_id: bundleId, product_id: productId, quantity: 1 });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  async function updateItemQty(bundleId: string, productId: string, quantity: number) {
    if (quantity < 1) return;
    await supabase
      .from("product_bundle_items")
      .update({ quantity })
      .eq("bundle_id", bundleId)
      .eq("product_id", productId);
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  async function removeItem(bundleId: string, productId: string) {
    await supabase
      .from("product_bundle_items")
      .delete()
      .eq("bundle_id", bundleId)
      .eq("product_id", productId);
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  async function saveEdit(id: string) {
    const patch = editing[id];
    if (!patch) return;
    const { error } = await supabase
      .from("product_bundles")
      .update({
        slug: patch.slug,
        name: patch.name,
        description: patch.description,
        price_try: patch.price_try,
        discount_percent: patch.discount_percent,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Güncellendi");
    setEditing((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
    qc.invalidateQueries({ queryKey: ["admin-bundles"] });
  }

  function startEdit(b: BundleRow) {
    setEditing((s) => ({
      ...s,
      [b.id]: {
        slug: b.slug,
        name: b.name,
        description: b.description ?? "",
        price_try: b.price_try,
        discount_percent: b.discount_percent,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-muted-foreground">./admin/paketler</div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Package className="h-6 w-6" /> Ürün Paketleri
        </h1>
      </div>

      <div className="glass-card rounded-xl p-5">
        <div className="text-sm font-semibold mb-3">Yeni Paket</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="slug (ör: baslangic-paketi)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <Input
            placeholder="Paket adı"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            type="number"
            placeholder="Fiyat ₺"
            value={form.price_try || ""}
            onChange={(e) => setForm({ ...form, price_try: Number(e.target.value) })}
          />
          <Input
            type="number"
            placeholder="İndirim %"
            value={form.discount_percent || ""}
            onChange={(e) =>
              setForm({ ...form, discount_percent: Number(e.target.value) })
            }
          />
          <Textarea
            placeholder="Açıklama"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="md:col-span-2"
          />
        </div>
        <Button onClick={create} className="mt-3">
          <Plus className="h-4 w-4 mr-1" /> Ekle
        </Button>
      </div>

      <div className="space-y-3">
        {(bundles ?? []).map((bb) => {
          const isEditing = !!editing[bb.id];
          const e = editing[bb.id];
          return (
            <div key={bb.id} className="glass-card rounded-xl p-5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                {isEditing ? (
                  <div className="grid gap-2 md:grid-cols-2 flex-1">
                    <Input
                      value={e?.slug ?? ""}
                      onChange={(ev) =>
                        setEditing((s) => ({
                          ...s,
                          [bb.id]: { ...s[bb.id], slug: ev.target.value },
                        }))
                      }
                      placeholder="slug"
                    />
                    <Input
                      value={e?.name ?? ""}
                      onChange={(ev) =>
                        setEditing((s) => ({
                          ...s,
                          [bb.id]: { ...s[bb.id], name: ev.target.value },
                        }))
                      }
                      placeholder="ad"
                    />
                    <Input
                      type="number"
                      value={e?.price_try ?? 0}
                      onChange={(ev) =>
                        setEditing((s) => ({
                          ...s,
                          [bb.id]: { ...s[bb.id], price_try: Number(ev.target.value) },
                        }))
                      }
                      placeholder="fiyat"
                    />
                    <Input
                      type="number"
                      value={e?.discount_percent ?? 0}
                      onChange={(ev) =>
                        setEditing((s) => ({
                          ...s,
                          [bb.id]: {
                            ...s[bb.id],
                            discount_percent: Number(ev.target.value),
                          },
                        }))
                      }
                      placeholder="indirim %"
                    />
                    <Textarea
                      value={e?.description ?? ""}
                      onChange={(ev) =>
                        setEditing((s) => ({
                          ...s,
                          [bb.id]: { ...s[bb.id], description: ev.target.value },
                        }))
                      }
                      placeholder="açıklama"
                      className="md:col-span-2"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="text-lg font-semibold">{bb.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      /{bb.slug} · ₺{bb.price_try} · -%{bb.discount_percent}
                      {!bb.active && " · pasif"}
                    </div>
                    {bb.description && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {bb.description}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button size="sm" onClick={() => saveEdit(bb.id)}>
                        <Save className="h-3 w-3 mr-1" /> kaydet
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing((s) => {
                            const n = { ...s };
                            delete n[bb.id];
                            return n;
                          })
                        }
                      >
                        iptal
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(bb)}>
                        <Pencil className="h-3 w-3 mr-1" /> düzenle
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(bb.id, bb.active)}
                      >
                        {bb.active ? "pasifleştir" : "aktifleştir"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteBundle(bb.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {bb.items.map((it) => (
                  <div
                    key={it.product_id}
                    className="flex items-center justify-between text-sm py-1 border-b border-border/20 gap-2"
                  >
                    <span className="flex-1 truncate">· {it.product?.name}</span>
                    <input
                      type="number"
                      min={1}
                      defaultValue={it.quantity}
                      onBlur={(ev) => {
                        const q = Number(ev.target.value);
                        if (q !== it.quantity)
                          updateItemQty(bb.id, it.product_id, q);
                      }}
                      className="h-7 w-16 rounded border border-border bg-input px-2 text-sm"
                    />
                    <button
                      onClick={() => removeItem(bb.id, it.product_id)}
                      className="text-destructive text-xs hover:underline"
                    >
                      kaldır
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <select
                  onChange={(ev) => {
                    if (ev.target.value) {
                      addItem(bb.id, ev.target.value);
                      ev.target.value = "";
                    }
                  }}
                  className="h-9 rounded-md bg-input border border-border px-2 text-sm flex-1"
                >
                  <option value="">+ ürün ekle</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ₺{p.price_try}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
