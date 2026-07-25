import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
import { Plus, Pencil, Trash2, Star, Search, X, Package, AlertTriangle, Crown, Copy, ImageIcon, EyeOff, Eye, Wand2, Sparkles, CheckSquare, Square, Percent } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isLegacyClearbitLogo, resolveLogoUrl } from "@/lib/logo-resolver";
import { ProductLogo } from "@/components/ProductLogo";

export const Route = createFileRoute("/_authenticated/admin/urunler")({
  validateSearch: (s: Record<string, unknown>) => z.object({ edit: z.string().uuid().optional() }).parse(s),
  component: ProductsAdmin,
});

type DeliveryType = "key" | "account" | "link" | "link_token";
const DELIVERY_LABELS: Record<DeliveryType, string> = {
  key: "text key",
  account: "mail hesabı (email:şifre)",
  link: "hazır link",
  link_token: "aktivasyon linki (token)",
};

const CATEGORY_OPTIONS: string[] = [
  "ChatGPT", "Google Gemini", "Lovable", "Claude", "Nano Banana", "Midjourney", "Ideogram", "Yapay Zeka",
  "Adobe", "Envato Elements", "Freepik", "Canva", "Vecteezy", "Flaticon", "Motion Array",
  "CorelDRAW", "Autodesk", "Görsel Ürünler",
  "Office", "Office 365",
  "Windows", "Windows 10/11", "Windows Server",
  "Wordpress Eklentileri & Temaları",
  "Seo Araçları",
  "Vpn & Antivirüs",
  "Steam Oyunları",
  "Email Hesapları",
  "Diğer",
];

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration: "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "lifetime";
  delivery_type: DeliveryType;
  price_try: number;
  cost_try: number | null;
  active: boolean;
  category: string | null;
  manual_fulfillment: boolean;
  stock_hint: number | null;
  low_stock_threshold: number;
  featured: boolean;
  unlimited_stock: boolean;
  sort_order: number;
  tier: "standard" | "epic";
  image_url: string | null;
  shopier_url: string | null;
  requires_email: boolean;
  retail_price_try: number | null;
  retail_price_source_url: string | null;
  duration_label: string | null;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const upsertFn = useServerFn(upsertProduct);
  const deleteFn = useServerFn(deleteProduct);
  
  const [aiBusy, setAiBusy] = useState(false);
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  // ?edit=<uuid> ile gelindiğinde ilgili ürünün düzenleme diyaloğunu otomatik aç.
  useEffect(() => {
    if (!searchParams.edit || !products) return;
    const target = (products as Product[]).find((p) => p.id === searchParams.edit);
    if (target) {
      setEditing(target);
      navigate({ search: {} as never, replace: true });
    }
  }, [searchParams.edit, products, navigate]);

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
    return ((products ?? []) as unknown as Array<Product & { license_keys: { status: string }[] }>).filter((p) => {
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
          cost_try: editing.cost_try == null || Number.isNaN(Number(editing.cost_try)) ? null : Number(editing.cost_try),
          active: editing.active ?? true,
          category: editing.category ?? null,
          manual_fulfillment: editing.manual_fulfillment ?? false,
          stock_hint: editing.stock_hint == null ? null : Number(editing.stock_hint),
          low_stock_threshold: Number(editing.low_stock_threshold ?? 5),
          featured: editing.featured ?? false,
          unlimited_stock: editing.unlimited_stock ?? false,
          sort_order: Number(editing.sort_order ?? 0),
          tier: (editing.tier ?? "standard") as "standard" | "epic",
          image_url: editing.image_url && editing.image_url.trim() !== "" ? editing.image_url : null,
          shopier_url: editing.shopier_url && editing.shopier_url.trim() !== "" ? editing.shopier_url : null,
          requires_email: editing.requires_email ?? false,
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
          cost_try: p.cost_try == null ? null : Number(p.cost_try),
          active: patch.active ?? p.active,
          category: p.category ?? null,
          manual_fulfillment: p.manual_fulfillment,
          stock_hint: p.stock_hint,
          low_stock_threshold: p.low_stock_threshold ?? 5,
          featured: patch.featured ?? p.featured,
          unlimited_stock: p.unlimited_stock,
          sort_order: Number(p.sort_order ?? 0),
          tier: p.tier,
          image_url: p.image_url && p.image_url.trim() !== "" ? p.image_url : null,
          shopier_url: p.shopier_url && p.shopier_url.trim() !== "" ? p.shopier_url : null,
          requires_email: p.requires_email,
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
    low_stock_threshold: 5,
  });

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const selectAllVisible = () => {
    const ids = visible.map((p) => p.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(ids));
  };
  const clearSel = () => setSelected(new Set());

  const bulkUpdate = async (patch: Partial<Product>, label: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase.from("products").update(patch).in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} ürün: ${label}`);
      clearSel();
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBulkBusy(false); }
  };

  const bulkPricePercent = async () => {
    const raw = prompt("Yüzde değişim (örn +10 = %10 zam, -5 = %5 indirim):");
    if (!raw) return;
    const pct = Number(raw.replace(",", "."));
    if (!Number.isFinite(pct) || pct === 0) { toast.error("Geçersiz yüzde"); return; }
    const ids = Array.from(selected);
    setBulkBusy(true);
    try {
      const list = (products ?? []) as Product[];
      let ok = 0, fail = 0;
      for (const p of list.filter((p) => ids.includes(p.id))) {
        const next = Math.max(1, Math.round(Number(p.price_try) * (1 + pct / 100)));
        const { error } = await supabase.from("products").update({ price_try: next }).eq("id", p.id);
        if (error) fail++; else ok++;
      }
      toast.success(`${ok} ürün güncellendi${fail ? `, ${fail} atlandı (min kar kuralı olabilir)` : ""}`);
      clearSel();
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBulkBusy(false); }
  };

  const bulkCategory = async () => {
    const cat = prompt("Yeni kategori adı (boş bırakırsan temizlenir):", "");
    if (cat === null) return;
    await bulkUpdate({ category: cat.trim() === "" ? null : cat.trim() }, `kategori → ${cat || "—"}`);
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} ürünü ve bağlı tüm keyleri silmek istediğine emin misin?`)) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} ürün silindi`);
      clearSel();
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBulkBusy(false); }
  };




  const saveRetailManual = async () => {
    if (!editing?.id) { toast.error("Önce ürünü kaydet."); return; }
    setAiBusy(true);
    try {
      const { error } = await supabase.from("products").update({
        retail_price_try: editing.retail_price_try ?? null,
        retail_price_source_url: editing.retail_price_source_url ?? null,
        duration_label: editing.duration_label ?? null,
        retail_price_updated_at: new Date().toISOString(),
      }).eq("id", editing.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Orijinal fiyat kaydedildi.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setAiBusy(false); }
  };

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono"
            onClick={async () => {
              const list = (products ?? []) as Array<{ id: string; name: string; image_url: string | null }>;
              const missing = list.filter((p) => !p.image_url || p.image_url.trim() === "" || isLegacyClearbitLogo(p.image_url));
              if (missing.length === 0) {
                toast.info("Tüm ürünlerde logo mevcut.");
                return;
              }
              let filled = 0;
              for (const p of missing) {
                  const url = resolveLogoUrl(p.name);
                if (!url) continue;
                const { error } = await supabase.from("products").update({ image_url: url }).eq("id", p.id);
                if (!error) filled++;
              }
              await qc.invalidateQueries({ queryKey: ["admin-products"] });
              toast.success(`${filled}/${missing.length} ürüne logo eklendi.`);
            }}
          >
            <Sparkles className="h-4 w-4 mr-1" />eksik logoları doldur
          </Button>
          <Button onClick={openNew} className="font-mono" size="sm">
            <Plus className="h-4 w-4 mr-1" />yeni ürün
          </Button>
        </div>

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

      {/* BULK TOOLBAR */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-xs">
        <button
          onClick={selectAllVisible}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {visible.length > 0 && visible.every((p) => selected.has(p.id))
            ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
            : <Square className="h-3.5 w-3.5" />}
          <span>görünenleri seç ({visible.length})</span>
        </button>
        {selected.size > 0 ? (
          <>
            <span className="text-primary">· {selected.size} seçildi</span>
            <div className="flex flex-wrap gap-1.5 ml-auto">
              <BulkBtn onClick={() => bulkUpdate({ active: true }, "aktif")} busy={bulkBusy}><Eye className="h-3 w-3 mr-1" />aktif</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ active: false }, "pasif")} busy={bulkBusy}><EyeOff className="h-3 w-3 mr-1" />pasif</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ manual_fulfillment: true }, "manuel teslim")} busy={bulkBusy}>manuel aç</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ manual_fulfillment: false }, "otomatik teslim")} busy={bulkBusy}>manuel kapat</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ featured: true }, "öne çıkan")} busy={bulkBusy}><Star className="h-3 w-3 mr-1" />öne çıkar</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ featured: false }, "öne çıkarma kaldırıldı")} busy={bulkBusy}>featured kapat</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ unlimited_stock: true }, "∞ stok")} busy={bulkBusy}>∞ stok</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ unlimited_stock: false }, "stok normal")} busy={bulkBusy}>∞ kapat</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ tier: "epic" }, "destansı")} busy={bulkBusy}><Crown className="h-3 w-3 mr-1" />epic</BulkBtn>
              <BulkBtn onClick={() => bulkUpdate({ tier: "standard" }, "standart")} busy={bulkBusy}>standart</BulkBtn>
              <BulkBtn onClick={bulkCategory} busy={bulkBusy}>kategori…</BulkBtn>
              <BulkBtn onClick={bulkPricePercent} busy={bulkBusy}><Percent className="h-3 w-3 mr-1" />fiyat %…</BulkBtn>
              
              <BulkBtn onClick={bulkDelete} busy={bulkBusy} danger><Trash2 className="h-3 w-3 mr-1" />sil</BulkBtn>
              <BulkBtn onClick={clearSel} busy={bulkBusy}>×</BulkBtn>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">satırlardaki kutucukları işaretle → toplu işlem çıkacak</span>
        )}
      </div>

      {/* PRODUCT LIST */}
      <div className="mt-3 space-y-2">
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
                <div className="pt-1">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggleSel(p.id)}
                    aria-label="seç"
                  />
                </div>
                {/* thumbnail */}
                <ProductLogo
                  name={p.name}
                  src={p.image_url}
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-md border border-border/50 bg-background/60"
                  imgClassName="h-full w-full object-contain p-2"
                  fallback={<ImageIcon className="h-5 w-5 text-muted-foreground/50" />}
                />


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
                    <span className="text-warn/90" title="maliyet">mal ₺{Number(p.cost_try ?? 0).toLocaleString("tr-TR")}</span>
                    {Number(p.cost_try ?? 0) > 0 && (
                      <>
                        <span>·</span>
                        <span className={Number(p.price_try) - Number(p.cost_try ?? 0) >= 200 ? "text-primary" : "text-destructive"} title="kar">
                          kar ₺{(Number(p.price_try) - Number(p.cost_try ?? 0)).toLocaleString("tr-TR")}
                        </span>
                      </>
                    )}
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
                    // yeni ürün + image_url boşsa marka logosunu tahmin edip doldur
                    image_url: !p!.id && !p!.image_url ? (resolveLogoUrl(v) ?? p!.image_url ?? null) : p!.image_url,
                  }))}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="slug (a-z, 0-9, -)" value={editing.slug ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, slug: slugify(v) }))} />
                  <div>
                    <Label className="font-mono text-xs">kategori</Label>
                    <Input
                      list="urun-kategori-list"
                      value={editing.category ?? ""}
                      onChange={(e) => setEditing((p) => ({ ...p!, category: e.target.value }))}
                      className="font-mono"
                      placeholder="listeden seç veya yaz"
                    />
                    <datalist id="urun-kategori-list">
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div>
                  <Label className="font-mono text-xs">açıklama</Label>
                  <Textarea rows={3} value={editing.description ?? ""} onChange={(e) => setEditing((p) => ({ ...p!, description: e.target.value }))} className="font-mono" />
                </div>
              </Section>

              {/* SECTION: IMAGE */}
              <Section title="görsel">
                <div className="flex gap-3 items-start">
                  <ProductLogo
                    name={editing.name ?? ""}
                    src={editing.image_url}
                    className="h-20 w-20 rounded-md border border-border/60 bg-background/60"
                    imgClassName="h-full w-full object-contain p-2"
                    fallback={<ImageIcon className="h-6 w-6 text-muted-foreground/50" />}
                  />
                  <div className="flex-1 min-w-0">
                    <Label className="font-mono text-xs">image_url (https://… veya /products/…jpg)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={editing.image_url ?? ""}
                        onChange={(e) => setEditing((p) => ({ ...p!, image_url: e.target.value }))}
                        className="font-mono text-xs"
                        placeholder="https://…"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs shrink-0"
                        onClick={() => {
                          const url = resolveLogoUrl(editing.name ?? "");
                          if (!url) {
                            toast.error("Marka tahmin edilemedi — önce ürün adını gir.");
                            return;
                          }
                          setEditing((p) => ({ ...p!, image_url: url }));
                          toast.success("Logo bulundu.");
                        }}
                      >
                        <Wand2 className="h-3.5 w-3.5 mr-1" />logo bul
                      </Button>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      ad girildiğinde marka logosu otomatik doldurulur; bozuk eski logo linkleri güvenilir favicon kaynağına düşer.
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="font-mono text-xs">shopier_url (bu ürünün Shopier ödeme sayfası)</Label>
                  <Input
                    value={editing.shopier_url ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p!, shopier_url: e.target.value }))}
                    className="font-mono text-xs"
                    placeholder="https://www.shopier.com/…"
                  />
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Doluysa ödeme sayfasında "Shopier ile Öde" butonu görünür. Ödeme tamamlanınca webhook siparişi otomatik onaylar.
                  </p>
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
                      <option value="hourly">saatlik</option>
                      <option value="daily">günlük</option>
                      <option value="weekly">haftalık</option>
                      <option value="monthly">aylık</option>
                      <option value="yearly">yıllık</option>
                      <option value="lifetime">sınırsız</option>
                    </select>
                  </div>
                  <Field label="fiyat (₺)" value={editing.price_try == null ? "" : String(editing.price_try)} onChange={(v) => setEditing((p) => ({ ...p!, price_try: v === "" ? 0 : Number(v) }))} type="number" />
                  <Field label="maliyet (₺) — ciro/kar hesabı için" value={editing.cost_try == null ? "" : String(editing.cost_try)} onChange={(v) => setEditing((p) => ({ ...p!, cost_try: v === "" ? null : Number(v) }))} type="number" />
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

              {/* SECTION: RETAIL PRICE (orijinal satıcı fiyatı) */}
              <Section title="orijinal fiyat (resmi satıcı)">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs"
                    onClick={findRetailForEditing}
                    disabled={aiBusy || !editing.id}
                    title={!editing.id ? "Önce ürünü kaydet" : "AI ile ara"}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {aiBusy ? "aranıyor…" : "AI ile orijinal fiyatı bul"}
                  </Button>
                  {!editing.id && (
                    <span className="font-mono text-[10px] text-warn">önce kaydet, sonra AI ile ara</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field
                    label="orijinal fiyat (₺)"
                    value={editing.retail_price_try == null ? "" : String(editing.retail_price_try)}
                    onChange={(v) => setEditing((p) => ({ ...p!, retail_price_try: v === "" ? null : Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="süre etiketi (1 yıl, ömür boyu…)"
                    value={editing.duration_label ?? ""}
                    onChange={(v) => setEditing((p) => ({ ...p!, duration_label: v }))}
                  />
                  <Field
                    label="kaynak URL"
                    value={editing.retail_price_source_url ?? ""}
                    onChange={(v) => setEditing((p) => ({ ...p!, retail_price_source_url: v }))}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs"
                    onClick={saveRetailManual}
                    disabled={aiBusy || !editing.id}
                  >
                    manuel değerleri kaydet
                  </Button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Bu değer müşteriye üstü çizili "resmi fiyat" olarak gösterilir; satış fiyatından yüksek olmalı.
                </p>
              </Section>


              {/* SECTION: STOCK & VISIBILITY */}
              <Section title="stok & görünürlük">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field
                    label="stok ipucu (havuz boşsa/manuelde gösterilir)"
                    value={editing.stock_hint == null ? "" : String(editing.stock_hint)}
                    onChange={(v) => setEditing((p) => ({ ...p!, stock_hint: v === "" ? null : Number(v) }))}
                    type="number"
                  />
                  <Field
                    label="düşük stok eşiği (uyarı için)"
                    value={String(editing.low_stock_threshold ?? 5)}
                    onChange={(v) => setEditing((p) => ({ ...p!, low_stock_threshold: v === "" ? 0 : Number(v) }))}
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
                  <Toggle checked={editing.requires_email ?? false} onChange={(v) => setEditing((p) => ({ ...p!, requires_email: v }))} label="mail tanımlı lisans ✉" />
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

function BulkBtn({ children, onClick, busy, danger }: { children: React.ReactNode; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center rounded border px-2 py-1 text-[11px] font-mono transition-colors disabled:opacity-40 ${
        danger
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border/60 bg-background/60 hover:border-primary/50 hover:text-primary"
      }`}
    >
      {children}
    </button>
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
  const [local, setLocal] = useState<string | null>(null);
  const shown = local ?? value;
  return (
    <div>
      <Label className="font-mono text-xs">{label}</Label>
      <Input
        type={type}
        value={shown}
        onFocus={() => setLocal(value)}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={() => setLocal(null)}
        className="font-mono"
      />
    </div>
  );
}
