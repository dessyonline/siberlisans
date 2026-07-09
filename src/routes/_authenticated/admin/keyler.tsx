import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { importLicenseKeys } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle2, Database, Package, Search, X, FileUp, UserCheck, Copy, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/keyler")({
  component: KeysAdmin,
});

type DeliveryType = "key" | "account" | "link" | "link_token";
const DELIVERY_HINTS: Record<DeliveryType, { title: string; placeholder: string; help: string }> = {
  key: { title: "Lisans anahtarları", placeholder: "XXXX-XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY-YYYY", help: "her satıra bir anahtar" },
  account: { title: "Hesap bilgileri", placeholder: "kullanici1@mail.com:sifre1\nkullanici2@mail.com:sifre2", help: "her satıra 'email:şifre'" },
  link: { title: "Aktivasyon linkleri", placeholder: "https://ornek.com/davet/abc\nhttps://ornek.com/davet/xyz", help: "her satıra bir URL" },
  link_token: { title: "Token payload'ları", placeholder: "PAYLOAD-1\nPAYLOAD-2", help: "her satıra bir metin. Müşteriye /aktivasyon/{token} linki gösterilir." },
};

type PoolRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  price_try: number;
  delivery_type: DeliveryType;
  license_keys: { status: string }[];
};

function KeysAdmin() {
  const qc = useQueryClient();
  const importFn = useServerFn(importLicenseKeys);
  const [productId, setProductId] = useState("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products", "for-keys"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, delivery_type").order("name");
      return data;
    },
  });

  const currentProduct = (products ?? []).find((p) => p.id === productId);
  const currentDT = (currentProduct?.delivery_type ?? "key") as DeliveryType;
  const hint = DELIVERY_HINTS[currentDT];

  const { data: pool } = useQuery({
    queryKey: ["admin-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, active, price_try, delivery_type, license_keys(status)")
        .order("name");
      if (error) throw error;
      return data as PoolRow[];
    },
    refetchInterval: 15000,
  });

  const totals = useMemo(() => {
    let avail = 0, assigned = 0, total = 0;
    (pool ?? []).forEach((p) => {
      p.license_keys.forEach((k) => {
        total++;
        if (k.status === "available") avail++;
        else if (k.status === "assigned") assigned++;
      });
    });
    return { avail, assigned, total };
  }, [pool]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "assigned" | "revoked">("all");

  const { data: keys } = useQuery({
    queryKey: ["license-keys-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_keys")
        .select("id, key_value, status, created_at, product_id, product:products(name, slug)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Array<{
        id: string;
        key_value: string;
        status: string;
        created_at: string;
        product_id: string;
        product: { name: string; slug: string } | null;
      }>;
    },
    refetchInterval: 15000,
  });

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (keys ?? []).filter((k) => {
      if (productId && k.product_id !== productId) return false;
      if (statusFilter !== "all" && k.status !== statusFilter) return false;
      if (!q) return true;
      return (
        k.key_value.toLowerCase().includes(q) ||
        (k.product?.name ?? "").toLowerCase().includes(q) ||
        (k.product?.slug ?? "").toLowerCase().includes(q)
      );
    });
  }, [keys, search, statusFilter, productId]);

  const { data: assignedKeys } = useQuery({
    queryKey: ["admin-assigned-keys"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_assigned_keys", { _limit: 200 });
      if (error) throw error;
      return (data ?? []) as Array<{
        key_id: string;
        key_value: string;
        product_id: string;
        product_name: string | null;
        order_id: string | null;
        reference_code: string | null;
        order_status: string | null;
        user_email: string | null;
        assigned_at: string | null;
        activated_at: string | null;
        expires_at: string | null;
        revoked: boolean;
      }>;
    },
    refetchInterval: 30000,
  });

  const [assignedSearch, setAssignedSearch] = useState("");
  const filteredAssigned = useMemo(() => {
    const q = assignedSearch.trim().toLowerCase();
    return (assignedKeys ?? []).filter((r) => {
      if (productId && r.product_id !== productId) return false;
      if (!q) return true;
      return (
        r.key_value.toLowerCase().includes(q) ||
        (r.reference_code ?? "").toLowerCase().includes(q) ||
        (r.user_email ?? "").toLowerCase().includes(q) ||
        (r.product_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [assignedKeys, assignedSearch, productId]);

  const doImport = async () => {
    if (!productId) return toast.error("Ürün seçin");
    const list = raw.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return toast.error("En az bir key girin");
    setBusy(true);
    try {
      const r = await importFn({ data: { productId, keys: list } });
      if (r.inserted === 0) {
        toast.error(
          `Hiç key eklenmedi. Girdiğin ${list.length} satır sistemde zaten mevcut (muhtemelen daha önce satılmış / atanmış). Farklı bir email:şifre veya key ekleyin.`,
          { duration: 8000 },
        );
      } else if (r.inserted < list.length) {
        toast.success(`${r.inserted}/${list.length} key eklendi — ${list.length - r.inserted} tanesi zaten kayıtlıydı.`);
        setRaw("");
      } else {
        toast.success(`${r.inserted} key eklendi ✓`);
        setRaw("");
      }
      qc.invalidateQueries({ queryKey: ["license-keys-recent"] });
      qc.invalidateQueries({ queryKey: ["admin-pool"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-xl sm:text-2xl neon-text">Key Havuzu</h1>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
            <CheckCircle2 className="inline h-3 w-3 mr-1" />müsait {totals.avail}
          </span>
          <span className="rounded border border-border/60 bg-muted/20 px-2 py-1 text-muted-foreground">
            atanmış {totals.assigned}
          </span>
          <span className="rounded border border-cyan/30 bg-cyan/5 px-2 py-1 text-cyan">
            <Database className="inline h-3 w-3 mr-1" />toplam {totals.total}
          </span>
        </div>
      </div>

      {/* SON EKLENEN LİSANSLAR + ARAMA (mobil öncelikli) */}
      <div className="mt-5 glass-card rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="font-mono text-sm">
            <span className="text-muted-foreground">$ </span>
            <span className="neon-text">son eklenen lisanslar</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({filteredKeys.length}/{(keys ?? []).length})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="key veya ürün ara…"
                className="pl-7 pr-7 h-8 w-full sm:w-56 font-mono text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-8 rounded border border-border bg-input px-2 font-mono text-xs"
            >
              <option value="all">tümü</option>
              <option value="available">müsait</option>
              <option value="assigned">atanmış</option>
              <option value="revoked">iptal</option>
            </select>
            {productId && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 font-mono text-xs"
                onClick={() => setProductId("")}
              >
                <X className="h-3 w-3 mr-1" />ürün filtresi
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1 max-h-[500px] overflow-auto">
          {filteredKeys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-3 font-mono text-xs border-b border-border/40 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <code className="break-all">{k.key_value}</code>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {k.product?.name ?? "—"} ·{" "}
                  {new Date(k.created_at).toLocaleString("tr-TR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <span
                className={
                  k.status === "available"
                    ? "text-primary shrink-0"
                    : k.status === "assigned"
                    ? "text-muted-foreground shrink-0"
                    : "text-destructive shrink-0"
                }
              >
                {k.status === "available"
                  ? "müsait"
                  : k.status === "assigned"
                  ? "atanmış"
                  : "iptal"}
              </span>
            </div>
          ))}
          {filteredKeys.length === 0 && (
            <div className="text-center text-muted-foreground font-mono py-6">
              {search || statusFilter !== "all" || productId
                ? "eşleşen key yok"
                : "henüz eklenmiş key yok"}
            </div>
          )}
        </div>
      </div>

      {/* ATANMIŞ KEYLER */}
      <div className="mt-5 glass-card rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="font-mono text-sm">
            <span className="text-muted-foreground">$ </span>
            <span className="neon-text">atanmış keyler</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({filteredAssigned.length}/{(assignedKeys ?? []).length})
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={assignedSearch}
              onChange={(e) => setAssignedSearch(e.target.value)}
              placeholder="key / ref / email / ürün…"
              className="pl-7 pr-7 h-8 font-mono text-xs"
            />
            {assignedSearch && (
              <button onClick={() => setAssignedSearch("")} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1 max-h-[500px] overflow-auto">
          {filteredAssigned.map((r) => (
            <div key={r.key_id} className="grid grid-cols-[1fr_auto] gap-2 items-center border-b border-border/40 py-1.5 font-mono text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <UserCheck className="h-3 w-3 text-cyan shrink-0" />
                  <code className="break-all truncate">{r.key_value}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(r.key_value); toast.success("Key kopyalandı"); }}
                    className="text-muted-foreground hover:text-primary shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{r.product_name ?? "—"}</span>
                  {r.reference_code && (
                    <Link
                      to="/admin/siparisler"
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      {r.reference_code} <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  )}
                  {r.user_email && <span>· {r.user_email}</span>}
                  {r.assigned_at && (
                    <span>
                      · {new Date(r.assigned_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                {r.revoked ? (
                  <span className="text-destructive">iptal</span>
                ) : r.activated_at ? (
                  <span className="text-primary">aktive</span>
                ) : (
                  <span className="text-muted-foreground">bekliyor</span>
                )}
                {r.expires_at && (
                  <div className="text-[10px] text-muted-foreground">
                    bitiş {new Date(r.expires_at).toLocaleDateString("tr-TR")}
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredAssigned.length === 0 && (
            <div className="text-center text-muted-foreground font-mono py-6">
              {assignedSearch || productId ? "eşleşen atanmış key yok" : "henüz atanmış key yok"}
            </div>
          )}
        </div>
      </div>


      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(pool ?? []).map((p) => {
          const avail = p.license_keys.filter((k) => k.status === "available").length;
          const assigned = p.license_keys.filter((k) => k.status === "assigned").length;
          const total = p.license_keys.length;
          const pct = total ? Math.round((avail / total) * 100) : 0;
          const low = avail === 0 ? "empty" : avail < 3 ? "low" : "ok";
          return (
            <button
              key={p.id}
              onClick={() => setProductId(p.id)}
              className={`text-left glass-card rounded-lg p-4 transition-all hover:border-primary/60 hover:neon-glow ${
                productId === p.id ? "border-primary/60 neon-glow" : ""
              } ${low === "empty" ? "border-destructive/40" : low === "low" ? "border-warn/40" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{p.name}</span>
                </div>
                {low === "empty" && <AlertTriangle className="h-4 w-4 text-destructive" />}
                {low === "low" && <AlertTriangle className="h-4 w-4 text-warn" />}
              </div>
              <div className="mt-3 flex items-end gap-3 font-mono">
                <div>
                  <div className={`text-3xl ${low === "empty" ? "text-destructive" : low === "low" ? "text-warn" : "neon-text"}`}>
                    {avail}
                  </div>
                  <div className="text-[10px] tracking-widest text-muted-foreground">müsait</div>
                </div>
                <div className="text-xs text-muted-foreground mb-1">
                  / {total} · <span className="text-cyan">{assigned}</span> satılmış
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    low === "empty" ? "bg-destructive" : low === "low" ? "bg-warn" : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>/{p.slug}</span>
                <span className="text-primary/80">{DELIVERY_HINTS[(p.delivery_type ?? "key") as DeliveryType].title.toLowerCase()}</span>
                <span>{p.active ? "aktif" : "pasif"}</span>
              </div>
            </button>
          );
        })}
      </div>


      <div className="mt-6 glass-card rounded-lg p-4">
        <div className="font-mono text-xs text-muted-foreground">$ ./import --keys</div>
        <div className="mt-2 grid gap-3">
          <div>
            <Label className="font-mono text-xs">ürün</Label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded border border-border bg-input px-3 py-2 font-mono text-sm"
            >
              <option value="">— seçin —</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="font-mono text-xs">
              {hint.title} <span className="text-primary/70">— {hint.help}</span>
            </Label>
            <Textarea
              rows={8}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={hint.placeholder}
              className="font-mono"
            />
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-mono cursor-pointer hover:border-primary/40 transition">
                <FileUp className="h-3.5 w-3.5" />
                dosya seç (.txt / .csv)
                <input
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 1024 * 1024) {
                      toast.error("Dosya 1MB'dan büyük olamaz");
                      e.target.value = "";
                      return;
                    }
                    const text = await f.text();
                    // CSV: ilk sütunu al; TXT: tüm satır
                    const lines = text
                      .split(/\r?\n/)
                      .map((l) => l.trim())
                      .filter(Boolean)
                      .map((l) => (f.name.toLowerCase().endsWith(".csv") ? l.split(",")[0].trim() : l))
                      .filter(Boolean);
                    setRaw((cur) => (cur ? cur.trimEnd() + "\n" : "") + lines.join("\n"));
                    toast.success(`${lines.length} satır yüklendi`);
                    e.target.value = "";
                  }}
                />
              </label>
              {raw && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {raw.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean).length} key hazır
                </span>
              )}
              {raw && (
                <button
                  onClick={() => setRaw("")}
                  className="text-[11px] font-mono text-muted-foreground hover:text-destructive"
                >
                  temizle
                </button>
              )}
            </div>
          </div>
          <Button disabled={busy} onClick={doImport} className="font-mono self-start">
            <Upload className="h-4 w-4 mr-1" />içe aktar
          </Button>
        </div>
      </div>

    </div>
  );
}
