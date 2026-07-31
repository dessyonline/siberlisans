import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { approveOrder, rejectOrder, adminCancelOrder } from "@/lib/orders.functions";
import { syncUniquelisansOrder, syncAllPendingUniquelisans } from "@/lib/uniquelisans-sync.functions";
import { listAdminOrders, getOrderKpis, listProductOptions } from "@/lib/admin-orders.functions";
import { OrdersKpiBar } from "@/components/admin/orders/OrdersKpiBar";
import { OrdersTable } from "@/components/admin/orders/OrdersTable";
import { OrderDetailDrawer } from "@/components/admin/orders/OrderDetailDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Search, X, ChevronLeft, ChevronRight, Zap, Ban, Download } from "lucide-react";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "tümü" },
  { value: "reviewing", label: "inceleniyor" },
  { value: "pending", label: "bekliyor" },
  { value: "approved", label: "onaylı" },
  { value: "rejected", label: "reddedildi" },
  { value: "failed", label: "başarısız" },
  { value: "cancelled", label: "iptal" },
];

export const Route = createFileRoute("/_authenticated/admin/siparisler")({
  component: AdminOrdersPage,
});

type SortKey = "created_at" | "price_try" | "status";

function AdminOrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAdminOrders);
  const kpiFn = useServerFn(getOrderKpis);
  const productsFn = useServerFn(listProductOptions);
  const approveFn = useServerFn(approveOrder);
  const rejectFn = useServerFn(rejectOrder);
  const cancelFn = useServerFn(adminCancelOrder);
  const syncOneFn = useServerFn(syncUniquelisansOrder);
  const syncAllFn = useServerFn(syncAllPendingUniquelisans);

  const [status, setStatus] = useState("all");
  const [range, setRange] = useState<"today" | "7d" | "30d" | "all">("all");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [productId, setProductId] = useState("");
  const [paidWith, setPaidWith] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [onlyMessage, setOnlyMessage] = useState(false);
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(q.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = useMemo(
    () => ({
      status,
      range,
      q: term,
      productId,
      paidWith,
      minAmount: minAmount ? Number(minAmount) : null,
      maxAmount: maxAmount ? Number(maxAmount) : null,
      onlyMessage,
      sort,
      dir,
      page,
      perPage,
    }),
    [status, range, term, productId, paidWith, minAmount, maxAmount, onlyMessage, sort, dir, page],
  );

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-orders", params],
    queryFn: () => listFn({ data: params }),
  });

  const { data: kpis } = useQuery({
    queryKey: ["admin-order-kpis"],
    queryFn: () => kpiFn(),
    refetchInterval: 60_000,
  });

  const { data: products } = useQuery({
    queryKey: ["admin-product-options"],
    queryFn: () => productsFn(),
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
    qc.invalidateQueries({ queryKey: ["admin-order-kpis"] });
  };

  useEffect(() => {
    const channel = supabase
      .channel("admin-orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        invalidate();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));

  const actionable = rows.filter((o) => o.status === "reviewing" || o.status === "pending");
  const allSelected = actionable.length > 0 && actionable.every((o) => selected.has(o.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(actionable.map((o) => o.id)));

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const approve = (id: string) =>
    wrap(async () => {
      await approveFn({ data: { orderId: id } });
      toast.success("Sipariş onaylandı");
    });

  const reject = (id: string) =>
    wrap(async () => {
      await rejectFn({ data: { orderId: id, note: note || undefined } });
      toast.success("Sipariş reddedildi");
    });

  const cancel = (id: string) =>
    wrap(async () => {
      const res = await cancelFn({ data: { orderId: id, note: note || undefined } });
      const parts = ["İptal edildi"];
      if (res.refunded_try > 0) parts.push(`₺${res.refunded_try} iade`);
      if (res.released_keys > 0) parts.push(`${res.released_keys} anahtar iade`);
      toast.success(parts.join(" · "));
    });

  const bulk = (kind: "approve" | "reject") =>
    wrap(async () => {
      const ids = Array.from(selected);
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        try {
          if (kind === "approve") await approveFn({ data: { orderId: id } });
          else await rejectFn({ data: { orderId: id, note: note || "toplu red" } });
          ok++;
        } catch {
          fail++;
        }
      }
      setSelected(new Set());
      toast.success(`${ok} işlendi${fail ? ` · ${fail} hata` : ""}`);
    });

  const syncAll = () =>
    wrap(async () => {
      const res = await syncAllFn({});
      const delivered = res.outcomes.filter((o) => o.result === "delivered").length;
      const pending = res.outcomes.filter((o) => o.result === "still_pending").length;
      const errors = res.outcomes.filter((o) => o.result === "error").length;
      toast.success(`senkron: ${delivered} teslim · ${pending} bekliyor · ${errors} hata`);
    });

  const syncOne = (id: string) =>
    wrap(async () => {
      const res = await syncOneFn({ data: { orderId: id } });
      if (res.result === "delivered") toast.success(`${res.ref} teslim edildi`);
      else if (res.result === "still_pending") toast.info(`${res.ref} hâlâ pending`);
      else toast.error(`${res.ref}: ${"message" in res ? res.message : res.reason}`);
    });

  const resetFilters = () => {
    setStatus("all");
    setRange("all");
    setQ("");
    setProductId("");
    setPaidWith("");
    setMinAmount("");
    setMaxAmount("");
    setOnlyMessage(false);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Siparişler</h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            {total} kayıt · sayfa {page}/{pages}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="font-mono" disabled={busy} onClick={syncAll}>
            <Zap className="h-3.5 w-3.5 mr-1" /> tümünü senkronla
          </Button>
          <Button variant="outline" size="sm" className="font-mono" onClick={() => refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> yenile
          </Button>
        </div>
      </div>

      <OrdersKpiBar kpis={kpis} live={live} />

      <div className="glass-card rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="referans, e-posta, isim, dış sipariş…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 font-mono text-xs"
            />
          </div>
          <div className="hidden" />

          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as typeof range);
              setPage(1);
            }}
            className="rounded-md border border-border bg-input px-3 py-2 font-mono text-xs"
          >
            <option value="all">tüm zamanlar</option>
            <option value="today">bugün</option>
            <option value="7d">7 gün</option>
            <option value="30d">30 gün</option>
          </select>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-input px-3 py-2 font-mono text-xs max-w-[200px]"
          >
            <option value="">tüm ürünler</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={paidWith}
            onChange={(e) => {
              setPaidWith(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-input px-3 py-2 font-mono text-xs"
          >
            <option value="">tüm ödemeler</option>
            <option value="wallet">cüzdan</option>
            <option value="shopier">shopier</option>
            <option value="crypto">kripto</option>
            <option value="transfer">havale</option>
          </select>
          <Input
            placeholder="min ₺"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value.replace(/\D/g, ""))}
            className="w-24 font-mono text-xs"
          />
          <Input
            placeholder="max ₺"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value.replace(/\D/g, ""))}
            className="w-24 font-mono text-xs"
          />
          <Button
            variant={onlyMessage ? "default" : "outline"}
            size="sm"
            className="font-mono text-xs"
            onClick={() => {
              setOnlyMessage((v) => !v);
              setPage(1);
            }}
          >
            notlu
          </Button>
          <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={resetFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> temizle
          </Button>
        </div>

        <Input
          placeholder="işlem notu (red / iptal için kullanılır)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="font-mono text-xs"
        />
      </div>

      {selected.size > 0 && (
        <div className="glass-card rounded-xl p-3 flex flex-wrap items-center gap-2 border border-primary/40">
          <span className="font-mono text-xs text-primary">{selected.size} sipariş seçili</span>
          <Button size="sm" className="font-mono" disabled={busy} onClick={() => bulk("approve")}>
            toplu onayla
          </Button>
          <Button size="sm" variant="destructive" className="font-mono" disabled={busy} onClick={() => bulk("reject")}>
            toplu reddet
          </Button>
          <Button size="sm" variant="ghost" className="font-mono" onClick={() => setSelected(new Set())}>
            seçimi bırak
          </Button>
        </div>
      )}

      <OrdersTable
        rows={rows}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        allSelected={allSelected}
        onOpen={setOpenId}
        onApprove={approve}
        onReject={reject}
        onCopyRef={(r) => {
          navigator.clipboard.writeText(r);
          toast.success("referans kopyalandı");
        }}
        sort={sort}
        dir={dir}
        onSort={(k) => {
          if (k === sort) setDir(dir === "asc" ? "desc" : "asc");
          else {
            setSort(k);
            setDir("desc");
          }
          setPage(1);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {rows.some((o) => o.external_order_id && o.status !== "approved") && (
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs"
              disabled={busy}
              onClick={() => {
                const target = rows.find((o) => o.external_order_id && o.status !== "approved");
                if (target) syncOne(target.id);
              }}
            >
              <Zap className="h-3.5 w-3.5 mr-1" /> ilk bekleyeni senkronla
            </Button>
          )}
          {openId && (
            <Button size="sm" variant="ghost" className="font-mono text-xs" disabled={busy} onClick={() => cancel(openId)}>
              <Ban className="h-3.5 w-3.5 mr-1" /> açık siparişi iptal et
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            {page} / {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />
    </div>
  );
}
