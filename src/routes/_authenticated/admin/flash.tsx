import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminUpsertFlashSale, adminDeleteFlashSale } from "@/lib/flash-sales.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/flash")({
  component: AdminFlashPage,
  head: () => ({ meta: [{ title: "Flash İndirim — Admin" }, { name: "robots", content: "noindex" }] }),
});

type FlashSale = {
  id: string;
  product_id: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  label: string | null;
  product?: { name: string; slug: string } | null;
};

function AdminFlashPage() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertFlashSale);
  const deleteFn = useServerFn(adminDeleteFlashSale);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FlashSale | null>(null);

  const { data: sales = [] } = useQuery({
    queryKey: ["admin-flash-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: new table
        .from("flash_sales" as any)
        .select("*, product:products(name, slug)")
        .order("ends_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FlashSale[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products-list-min"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name").order("name");
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Silmek istediğine emin misin?")) return;
    await deleteFn({ data: { id } });
    toast.success("silindi");
    qc.invalidateQueries({ queryKey: ["admin-flash-sales"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground">./admin/flash</div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-warn" /> Flash İndirimler
          </h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono neon-glow" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 mr-1" /> yeni
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-mono">
                {editing ? "İndirim düzenle" : "Yeni flash indirim"}
              </DialogTitle>
            </DialogHeader>
            <FlashForm
              initial={editing}
              products={products}
              onSubmit={async (v) => {
                await upsertFn({ data: { ...v, id: editing?.id } });
                toast.success("kaydedildi");
                qc.invalidateQueries({ queryKey: ["admin-flash-sales"] });
                setOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-card rounded-lg overflow-hidden">
        {sales.length === 0 ? (
          <div className="p-10 text-center font-mono text-sm text-muted-foreground">
            henüz flash indirim yok
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 font-mono text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">ürün</th>
                <th className="text-left p-3">indirim</th>
                <th className="text-left p-3">başlangıç</th>
                <th className="text-left p-3">bitiş</th>
                <th className="text-left p-3">durum</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const active = s.is_active && new Date(s.ends_at) > new Date() && new Date(s.starts_at) <= new Date();
                return (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="p-3">
                      <div className="font-medium">{s.product?.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">/{s.product?.slug}</div>
                    </td>
                    <td className="p-3 font-mono text-primary">
                      {s.discount_type === "percent" ? `%${s.discount_value}` : `₺${s.discount_value}`}
                      {s.label && <div className="text-[10px] text-muted-foreground">{s.label}</div>}
                    </td>
                    <td className="p-3 font-mono text-xs">{new Date(s.starts_at).toLocaleString("tr-TR")}</td>
                    <td className="p-3 font-mono text-xs">{new Date(s.ends_at).toLocaleString("tr-TR")}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${
                          active
                            ? "text-primary border-primary/40 bg-primary/10"
                            : "text-muted-foreground border-border bg-muted/30"
                        }`}
                      >
                        {active ? "aktif" : s.is_active ? "beklemede" : "pasif"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(s);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function toLocal(d: string | Date | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function FlashForm({
  initial,
  products,
  onSubmit,
}: {
  initial: FlashSale | null;
  products: { id: string; name: string }[];
  onSubmit: (v: {
    product_id: string;
    discount_type: "percent" | "amount";
    discount_value: number;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
    label: string | null;
  }) => Promise<void>;
}) {
  const [productId, setProductId] = useState(initial?.product_id ?? products[0]?.id ?? "");
  const [type, setType] = useState<"percent" | "amount">(initial?.discount_type ?? "percent");
  const [value, setValue] = useState(String(initial?.discount_value ?? 20));
  const [starts, setStarts] = useState(toLocal(initial?.starts_at ?? new Date()));
  const [ends, setEnds] = useState(
    toLocal(initial?.ends_at ?? new Date(Date.now() + 24 * 3600_000)),
  );
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!productId) return toast.error("ürün seç");
    const v = Number(value);
    if (!v || v <= 0) return toast.error("indirim > 0");
    setBusy(true);
    try {
      await onSubmit({
        product_id: productId,
        discount_type: type,
        discount_value: v,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(ends).toISOString(),
        is_active: active,
        label: label.trim() || null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="font-mono text-xs">ürün</Label>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="font-mono text-xs">tür</Label>
          <Select value={type} onValueChange={(v) => setType(v as "percent" | "amount")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">yüzde (%)</SelectItem>
              <SelectItem value="amount">tutar (₺)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-mono text-xs">değer</Label>
          <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="font-mono text-xs">başlangıç</Label>
          <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div>
          <Label className="font-mono text-xs">bitiş</Label>
          <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="font-mono text-xs">etiket (opsiyonel)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ör: Kara Cuma" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={active} onCheckedChange={setActive} />
        <Label className="font-mono text-xs">aktif</Label>
      </div>
      <Button className="w-full font-mono neon-glow" onClick={submit} disabled={busy}>
        {busy ? "kaydediliyor…" : "kaydet"}
      </Button>
    </div>
  );
}
