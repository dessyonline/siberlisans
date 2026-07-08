import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Star, Search, X, Package, AlertTriangle, Crown, Copy, ImageIcon, EyeOff, Eye } from "lucide-react";

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
  sort_order: number;
  tier: "standard" | "epic";
  image_url: string | null;
};

type Filter = "all" | "active" | "inactive" | "featured" | "epic" | "low" | "empty";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function ProductsAdmin() {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, license_keys(id, status)")
        .order("sort_order", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const upsertFn = useServerFn(upsertProduct);
  const deleteFn = useServerFn(deleteProduct);

  const stats = useMemo(() => {
    const list = products ?? [];
    let active = 0, low = 0, empty = 0, epic = 0, featured = 0;
    for (const p of list as Array<Product & { license_keys: { status: string }[] }>) {
      if (p.active) active++;
      if (p.tier === "epic") epic++;
      if (p.featured) featured++;
      if (p.unlimited_stock || p.manual_fulfillment) continue;
      const avail = (p.license_keys ?? []).filter((k) => k.status === "available").length;
      const total = (p.license_keys ?? []).length;
      const shown = avail > 0 ? avail : (p.stock_hint ?? 0);
      if (total > 0 && avail === 0) empty++;
      else if (shown > 0 && shown < 3) low++;
    }
    return { total: list.length, active, low, empty, epic, featured };
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p: Product & { license_keys: { status: string }[] }) => {
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      )) return false;
      const avail = (p.license_keys ?? []).filter((k) => k.status === "available").length;
      const total = (p.license_keys ?? []).length;
      const shown = avail > 0 ? avail : (p.stock_hint ?? 0);
      switch (filter) {
        case "active": return p.active;
        case "inactive": return !p.active;
        case "featured": return p.featured;
        case "epic": return p.tier === "epic";
        case "empty": return !p.unlimited_stock && !p.manual_fulfillment && total > 0 && avail === 0;
        case "low": return !p.unlimited_stock && !p.manual_fulfillment && shown > 0 && shown < 3;
        default: return true;
      }
    });
  }, [products, search, filter]);

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
          sort_order: Number(editing.sort_order ?? 0),
          tier: (editing.tier ?? "standard") as "standard" | "epic",
          image_url: editing.image_url && editing.image_url.trim() !== "" ? editing.image_url : null,
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

  const quickToggle = async (p: Product, patch: Partial<Product>) => {
    try {
      await upsertFn({
        data: {
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description ?? "",
          duration: p.duration,
          delivery_type: p.delivery_type,
          price_try: Number(p.price_try),
          active: patch.active ?? p.active,
          category: p.category ?? null,
          manual_fulfillment: p.manual_fulfillment,
          stock_hint: p.stock_hint,
          featured: patch.featured ?? p.featured,
          unlimited_stock: p.unlimited_stock,
          sort_order: Number(p.sort_order ?? 0),
          tier: p.tier,
          image_url: p.image_url && p.image_url.trim() !== "" ? p.image_url : null,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const duplicate = (p: Product) => {
    setEditing({
      ...p,
      id: undefined,
      name: `${p.name} (kopya)`,
      slug: `${p.slug}-kopya`,
      featured: false,
    });
  };

  const openNew = () => setEditing({
    active: true, duration: "monthly", delivery_type: "key",
    price_try: 0, manual_fulfillment: false, featured: false,
    unlimited_stock: false, sort_order: 0, tier: "standard",
  });

  return (
    <div>
      {/* HEADER + STATS */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl neon-text">Ürünler</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <Stat label="toplam" value={stats.total} tone="cyan" icon={<Package className="h-3 w-3" />} />
            <Stat label="aktif" value={stats.active} tone="primary" />
            <Stat label="öne çıkan" value={stats.featured} tone="warn" icon={<Star className="h-3 w-3" />} />
            <Stat label="destansı" value={stats.epic} tone="epic" icon={<Crown className="h-3 w-3" />} />
            {stats.low > 0 && <Stat label="düşük stok" value={stats.low} tone="warn" icon={<AlertTriangle className="h-3 w-3" />} />}
            {stats.empty > 0 && <Stat label="tükendi" value={stats.empty} tone="destructive" icon={<AlertTriangle className="h-3 w-3" />} />}
          </div>
        </div>
        <Button onClick={openNew} className="font-mono" size="sm">
          <Plus className="h-4 w-4 mr-1" />yeni ürün
        </Button>
      </div>

      {/* SEARCH + FILTERS */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ad, slug veya kategori ara…"
            className="pl-7 pr-7 h-9 font-mono text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label="temizle"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "active", "inactive", "featured", "epic", "low", "empty"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-mono text-[11px] rounded-full px-2.5 py-1 border transition-colors ${
                filter === f
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {f === "all" ? "tümü" : f === "active" ? "aktif" : f === "inactive" ? "pasif"
                : f === "featured" ? "⭐ öne çıkan" : f === "epic" ? "👑 destansı"
                : f === "low" ? "⚠ düşük" : "✕ tükendi"}
            </button>
          ))}
        </div>
      </div>

      {/* PRODUCT LIST */}
      <div className="mt-4 space-y-2">
        {visible.length === 0 && (
          <div className="text-center text-muted-foreground font-mono py-10 border border-dashed border-border/60 rounded-lg">
            eşleşen ürün yok
          </div>
        )}
        {visible.map((raw) => {
          const p = raw as Product & { license_keys: { status: string }[] };
          const avail = (p.license_keys ?? []).filter((k) => k.status === "available").length;
          const total = (p.license_keys ?? []).length;
          const shown = avail > 0 ? avail : (p.stock_hint ?? 0);
          const pct = total ? Math.round((avail / total) * 100) : (p.stock_hint ? Math.min(100, p.stock_hint * 10) : 0);
          const state: "unlimited" | "manual" | "empty" | "low" | "ok" =
            p.unlimited_stock ? "unlimited"
            : p.manual_fulfillment ? "manual"
            : (total > 0 && avail === 0) ? "empty"
            : (shown > 0 && shown < 3) ? "low"
            : "ok";
          return (
            <div key={p.id} className={`glass-card rounded-lg p-3 sm:p-4 font-mono text-sm border ${
              !p.active ? "opacity-60" : ""
            } ${
              state === "empty" ? "border-destructive/40" : state === "low" ? "border-warn/40" : "border-border/60"
            } ${p.tier === "epic" ? "!border-transparent epic-card" : ""}`}>
              <div className="flex gap-3 sm:gap-4 items-start">
                {/* thumbnail */}
                <div className="shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-md border border-border/50 bg-black/40 overflow-hidden flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </div>

                {/* main */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.tier === "epic" && <Crown className="h-3 w-3 text-[oklch(0.85_0.15_75)] shrink-0" />}
                    {p.featured && <Star className="h-3 w-3 text-warn fill-warn shrink-0" />}
                    <span className={`font-semibold truncate ${p.tier === "epic" ? "epic-text-glow text-[oklch(0.92_0.14_85)]" : ""}`}>
                      {p.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">/{p.slug}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>{p.category ?? "—"}</span>
                    <span>·</span>
                    <span>{p.duration}</span>
                    <span>·</span>
                    <span className="text-primary/90">₺{Number(p.price_try).toLocaleString("tr-TR")}</span>
                    <span>·</span>
                    <span>{DELIVERY_LABELS[(p.delivery_type ?? "key") as DeliveryType]}</span>
                    {p.manual_fulfillment && <><span>·</span><span className="text-warn">manuel</span></>}
                  </div>

                  {/* stock bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden max-w-[240px]">
                      <div
                        className={`h-full transition-all ${
                          state === "unlimited" || state === "manual" ? "bg-cyan"
                          : state === "empty" ? "bg-destructive"
                          : state === "low" ? "bg-warn"
                          : "bg-primary"
                        }`}
                        style={{ width: state === "unlimited" || state === "manual" ? "100%" : `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[11px] shrink-0 ${
                      state === "empty" ? "text-destructive"
                      : state === "low" ? "text-warn"
                      : state === "unlimited" ? "text-cyan"
                      : "text-muted-foreground"
                    }`}>
                      {state === "unlimited" ? "∞ sınırsız"
                      : state === "manual" ? "manuel"
                      : `${avail}/${total}${p.stock_hint != null ? ` · hint:${p.stock_hint}` : ""}`}
                    </span>
                  </div>
                </div>

                {/* actions */}
                <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                  <Button
                    size="sm" variant="outline" title={p.active ? "pasif yap" : "aktif yap"}
                    onClick={() => quickToggle(p, { active: !p.active })}
                    className="h-8 w-8 p-0"
                  >
                    {p.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                  <Button
                    size="sm" variant="outline" title="öne çıkan"
                    onClick={() => quickToggle(p, { featured: !p.featured })}
                    className="h-8 w-8 p-0"
                  >
                    <Star className={`h-3.5 w-3.5 ${p.featured ? "text-warn fill-warn" : "text-muted-foreground"}`} />
                  </Button>
                  <Button size="sm" variant="outline" title="kopyala" onClick={() => duplicate(p)} className="h-8 w-8 p-0">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" title="düzenle" onClick={() => setEditing(p)} className="h-8 w-8 p-0">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
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
            </div>
          );
        })}
      </div>

      {/* EDIT DIALOG */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <span className="text-primary">$</span>
              {editing?.id ? "urun düzenle" : "yeni urun"}
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              {/* SECTION: BASICS */}
              <Section title="temel bilgiler">
                <Field
                  label="ad"
                  value={editing.name ?? ""}
                  onChange={(v) => setEditing((p) => ({
                    ...p!,
                    name: v,
                    // auto-slug only when creating and slug is empty or was auto-derived
                    slug: !p!.id && (!p!.slug || p!.slug === slugify(p!.name ?? "")) ? slugify(v) : p!.slug,
                  }))}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="slug (a-z, 0-9, -)" value={editing.slug ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, slug: slugify(v) }))} />
                  <Field label="kategori" value={editing.category ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, category: v }))} />
                </div>
                <div>
                  <Label className="font-mono text-xs">açıklama</Label>
                  <Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, description: e.target.value }))} className="font-mono" />
                </div>
              </Section>

              {/* SECTION: IMAGE */}
              <Section title="görsel">
                <div className="flex gap-3 items-start">
                  <div className="shrink-0 h-20 w-20 rounded-md border border-border/60 bg-black/40 overflow-hidden flex items-center justify-center">
                    {editing.image_url ? (
                      <img src={editing.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label className="font-mono text-xs">image_url (https://… veya /products/…jpg)</Label>
                    <Input
                      value={editing.image_url ?? ""}
                      onChange={(e) => setEditing((p) => ({ ...p!, image_url: e.target.value }))}
                      className="font-mono text-xs"
                      placeholder="https://…"
                    />
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">boş bırakılırsa varsayılan anahtar ikonu gösterilir</p>
                  </div>
                </div>
              </Section>

              {/* SECTION: PRICING & DELIVERY */}
              <Section title="fiyat & teslim">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="font-mono text-xs">süre</Label>
                    <select
                      value={editing.duration ?? "monthly"}
                      onChange={(e) => setEditing((p) => ({ ...p!, duration: e.target.value as Product["duration"] }))}
                      className="w-full h-9 rounded border border-border bg-input px-3 font-mono text-sm"
                    >
                      <option value="monthly">aylık</option>
                      <option value="yearly">yıllık</option>
                      <option value="lifetime">ömürlük</option>
                    </select>
                  </div>
                  <Field label="fiyat (₺)" value={String(editing.price_try ?? 0)} onChange={(v) => setEditing((p) => ({ ...p!, price_try: Number(v) }))} type="number" />
                  <div>
                    <Label className="font-mono text-xs">teslim tipi</Label>
                    <select
                      value={editing.delivery_type ?? "key"}
                      onChange={(e) => setEditing((p) => ({ ...p!, delivery_type: e.target.value as DeliveryType }))}
                      className="w-full h-9 rounded border border-border bg-input px-3 font-mono text-sm"
                    >
                      {(Object.keys(DELIVERY_LABELS) as DeliveryType[]).map((k) => (
                        <option key={k} value={k}>{DELIVERY_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {editing.delivery_type === "account" && "havuza her satıra 'email:sifre' formatında ekle"}
                  {editing.delivery_type === "link" && "havuza her satıra bir URL ekle"}
                  {editing.delivery_type === "link_token" && "havuza payload metnini ekle; sistem her sipariş için /aktivasyon/{token} üretecek"}
                  {(!editing.delivery_type || editing.delivery_type === "key") && "havuza her satıra bir lisans anahtarı ekle"}
                </p>
              </Section>

              {/* SECTION: STOCK & VISIBILITY */}
              <Section title="stok & görünürlük">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="stok ipucu (havuz boşsa/manuelde gösterilir)"
                    value={editing.stock_hint == null ? "" : String(editing.stock_hint)}
                    onChange={(v) => setEditing((p) => ({ ...p!, stock_hint: v === "" ? null : Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="sıra (yüksek = üstte)"
                    value={String(editing.sort_order ?? 0)}
                    onChange={(v) => setEditing((p) => ({ ...p!, sort_order: Number(v) || 0 }))}
                    type="number"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Toggle checked={editing.active ?? true} onChange={(v) => setEditing((p) => ({ ...p!, active: v }))} label="aktif" />
                  <Toggle checked={editing.manual_fulfillment ?? false} onChange={(v) => setEditing((p) => ({ ...p!, manual_fulfillment: v }))} label="manuel teslimat" />
                  <Toggle checked={editing.featured ?? false} onChange={(v) => setEditing((p) => ({ ...p!, featured: v }))} label="öne çıkan ⭐" />
                  <Toggle checked={editing.unlimited_stock ?? false} onChange={(v) => setEditing((p) => ({ ...p!, unlimited_stock: v }))} label="sınırsız stok ∞" />
                </div>
                <div>
                  <Label className="font-mono text-xs">seviye</Label>
                  <select
                    value={editing.tier ?? "standard"}
                    onChange={(e) => setEditing((p) => ({ ...p!, tier: e.target.value as "standard" | "epic" }))}
                    className="w-full h-9 rounded border border-border bg-input px-3 font-mono text-sm"
                  >
                    <option value="standard">standart</option>
                    <option value="epic">★ destansı (özel tema)</option>
                  </select>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                  "öne çıkan" → ana sayfada Popüler Lisanslar'da<br />
                  "sıra" → büyük değer üstte listelenir<br />
                  "destansı" → altın/mor cyber tema ve önce sıralanır
                </p>
              </Section>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} className="font-mono">vazgeç</Button>
            <Button onClick={save} className="font-mono">kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/30 p-3 sm:p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary/80 mb-3">
        # {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 font-mono text-sm cursor-pointer select-none">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function Stat({ label, value, tone, icon }: {
  label: string;
  value: number;
  tone: "primary" | "cyan" | "warn" | "destructive" | "epic";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "primary" ? "border-primary/30 bg-primary/5 text-primary"
    : tone === "cyan" ? "border-cyan/30 bg-cyan/5 text-cyan"
    : tone === "warn" ? "border-warn/40 bg-warn/10 text-warn"
    : tone === "destructive" ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-[oklch(0.78_0.16_75/0.4)] bg-[oklch(0.14_0.03_75/0.4)] text-[oklch(0.9_0.14_85)]";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${toneClass}`}>
      {icon}
      <span className="opacity-80">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
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
