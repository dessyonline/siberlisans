import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { upsertProduct, deleteProduct } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/urunler")({
  component: ProductsAdmin,
});

type DeliveryType = "key" | "account" | "link" | "link_token";
const DELIVERY_LABELS: Record<DeliveryType, string> = {
  key: "text key",
  account: "mail hesabı (email:şifre)",
  link: "hazır link",
  link_token: "aktivasyon linki (token)",
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration: "monthly" | "yearly" | "lifetime";
  delivery_type: DeliveryType;
  price_try: number;
  active: boolean;
  category: string | null;
  manual_fulfillment: boolean;
  stock_hint: number | null;
  featured: boolean;
  unlimited_stock: boolean;
};

function ProductsAdmin() {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, license_keys(id, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const upsertFn = useServerFn(upsertProduct);
  const deleteFn = useServerFn(deleteProduct);

  const save = async () => {
    if (!editing) return;
    try {
      await upsertFn({
        data: {
          id: editing.id,
          name: editing.name ?? "",
          slug: editing.slug ?? "",
          description: editing.description ?? "",
          duration: (editing.duration ?? "monthly") as "monthly" | "yearly" | "lifetime",
          delivery_type: (editing.delivery_type ?? "key") as DeliveryType,
          price_try: Number(editing.price_try ?? 0),
          active: editing.active ?? true,
          category: editing.category ?? null,
          manual_fulfillment: editing.manual_fulfillment ?? false,
          stock_hint: editing.stock_hint == null ? null : Number(editing.stock_hint),
          featured: editing.featured ?? false,
          unlimited_stock: editing.unlimited_stock ?? false,
        },
      });
      toast.success("Kaydedildi");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    try {
      await deleteFn({ data: { id } });
      toast.success("Silindi");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-mono text-xl sm:text-2xl neon-text">Ürünler</h1>
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ active: true, duration: "monthly", delivery_type: "key", price_try: 0, manual_fulfillment: false, featured: false })} className="font-mono" size="sm">
              <Plus className="h-4 w-4 mr-1" />yeni ürün
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-mono">{editing?.id ? "düzenle" : "yeni ürün"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="ad" value={editing?.name ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, name: v }))} />
              <Field label="slug (a-z, 0-9, -)" value={editing?.slug ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, slug: v }))} />
              <Field label="kategori" value={editing?.category ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, category: v }))} />
              <div>
                <Label className="font-mono text-xs">açıklama</Label>
                <Textarea value={editing?.description ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, description: e.target.value }))} className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-mono text-xs">süre</Label>
                  <select
                    value={editing?.duration ?? "monthly"}
                    onChange={(e) => setEditing((p) => ({ ...p!, duration: e.target.value as Product["duration"] }))}
                    className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm"
                  >
                    <option value="monthly">aylık</option>
                    <option value="yearly">yıllık</option>
                    <option value="lifetime">ömürlük</option>
                  </select>
                </div>
                <Field label="fiyat (₺)" value={String(editing?.price_try ?? 0)} onChange={(v) => setEditing((p) => ({ ...p!, price_try: Number(v) }))} type="number" />
              </div>
              <div>
                <Label className="font-mono text-xs">teslim tipi</Label>
                <select
                  value={editing?.delivery_type ?? "key"}
                  onChange={(e) => setEditing((p) => ({ ...p!, delivery_type: e.target.value as DeliveryType }))}
                  className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm"
                >
                  {(Object.keys(DELIVERY_LABELS) as DeliveryType[]).map((k) => (
                    <option key={k} value={k}>{DELIVERY_LABELS[k]}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {editing?.delivery_type === "account" && "havuza her satıra 'email:sifre' formatında ekle"}
                  {editing?.delivery_type === "link" && "havuza her satıra bir URL ekle"}
                  {editing?.delivery_type === "link_token" && "havuza payload metnini ekle; sistem her sipariş için /aktivasyon/{token} üretecek"}
                  {(!editing?.delivery_type || editing?.delivery_type === "key") && "havuza her satıra bir lisans anahtarı ekle"}
                </p>
              </div>
              <Field
                label="stok (manuel giriş — havuz boşsa gösterilir)"
                value={editing?.stock_hint == null ? "" : String(editing.stock_hint)}
                onChange={(v) => setEditing((p) => ({ ...p!, stock_hint: v === "" ? null : Number(v) }))}
                type="number"
              />
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Switch checked={editing?.active ?? true} onCheckedChange={(v) => setEditing((p) => ({ ...p!, active: v }))} />
                  <span>aktif</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Switch checked={editing?.manual_fulfillment ?? false} onCheckedChange={(v) => setEditing((p) => ({ ...p!, manual_fulfillment: v }))} />
                  <span>manuel teslimat</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Switch checked={editing?.featured ?? false} onCheckedChange={(v) => setEditing((p) => ({ ...p!, featured: v }))} />
                  <span>öne çıkan</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Switch checked={editing?.unlimited_stock ?? false} onCheckedChange={(v) => setEditing((p) => ({ ...p!, unlimited_stock: v }))} />
                  <span>sınırsız stok ∞</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save} className="font-mono">kaydet</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6 space-y-3">
        {(products ?? []).map((p) => {
          const avail = (p.license_keys ?? []).filter((k: { status: string }) => k.status === "available").length;
          const total = (p.license_keys ?? []).length;
          const stockShown = avail > 0 ? avail : (p.stock_hint ?? 0);
          return (
            <div key={p.id} className="glass-card rounded-lg p-3 sm:p-4 font-mono text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2 flex-wrap">
                    {p.featured && <Star className="h-3 w-3 text-warn fill-warn shrink-0" />}
                    <span className="break-all">{p.name}</span>
                    <span className="text-xs text-muted-foreground break-all">/{p.slug}</span>
                  </div>
                  <div className="text-xs text-muted-foreground break-words mt-0.5">
                    {p.category ?? "—"} · {p.duration} · ₺{Number(p.price_try).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 self-end sm:self-center">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-mono">Ürünü sil?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <b>{p.name}</b> ve bağlı tüm key'leri kalıcı olarak silinecek. Bu işlem geri alınamaz.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-mono">vazgeç</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(p.id)} className="font-mono bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          sil
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
                <div className="text-[10px] rounded border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
                  {DELIVERY_LABELS[(p.delivery_type ?? "key") as DeliveryType]}
                </div>
                {p.manual_fulfillment && (
                  <div className="text-[10px] rounded border border-warn/40 bg-warn/10 px-2 py-1 text-warn">manuel</div>
                )}
                <div className={`text-xs ${p.unlimited_stock ? "text-cyan" : (stockShown < 3 ? "text-warn" : "text-cyan")}`}>
                  stok: {p.unlimited_stock ? "∞" : `${avail}/${total}`}{!p.unlimited_stock && p.stock_hint != null && ` · hint:${p.stock_hint}`}
                </div>
                <div className={`text-xs ${p.active ? "text-primary" : "text-muted-foreground"}`}>
                  {p.active ? "aktif" : "pasif"}
                </div>
              </div>
            </div>

          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="font-mono text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}
