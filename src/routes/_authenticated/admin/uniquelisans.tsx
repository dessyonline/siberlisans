import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ulBalance,
  ulCategories,
  ulProducts,
  ulImportProduct,
  ulImportedProducts,
  ulSyncStock,
  DEFAULT_MARKUP_PERCENT,
} from "@/lib/uniquelisans.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, Loader2, Download, RefreshCw, Package, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/uniquelisans")({
  ssr: false,
  component: UniquelisansPage,
  head: () => ({ meta: [{ title: "Uniquelisans — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
});

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function UniquelisansPage() {
  const qc = useQueryClient();
  const balanceFn = useServerFn(ulBalance);
  const catsFn = useServerFn(ulCategories);
  const prodsFn = useServerFn(ulProducts);
  const importFn = useServerFn(ulImportProduct);
  const importedFn = useServerFn(ulImportedProducts);
  const syncFn = useServerFn(ulSyncStock);
  const [syncing, setSyncing] = useState(false);

  const { data: balance, refetch: refetchBalance, isFetching: balLoading } = useQuery({
    queryKey: ["ul-balance"],
    queryFn: () => balanceFn(),
  });
  const { data: categories } = useQuery({ queryKey: ["ul-categories"], queryFn: () => catsFn() });
  const { data: imported } = useQuery({ queryKey: ["ul-imported"], queryFn: () => importedFn() });

  const importedIds = useMemo(() => new Set((imported ?? []).map((p) => p.external_id)), [imported]);

  const [catId, setCatId] = useState<number | null>(null);
  const [subId, setSubId] = useState<number | null>(null);
  const [markup, setMarkup] = useState<number>(DEFAULT_MARKUP_PERCENT);
  const [importing, setImporting] = useState<number | null>(null);

  const currentCat = categories?.find((c) => c.id === catId);

  const { data: products, isFetching: prodLoading } = useQuery({
    queryKey: ["ul-products", catId, subId],
    enabled: !!catId,
    queryFn: () => prodsFn({ data: { category_id: catId!, sub_category_id: subId ?? undefined } }),
  });

  async function onImport(externalId: number) {
    setImporting(externalId);
    try {
      const res = await importFn({
        data: {
          external_id: externalId,
          markup_percent: markup,
          category: currentCat?.name,
          active: false,
        },
      });
      toast.success(res.updated ? "Ürün güncellendi" : "Ürün içe aktarıldı (pasif). Aktif etmek için ürünler sayfasına git.");
      qc.invalidateQueries({ queryKey: ["ul-imported"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-muted-foreground">$ /admin/uniquelisans<span className="terminal-caret" /></div>
        <h1 className="mt-1 text-xl font-bold neon-text md:text-2xl">Uniquelisans Bayi</h1>
      </div>

      {/* Balance card */}
      <div className="glass-card corner-cut rounded-lg p-5 neon-glow flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-primary" />
          <div>
            <div className="font-mono text-[10px] uppercase text-muted-foreground">bayi bakiyesi</div>
            <div className="text-2xl font-bold neon-text-glow font-mono">
              {balance ? fmt(balance.balance) : "…"} <span className="text-sm text-muted-foreground">₺</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchBalance()} disabled={balLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${balLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Category picker */}
      <div className="glass-card rounded-lg p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block font-mono text-xs text-muted-foreground mb-1">kategori</label>
            <select
              value={catId ?? ""}
              onChange={(e) => { setCatId(e.target.value ? Number(e.target.value) : null); setSubId(null); }}
              className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm"
            >
              <option value="">— seç —</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-xs text-muted-foreground mb-1">alt kategori</label>
            <select
              value={subId ?? ""}
              onChange={(e) => setSubId(e.target.value ? Number(e.target.value) : null)}
              disabled={!currentCat}
              className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm disabled:opacity-50"
            >
              <option value="">tümü</option>
              {currentCat?.subcategories?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-xs text-muted-foreground mb-1">
              markup % (fiyat × (1+markup/100))
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={markup}
              onChange={(e) => setMarkup(Number(e.target.value))}
              className="w-full rounded border border-primary/30 bg-background/40 px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Products */}
      {catId && (
        <div>
          <div className="mb-3 font-mono text-xs text-muted-foreground">$ urunler {prodLoading && <Loader2 className="inline h-3 w-3 animate-spin" />}</div>
          {products && products.length > 0 ? (
            <div className="space-y-2">
              {products.map((p) => {
                const already = importedIds.has(String(p.id));
                const finalPrice = Math.round(p.amount * (1 + markup / 100));
                return (
                  <div key={p.id} className="glass-card rounded-lg p-3 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold text-sm">{p.name}</div>
                        {p.is_stock ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                            stok: {p.stock_count ?? "?"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                            stok yok
                          </span>
                        )}
                        {p.is_automatic_delivery && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan/10 text-cyan border border-cyan/30">
                            otomatik
                          </span>
                        )}
                        {already && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                            <CheckCircle2 className="h-3 w-3" /> içe aktarıldı
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</div>
                      <div className="mt-1 font-mono text-xs">
                        alış: <b>{fmt(p.amount)} ₺</b> → satış: <b className="text-primary">{fmt(finalPrice)} ₺</b>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onImport(p.id)}
                      disabled={importing === p.id}
                      variant={already ? "outline" : "default"}
                    >
                      {importing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      <span className="ml-1">{already ? "güncelle" : "içe aktar"}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground font-mono">
              {prodLoading ? "yükleniyor…" : "bu kategoride ürün yok"}
            </div>
          )}
        </div>
      )}

      {/* Imported list */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="font-mono text-xs text-muted-foreground">$ ice_aktarilan_urunler</div>
          <Button
            size="sm"
            variant="outline"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                const r = await syncFn();
                toast.success(`Kontrol: ${r.checked} · Güncel: ${r.updated} · Gizlenen: ${r.hidden}${r.failed ? ` · Hata: ${r.failed}` : ""}`);
                qc.invalidateQueries({ queryKey: ["ul-imported"] });
                qc.invalidateQueries({ queryKey: ["admin-products"] });
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            stokları senkronize et
          </Button>
        </div>
        {imported && imported.length > 0 ? (
          <div className="space-y-1.5">
            {imported.map((p) => (
              <div key={p.id} className="glass-card rounded-md p-2.5 flex items-center gap-3 text-sm">
                <Package className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1 truncate">{p.name}</div>
                <div className="font-mono text-xs text-muted-foreground">alış: {fmt(Number(p.external_price ?? 0))} ₺</div>
                <div className="font-mono text-xs">satış: <b>{fmt(Number(p.price_try))} ₺</b></div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${p.active ? "text-primary bg-primary/10 border-primary/30" : "text-muted-foreground border-muted-foreground/30"}`}>
                  {p.active ? "aktif" : "pasif"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono">henüz içe aktarılan ürün yok</div>
        )}
      </div>
    </div>
  );
}
