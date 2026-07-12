import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminListInvoices } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { Search, Download, FileText, Receipt, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/faturalar")({
  component: AdminInvoicesPage,
  ssr: false,
});

function AdminInvoicesPage() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-invoices", q, from, to],
    queryFn: () =>
      adminListInvoices({
        data: {
          q: q || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(new Date(to).getTime() + 86_399_000).toISOString() : undefined,
          limit: 500,
        },
      }),
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { count: 0, total: 0, subtotal: 0, vat: 0 };

  const exportCsv = () => {
    const header = [
      "invoice_number",
      "issued_at",
      "reference_code",
      "buyer_name",
      "buyer_email",
      "buyer_tax_id",
      "subtotal_try",
      "vat_amount_try",
      "total_try",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.invoice_number,
          new Date(r.issued_at).toISOString(),
          r.order?.reference_code ?? "",
          csvSafe(r.buyer_name ?? ""),
          csvSafe(r.buyer_email ?? ""),
          csvSafe(r.buyer_tax_id ?? ""),
          Number(r.subtotal_try).toFixed(2),
          Number(r.vat_amount_try).toFixed(2),
          Number(r.total_try).toFixed(2),
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `siberphp-faturalar-${stamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono text-xs text-muted-foreground flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-primary" /> $ ./admin/invoices --all
          </div>
          <h1 className="mt-1 font-mono text-2xl neon-text">Faturalar</h1>
        </div>
        <Button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="font-mono neon-glow"
          size="sm"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> csv indir ({rows.length})
        </Button>
      </div>

      {/* özet kutuları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-lg p-3">
          <div className="font-mono text-[10px] text-muted-foreground">fatura sayısı</div>
          <div className="font-mono text-xl mt-1">{totals.count}</div>
        </div>
        <div className="glass-card rounded-lg p-3">
          <div className="font-mono text-[10px] text-muted-foreground">toplam ciro</div>
          <div className="font-mono text-xl mt-1 text-primary">
            ₺{totals.total.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="glass-card rounded-lg p-3">
          <div className="font-mono text-[10px] text-muted-foreground">matrah</div>
          <div className="font-mono text-xl mt-1">
            ₺{totals.subtotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="glass-card rounded-lg p-3">
          <div className="font-mono text-[10px] text-muted-foreground">kdv toplam</div>
          <div className="font-mono text-xl mt-1 text-warn">
            ₺{totals.vat.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* filtre */}
      <div className="glass-card rounded-lg p-4 grid gap-3 md:grid-cols-[1fr,auto,auto,auto]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="fatura no / müşteri / mail"
            className="font-mono pl-7 h-9 text-xs"
          />
        </div>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="font-mono h-9 text-xs"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="font-mono h-9 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="font-mono"
        >
          {isFetching ? "…" : "filtrele"}
        </Button>
      </div>

      {/* liste */}
      <div className="glass-card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="border-b border-border/40 bg-background/40">
              <tr className="text-muted-foreground">
                <th className="text-left px-3 py-2">fatura no</th>
                <th className="text-left px-3 py-2">tarih</th>
                <th className="text-left px-3 py-2">müşteri</th>
                <th className="text-right px-3 py-2">matrah</th>
                <th className="text-right px-3 py-2">kdv</th>
                <th className="text-right px-3 py-2">toplam</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground">
                    $ loading<span className="terminal-caret" />
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    Kayıt yok.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-primary/5">
                  <td className="px-3 py-2 text-primary">{r.invoice_number}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(r.issued_at).toLocaleDateString("tr-TR")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="truncate max-w-[180px]">{r.buyer_name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                      {r.buyer_email ?? ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    ₺{Number(r.subtotal_try).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-warn">
                    ₺{Number(r.vat_amount_try).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-primary font-semibold">
                    ₺{Number(r.total_try).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/fatura/$orderId"
                      params={{ orderId: r.order_id }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="h-3 w-3" /> pdf
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function csvSafe(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
