import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { upsertProduct } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

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
        },
      });
      toast.success("Kaydedildi");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl neon-text">Ürünler</h1>
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ active: true, duration: "monthly", delivery_type: "key", price_try: 0 })} className="font-mono">
              <Plus className="h-4 w-4 mr-1" />yeni ürün
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-mono">{editing?.id ? "düzenle" : "yeni ürün"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="ad" value={editing?.name ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, name: v }))} />
              <Field label="slug (a-z, 0-9, -)" value={editing?.slug ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, slug: v }))} />
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
              <div className="flex items-center gap-2 font-mono text-sm">
                <Switch checked={editing?.active ?? true} onCheckedChange={(v) => setEditing((p) => ({ ...p!, active: v }))} />
                <span>aktif</span>
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
          return (
            <div key={p.id} className="glass-card rounded-lg p-4 font-mono text-sm flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{p.name} <span className="text-xs text-muted-foreground">/{p.slug}</span></div>
                <div className="text-xs text-muted-foreground">{p.duration} · ₺{Number(p.price_try).toLocaleString("tr-TR")}</div>
              </div>
              <div className={`text-xs ${avail < 3 ? "text-warn" : "text-cyan"}`}>
                stok: {avail} / {total}
              </div>
              <div className={`text-xs ${p.active ? "text-primary" : "text-muted-foreground"}`}>
                {p.active ? "aktif" : "pasif"}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
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
