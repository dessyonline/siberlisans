import type { AdminOrderRow } from "@/lib/admin-orders.functions";
import { Check, X, CheckSquare, Square, MessageCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const STATUS_LABEL: Record<string, string> = {
  pending: "bekliyor",
  reviewing: "inceleniyor",
  approved: "onaylı",
  rejected: "reddedildi",
  failed: "başarısız",
  cancelled: "iptal",
};

export const STATUS_CLS: Record<string, string> = {
  pending: "text-muted-foreground border-border bg-muted/30",
  reviewing: "text-cyan border-cyan/40 bg-cyan/10",
  approved: "text-primary border-primary/40 bg-primary/10",
  rejected: "text-destructive border-destructive/40 bg-destructive/10",
  failed: "text-destructive border-destructive/40 bg-destructive/10",
  cancelled: "text-destructive border-destructive/40 bg-destructive/10",
};

type SortKey = "created_at" | "price_try" | "status";

export function OrdersTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
  onOpen,
  onApprove,
  onReject,
  onCopyRef,
  sort,
  dir,
  onSort,
}: {
  rows: AdminOrderRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCopyRef: (ref: string) => void;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const arrow = (k: SortKey) => (sort === k ? (dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="p-3 w-8">
                <button onClick={onToggleAll} aria-label="tümünü seç">
                  {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              </th>
              <th className="p-3 text-left">referans</th>
              <th className="p-3 text-left">müşteri</th>
              <th className="p-3 text-left">ürün</th>
              <th className="p-3 text-right cursor-pointer select-none" onClick={() => onSort("price_try")}>
                tutar{arrow("price_try")}
              </th>
              <th className="p-3 text-left">ödeme</th>
              <th className="p-3 text-left cursor-pointer select-none" onClick={() => onSort("status")}>
                durum{arrow("status")}
              </th>
              <th className="p-3 text-left cursor-pointer select-none" onClick={() => onSort("created_at")}>
                tarih{arrow("created_at")}
              </th>
              <th className="p-3 text-right">işlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const canAct = o.status === "reviewing" || o.status === "pending";
              const isSel = selected.has(o.id);
              return (
                <tr
                  key={o.id}
                  className={`border-b border-border/50 transition hover:bg-primary/5 ${isSel ? "bg-primary/5" : ""}`}
                >
                  <td className="p-3 align-middle">
                    {canAct && (
                      <button onClick={() => onToggle(o.id)} aria-label="seç">
                        {isSel ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <button
                      onClick={() => onCopyRef(o.reference_code)}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      <Copy className="h-3 w-3" /> {o.reference_code}
                    </button>
                    {o.user_note && (
                      <span className="ml-2 inline-flex items-center gap-1 text-warn">
                        <MessageCircle className="h-3 w-3" />
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs max-w-[180px] truncate">
                    <span className="text-foreground/90">{o.buyer_name || "—"}</span>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{o.buyer_email ?? ""}</div>
                  </td>
                  <td className="p-3 text-xs max-w-[220px] truncate">{o.product_name ?? "—"}</td>
                  <td className="p-3 text-right font-mono">
                    {o.discount_try > 0 && (
                      <div className="text-[10px] text-muted-foreground line-through">
                        ₺{o.price_try.toLocaleString("tr-TR")}
                      </div>
                    )}
                    <div className="text-primary font-semibold">₺{o.net_try.toLocaleString("tr-TR")}</div>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-muted-foreground">{o.paid_with ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_CLS[o.status] ?? ""}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(o.created_at).toLocaleString("tr-TR")}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      {canAct && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onApprove(o.id)} title="onayla">
                            <Check className="h-3.5 w-3.5 text-primary" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onReject(o.id)} title="reddet">
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" className="h-7 px-2 font-mono text-[10px]" onClick={() => onOpen(o.id)}>
                        detay
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-muted-foreground">
                  bu filtrede sipariş yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
