import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminUpsertCoupon, adminDeleteCoupon } from "@/lib/coupons.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Ticket, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/kuponlar")({
  component: AdminCouponsPage,
  head: () => ({ meta: [{ title: "Kuponlar — Admin" }, { name: "robots", content: "noindex" }] }),
});

type Coupon = {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  min_order_try: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

function AdminCouponsPage() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(adminUpsertCoupon);
  const deleteFn = useServerFn(adminDeleteCoupon);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: table not in generated types
        .from("coupons" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Coupon[];
    },
  });

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(c: Coupon) {
    setEditing(c);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          code: String(fd.get("code")),
          discount_type: String(fd.get("discount_type")) as "percent" | "amount",
          discount_value: Number(fd.get("discount_value")),
          min_order_try: Number(fd.get("min_order_try") || 0),
          max_uses: fd.get("max_uses") ? Number(fd.get("max_uses")) : null,
          expires_at: (fd.get("expires_at") as string) || null,
          is_active: fd.get("is_active") === "on",
        },
      });
      toast.success(editing ? "Kupon güncellendi" : "Kupon oluşturuldu");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Kupon silinsin mi?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Silindi");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-mono text-2xl neon-text flex items-center gap-2">
          <Ticket className="h-5 w-5" /> ./kuponlar
        </h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="font-mono">
              <Plus className="h-4 w-4 mr-1" /> yeni kupon
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono">{editing ? "kupon düzenle" : "yeni kupon"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <Label className="font-mono text-xs">Kod</Label>
                <Input name="code" required defaultValue={editing?.code} placeholder="HOSGELDIN10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-mono text-xs">İndirim tipi</Label>
                  <Select name="discount_type" defaultValue={editing?.discount_type ?? "percent"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Yüzde (%)</SelectItem>
                      <SelectItem value="amount">Tutar (₺)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-mono text-xs">Değer</Label>
                  <Input name="discount_value" type="number" step="0.01" min="0.01" required
                    defaultValue={editing?.discount_value} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-mono text-xs">Min. sepet (₺)</Label>
                  <Input name="min_order_try" type="number" step="0.01" min="0"
                    defaultValue={editing?.min_order_try ?? 0} />
                </div>
                <div>
                  <Label className="font-mono text-xs">Maks. kullanım</Label>
                  <Input name="max_uses" type="number" min="1" defaultValue={editing?.max_uses ?? ""} placeholder="sınırsız" />
                </div>
              </div>
              <div>
                <Label className="font-mono text-xs">Son kullanım (opsiyonel)</Label>
                <Input name="expires_at" type="datetime-local"
                  defaultValue={editing?.expires_at?.slice(0, 16) ?? ""} />
              </div>
              <div className="flex items-center gap-3">
                <Switch name="is_active" defaultChecked={editing?.is_active ?? true} />
                <Label className="font-mono text-xs">Aktif</Label>
              </div>
              <Button type="submit" className="w-full font-mono">$ kaydet</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="font-mono text-muted-foreground">yükleniyor…</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-12 font-mono text-muted-foreground">Henüz kupon yok.</div>
      ) : (
        <div className="glass-card rounded-md border border-border/60 divide-y divide-border/40">
          {coupons.map((c) => (
            <div key={c.id} className="p-3 flex items-center gap-3 font-mono text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-primary neon-text">{c.code}</span>
                  {!c.is_active && <span className="text-[10px] text-destructive">pasif</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.discount_type === "percent" ? `%${c.discount_value}` : `₺${c.discount_value}`}
                  {" · "}min ₺{c.min_order_try}
                  {c.max_uses ? ` · ${c.used_count}/${c.max_uses}` : ` · ${c.used_count} kullanım`}
                  {c.expires_at && ` · bitiş ${new Date(c.expires_at).toLocaleDateString("tr-TR")}`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(c.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
