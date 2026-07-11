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
  ulSyncCatalog,
  ulUpdateImported,
  DEFAULT_MARKUP_PERCENT,
} from "@/lib/uniquelisans.functions";
import { suggestRetailPrice, batchSuggestRetailPrices } from "@/lib/retail-price.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, Loader2, Download, RefreshCw, Package, CheckCircle2, Zap, Lock, Unlock, Check, X, Pencil, Sparkles, ExternalLink, Wand2 } from "lucide-react";

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
  const catalogFn = useServerFn(ulSyncCatalog);
  const batchAiFn = useServerFn(batchSuggestRetailPrices);
  const [syncing, setSyncing] = useState(false);
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const [batchAiBusy, setBatchAiBusy] = useState(false);

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
  const [rowMarkup, setRowMarkup] = useState<Record<number, number>>({});
  const [importing, setImporting] = useState<number | null>(null);
  const MIN_PROFIT_TL = 200;

  const currentCat = categories?.find((c) => c.id === catId);

  const { data: products, isFetching: prodLoading } = useQuery({
    queryKey: ["ul-products", catId, subId],
    enabled: !!catId,
    queryFn: () => prodsFn({ data: { category_id: catId!, sub_category_id: subId ?? undefined } }),
  });

  async function onImport(externalId: number) {
    setImporting(externalId);
    const effMarkup = rowMarkup[externalId] ?? markup;
    try {
      const res = await importFn({
        data: {
          external_id: externalId,
          markup_percent: effMarkup,
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
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              örn. alış 50 ₺ → satış <b className="text-primary">{fmt(Math.max(50 * (1 + markup / 100), 50 + MIN_PROFIT_TL))} ₺</b> · kar <b className="text-primary">{fmt(Math.max(50 * markup / 100, MIN_PROFIT_TL))} ₺</b>
              <span className="ml-1 text-amber-500">(min. kar ₺{MIN_PROFIT_TL} garanti)</span>
            </div>
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
                const effMarkup = rowMarkup[p.id] ?? markup;
                const marked = Math.round(p.amount * (1 + effMarkup / 100));
                const floor = Math.round(p.amount + MIN_PROFIT_TL);
                const finalPrice = Math.max(1, marked, floor);
                const flooredByMin = finalPrice > marked;
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
                      <div className="mt-1 font-mono text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>alış: <b>{fmt(p.amount)} ₺</b></span>
                        <span>satış: <b className="text-primary">{fmt(finalPrice)} ₺</b></span>
                        <span className="text-primary">kar: <b>{fmt(finalPrice - p.amount)} ₺</b> {p.amount > 0 && <span className="text-muted-foreground">(%{fmt(((finalPrice - p.amount) / p.amount) * 100)})</span>}</span>
                        {flooredByMin && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">
                            min. kar ₺{MIN_PROFIT_TL} uygulandı
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        kar%
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={effMarkup}
                          onChange={(e) => setRowMarkup((r) => ({ ...r, [p.id]: Number(e.target.value) }))}
                          className="w-16 rounded border border-primary/30 bg-background/40 px-1.5 py-1 font-mono text-xs"
                        />
                      </label>
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
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="font-mono text-xs text-muted-foreground">$ ice_aktarilan_urunler ({imported?.length ?? 0})</div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={catalogSyncing}
              onClick={async () => {
                setCatalogSyncing(true);
                try {
                  const r = await catalogFn({ data: { markup_percent: markup, import_new: true, reactivate: true } });
                  toast.success(
                    `Katalog: ${r.scanned} tarandı · ${r.inserted} yeni · ${r.updated} güncel · ${r.price_changed} fiyat · ${r.hidden} gizlendi · ${r.reactivated} açıldı${r.failed ? ` · ${r.failed} hata` : ""}`,
                  );
                  qc.invalidateQueries({ queryKey: ["ul-imported"] });
                  qc.invalidateQueries({ queryKey: ["admin-products"] });
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setCatalogSyncing(false);
                }
              }}
            >
              {catalogSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
              tam katalog senkronu
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const r = await syncFn({ data: { reactivate: true } });
                  toast.success(`Kontrol: ${r.checked} · Güncel: ${r.updated} · Gizlenen: ${r.hidden} · Geri açılan: ${r.reactivated}${r.failed ? ` · Hata: ${r.failed}` : ""}`);
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
        </div>
        {imported && imported.length > 0 ? (
          <div className="space-y-1.5">
            {imported.map((p) => (
              <ImportedRow
                key={p.id}
                p={p as ImportedProduct}
                onChanged={() => qc.invalidateQueries({ queryKey: ["ul-imported"] })}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono">henüz içe aktarılan ürün yok</div>
        )}
      </div>
    </div>
  );
}

type ImportedProduct = {
  id: string;
  name: string;
  slug: string;
  price_try: number;
  external_price: number | null;
  active: boolean;
  stock_hint?: number | null;
  unlimited_stock?: boolean;
  supplier_out_of_stock?: boolean | null;
  price_locked?: boolean | null;
  retail_price_try?: number | null;
  retail_price_source_url?: string | null;
  duration_label?: string | null;
};

function ImportedRow({ p, onChanged }: { p: ImportedProduct; onChanged: () => void }) {
  const updateFn = useServerFn(ulUpdateImported);
  const suggestFn = useServerFn(suggestRetailPrice);
  const [busy, setBusy] = useState<null | "active" | "lock" | "price" | "markup" | "retail" | "ai">(null);
  const [mode, setMode] = useState<"idle" | "price" | "markup" | "retail">("idle");
  const cost = Number(p.external_price ?? 0);
  const currentMarkup = cost > 0 ? Math.round(((Number(p.price_try) - cost) / cost) * 100) : 0;
  const [priceInput, setPriceInput] = useState<string>(String(Math.round(Number(p.price_try))));
  const [markupInput, setMarkupInput] = useState<string>(String(currentMarkup));
  const [retailInput, setRetailInput] = useState<string>(String(Math.round(Number(p.retail_price_try ?? 0)) || ""));
  const [durationInput, setDurationInput] = useState<string>(p.duration_label ?? "");
  const [sourceInput, setSourceInput] = useState<string>(p.retail_price_source_url ?? "");

  const stock = p.stock_hint;
  const unlimited = p.unlimited_stock;
  const outOfStock = !!p.supplier_out_of_stock;
  const stockLabel = unlimited
    ? "otomatik"
    : typeof stock === "number"
      ? stock > 0 ? `stok: ${stock}` : "stok yok"
      : "manuel";
  const stockCls = unlimited
    ? "text-cyan bg-cyan/10 border-cyan/30"
    : typeof stock === "number" && stock <= 0
      ? "text-destructive bg-destructive/10 border-destructive/30"
      : "text-primary bg-primary/10 border-primary/30";

  type UpdatePayload = {
    id: string;
    active?: boolean;
    price_try?: number;
    markup_percent?: number;
    price_locked?: boolean;
    retail_price_try?: number | null;
    retail_price_source_url?: string | null;
    duration_label?: string | null;
  };

  async function run(kind: typeof busy, payload: UpdatePayload) {
    setBusy(kind);
    try {
      await updateFn({ data: payload });
      toast.success("güncellendi");
      setMode("idle");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function aiSuggest() {
    setBusy("ai");
    try {
      const r = await suggestFn({ data: { productId: p.id } });
      if (r.retail_price_try) setRetailInput(String(Math.round(r.retail_price_try)));
      if (r.duration_label) setDurationInput(r.duration_label);
      if (r.source_url) setSourceInput(r.source_url);
      setMode("retail");
      toast.success(`AI önerisi hazır (güven: %${Math.round((r.confidence ?? 0) * 100)})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const retail = Number(p.retail_price_try ?? 0);
  const showRetailChip = retail > Number(p.price_try);
  const savePct = showRetailChip ? Math.round(((retail - Number(p.price_try)) / retail) * 100) : 0;

  return (
    <div className="glass-card rounded-md p-2.5 text-sm space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Package className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1 truncate">{p.name}</div>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${stockCls}`}>{stockLabel}</span>
        {outOfStock && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-destructive bg-destructive/10 border-destructive/30">
            tedarikçide yok
          </span>
        )}
        <div className="font-mono text-xs text-muted-foreground">alış: {fmt(cost)} ₺</div>

        {mode === "idle" && (
          <>
            <div className="font-mono text-xs">satış: <b>{fmt(Number(p.price_try))} ₺</b></div>
            <div className="font-mono text-xs text-primary">
              kar: <b>{fmt(Number(p.price_try) - cost)} ₺</b>
              {cost > 0 && (
                <span className="text-muted-foreground"> (%{fmt(((Number(p.price_try) - cost) / cost) * 100)})</span>
              )}
            </div>
            <button type="button" title="satış fiyatını düzenle" onClick={() => { setPriceInput(String(Math.round(Number(p.price_try)))); setMode("price"); }} className="p-1 rounded border border-primary/30 hover:bg-primary/10">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" title="kar % düzenle" onClick={() => { setMarkupInput(String(currentMarkup)); setMode("markup"); }} className="px-1.5 py-0.5 rounded border border-primary/30 hover:bg-primary/10 font-mono text-[11px]">
              %
            </button>
          </>
        )}

        {mode === "price" && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-muted-foreground">satış ₺</span>
            <input type="number" min={1} value={priceInput} onChange={(e) => setPriceInput(e.target.value)} className="w-24 rounded border border-primary/30 bg-background/40 px-1.5 py-1 font-mono text-xs" />
            <Button size="sm" variant="outline" disabled={busy === "price"} onClick={() => {
              const n = Number(priceInput);
              if (!Number.isFinite(n) || n <= 0) { toast.error("Geçersiz fiyat"); return; }
              run("price", { id: p.id, price_try: n });
            }}>
              {busy === "price" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}><X className="h-3 w-3" /></Button>
          </div>
        )}

        {mode === "markup" && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-muted-foreground">kar %</span>
            <input type="number" min={0} max={500} value={markupInput} onChange={(e) => setMarkupInput(e.target.value)} className="w-16 rounded border border-primary/30 bg-background/40 px-1.5 py-1 font-mono text-xs" />
            <Button size="sm" variant="outline" disabled={busy === "markup"} onClick={() => {
              const n = Number(markupInput);
              if (!Number.isFinite(n) || n < 0) { toast.error("Geçersiz %"); return; }
              run("markup", { id: p.id, markup_percent: n });
            }}>
              {busy === "markup" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}><X className="h-3 w-3" /></Button>
          </div>
        )}

        <button type="button" title={p.price_locked ? "fiyat kilidi açık — senkronda değişmez" : "senkron fiyatı yeniden yazabilir"} disabled={busy === "lock"} onClick={() => run("lock", { id: p.id, price_locked: !p.price_locked })} className={`p-1 rounded border font-mono text-[10px] flex items-center gap-1 ${p.price_locked ? "text-primary border-primary/40 bg-primary/10" : "text-muted-foreground border-muted-foreground/30"}`}>
          {busy === "lock" ? <Loader2 className="h-3 w-3 animate-spin" /> : p.price_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          {p.price_locked ? "kilitli" : "kilitsiz"}
        </button>

        <button type="button" title={p.active ? "aktif — kapatmak için tıkla" : "pasif — açmak için tıkla"} disabled={busy === "active"} onClick={() => run("active", { id: p.id, active: !p.active })} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${p.active ? "text-primary bg-primary/10 border-primary/30" : "text-muted-foreground border-muted-foreground/30"}`}>
          {busy === "active" ? <Loader2 className="h-3 w-3 animate-spin inline" /> : p.active ? "aktif" : "pasif"}
        </button>
      </div>

      {/* Orijinal satıcı fiyatı satırı */}
      <div className="flex flex-wrap items-center gap-2 border-t border-primary/10 pt-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">orijinal:</span>
        {mode !== "retail" ? (
          <>
            {showRetailChip ? (
              <>
                <span className="font-mono text-xs line-through text-muted-foreground/70">₺{retail.toLocaleString("tr-TR")}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                  %{savePct} tasarruf
                </span>
              </>
            ) : (
              <span className="text-[10px] font-mono text-muted-foreground/60">tanımsız</span>
            )}
            {p.duration_label && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyan/30 bg-cyan/10 text-cyan">
                {p.duration_label}
              </span>
            )}
            {p.retail_price_source_url && (
              <a href={p.retail_price_source_url} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 underline decoration-dotted">
                <ExternalLink className="h-2.5 w-2.5" /> kaynak
              </a>
            )}
            <button type="button" onClick={() => setMode("retail")} className="p-1 rounded border border-primary/30 hover:bg-primary/10" title="düzenle">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={aiSuggest} disabled={busy === "ai"} className="px-1.5 py-0.5 rounded border border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20 font-mono text-[10px] inline-flex items-center gap-1" title="AI öneri">
              {busy === "ai" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              AI öner
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-1 flex-1">
            <input type="number" min={0} placeholder="orijinal ₺" value={retailInput} onChange={(e) => setRetailInput(e.target.value)} className="w-24 rounded border border-primary/30 bg-background/40 px-1.5 py-1 font-mono text-xs" />
            <input type="text" placeholder='süre (örn "1 yıl")' value={durationInput} onChange={(e) => setDurationInput(e.target.value)} className="w-28 rounded border border-primary/30 bg-background/40 px-1.5 py-1 font-mono text-xs" />
            <input type="url" placeholder="resmi satıcı URL" value={sourceInput} onChange={(e) => setSourceInput(e.target.value)} className="flex-1 min-w-[160px] rounded border border-primary/30 bg-background/40 px-1.5 py-1 font-mono text-xs" />
            <Button size="sm" variant="outline" disabled={busy === "retail"} onClick={() => {
              const n = retailInput.trim() === "" ? null : Number(retailInput);
              if (n !== null && (!Number.isFinite(n) || n < 0)) { toast.error("Geçersiz fiyat"); return; }
              run("retail", {
                id: p.id,
                retail_price_try: n,
                duration_label: durationInput.trim() || null,
                retail_price_source_url: sourceInput.trim() || null,
              });
            }}>
              {busy === "retail" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}><X className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" onClick={aiSuggest} disabled={busy === "ai"} title="AI öneri">
              {busy === "ai" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-cyan" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
