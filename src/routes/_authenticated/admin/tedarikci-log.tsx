import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tedarikci-log")({
  component: SupplierLogPage,
});

type Row = {
  id: string;
  created_at: string;
  source: string;
  product_name: string | null;
  external_id: string | null;
  stock_ok: boolean | null;
  stock_count: number | null;
  is_stock: boolean | null;
  supplier_amount: number | null;
  balance: number | null;
  balance_ok: boolean | null;
  blocked: boolean;
  block_reason: string | null;
  context: string | null;
  error: string | null;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function reasonLabel(r: string | null) {
  if (r === "out_of_stock") return "stok yok";
  if (r === "insufficient_balance") return "bakiye yetersiz";
  return r ?? "—";
}

function SupplierLogPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-check-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_check_logs")
        .select(
          "id, created_at, source, product_name, external_id, stock_ok, stock_count, is_stock, supplier_amount, balance, balance_ok, blocked, block_reason, context, error",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 30_000,
  });

  const blockedCount = (data ?? []).filter((r) => r.blocked).length;
  const errorCount = (data ?? []).filter((r) => r.error).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">tedarikçi log</h1>
        <p className="text-sm text-muted-foreground">
          Sipariş anında Uniquelisans stok / bakiye kontrol sonuçları — son 200 kayıt.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              toplam
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-mono">{data?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              engellenen
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-mono text-destructive">{blockedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              hata
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-mono text-amber-500">{errorCount}</CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">yükleniyor…</div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive">
              hata: {(error as Error).message}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">henüz kayıt yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">zaman</th>
                    <th className="px-3 py-2 text-left">ürün</th>
                    <th className="px-3 py-2 text-left">bağlam</th>
                    <th className="px-3 py-2 text-left">stok</th>
                    <th className="px-3 py-2 text-right">tedarikçi ₺</th>
                    <th className="px-3 py-2 text-right">bakiye ₺</th>
                    <th className="px-3 py-2 text-left">sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className="border-t border-border/50">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                        {fmtDate(r.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.product_name ?? "—"}</div>
                        {r.external_id && (
                          <div className="text-xs text-muted-foreground font-mono">
                            ext: {r.external_id}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.context === "cart_order" ? "sepet" : "tekli"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.stock_ok === false ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            yok
                          </span>
                        ) : r.stock_ok === true ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {r.stock_count === null ? "var" : `${r.stock_count}`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.supplier_amount != null ? r.supplier_amount.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {r.balance != null ? (
                          <span
                            className={
                              r.balance_ok === false ? "text-destructive" : undefined
                            }
                          >
                            {r.balance.toFixed(2)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.error ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {r.error.slice(0, 40)}
                          </Badge>
                        ) : r.blocked ? (
                          <Badge variant="destructive">engellendi · {reasonLabel(r.block_reason)}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-emerald-500">
                            geçti
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
