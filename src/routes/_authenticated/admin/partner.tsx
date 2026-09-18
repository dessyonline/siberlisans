import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListPayouts, adminSetPayoutStatus, type AdminPayoutRow } from "@/lib/partner.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/partner")({
  component: AdminPartner,
  head: () => ({ meta: [{ title: "Partner Ödemeleri — Admin" }] }),
});

function AdminPartner() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPayouts);
  const setStatusFn = useServerFn(adminSetPayoutStatus);

  const { data } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => listFn(),
    refetchInterval: 15000,
  });

  async function setStatus(id: string, status: "approved" | "rejected" | "paid", note?: string) {
    try {
      await setStatusFn({ data: { id, status, note } });
      toast.success("Güncellendi");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-xs text-muted-foreground">./admin/partner</div>
        <h1 className="text-2xl font-semibold">Partner Ödeme Talepleri</h1>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs font-mono">
            <tr>
              <th className="text-left p-3">Kullanıcı</th>
              <th className="text-right p-3">Tutar</th>
              <th className="text-left p-3">Yöntem</th>
              <th className="text-left p-3">Hedef</th>
              <th className="text-center p-3">Durum</th>
              <th className="text-right p-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: AdminPayoutRow) => {
              const u = r.user;
              return (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="p-3">
                    <div className="text-sm">{u?.display_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{u?.email}</div>
                  </td>
                  <td className="p-3 text-right font-mono">₺{Number(r.amount_try).toFixed(2)}</td>
                  <td className="p-3 text-xs">{r.method}</td>
                  <td className="p-3 text-xs max-w-[220px] truncate">{r.destination}</td>
                  <td className="p-3 text-center">
                    <span className={`text-xs font-mono px-2 py-1 rounded ${badgeCls(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-1">
                    {r.status === "requested" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "approved")}>
                          onayla
                        </Button>
                        <RejectBtn onConfirm={(note) => setStatus(r.id, "rejected", note)} />
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" onClick={() => setStatus(r.id, "paid")}>
                        ödendi
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RejectBtn({ onConfirm }: { onConfirm: (note: string) => void }) {
  const [n, setN] = useState("");
  return (
    <div className="inline-flex items-center gap-1">
      <input
        placeholder="not"
        value={n}
        onChange={(e) => setN(e.target.value)}
        className="h-8 text-xs px-2 rounded border border-border bg-input w-24"
      />
      <Button size="sm" variant="destructive" onClick={() => onConfirm(n || "reddedildi")}>
        reddet
      </Button>
    </div>
  );
}

function badgeCls(s: string) {
  return s === "paid"
    ? "text-primary bg-primary/10"
    : s === "approved"
      ? "text-cyan bg-cyan/10"
      : s === "rejected"
        ? "text-destructive bg-destructive/10"
        : "text-warn bg-warn/10";
}
