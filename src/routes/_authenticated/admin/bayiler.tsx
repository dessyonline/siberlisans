import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListDealerApplications,
  adminReviewDealerApplication,
  adminRepairApprovedDealers,
  adminListDealers,
  adminUpdateDealer,
} from "@/lib/dealer.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Handshake, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bayiler")({
  head: () => ({
    meta: [
      { title: "Bayi Yönetimi | SiberLisans Admin" },
      { name: "description", content: "Bayilik başvurularını onayla ve bayi indirim oranlarını yönet." },
      { property: "og:title", content: "Bayi Yönetimi | SiberLisans Admin" },
      { property: "og:description", content: "Bayilik başvuruları ve bayi yönetimi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDealers,
});

const try_ = (n: number | string | null | undefined) => `₺${Number(n ?? 0).toLocaleString("tr-TR")}`;

function AdminDealers() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"basvuru" | "bayiler">("basvuru");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Handshake className="h-5 w-5 text-primary" /> Bayi Yönetimi
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          başvuruları onayla, toptan indirim oranlarını düzenle
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["basvuru", "başvurular"],
            ["bayiler", "bayiler"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md border px-3 py-1.5 font-mono text-xs ${
              tab === k
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:text-primary"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "basvuru" ? <Applications qc={qc} /> : <Dealers qc={qc} />}
    </div>
  );
}

function Applications({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const listFn = useServerFn(adminListDealerApplications);
  const reviewFn = useServerFn(adminReviewDealerApplication);
  const repairFn = useServerFn(adminRepairApprovedDealers);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dealer-apps"],
    queryFn: () => listFn(),
  });

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await reviewFn({ data: { applicationId: id, approve, adminNote: notes[id]?.trim() || undefined } });
      toast.success(approve ? "Bayilik onaylandı" : "Başvuru reddedildi");
      qc.invalidateQueries({ queryKey: ["admin-dealer-apps"] });
      qc.invalidateQueries({ queryKey: ["admin-dealers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setBusy(null);
    }
  };

  const repairApproved = async () => {
    setRepairing(true);
    try {
      const result = await repairFn();
      toast.success(result.repaired ? `${result.repaired} bayi kaydı onarıldı` : "Onarılacak eksik bayi kaydı yok");
      qc.invalidateQueries({ queryKey: ["admin-dealer-apps"] });
      qc.invalidateQueries({ queryKey: ["admin-dealers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bayi kayıtları onarılamadı");
    } finally {
      setRepairing(false);
    }
  };

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="font-mono" disabled={repairing} onClick={repairApproved}>
          {repairing ? "onarılıyor…" : "eksik onayları onar"}
        </Button>
      </div>
      {(data ?? []).length === 0 && (
        <p className="font-mono text-sm text-muted-foreground">başvuru yok</p>
      )}
      {(data ?? []).map((a) => (
        <div key={a.id} className="glass-card rounded-xl border border-border/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{a.company_name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {a.display_name ?? "—"} · {a.email ?? "—"} · {a.contact_phone || "telefon yok"}
              </div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                kanal: {a.channel || "—"} · aylık tahmini: {try_(a.monthly_volume_try)} ·{" "}
                {new Date(a.created_at).toLocaleDateString("tr-TR")}
              </div>
              {a.note && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{a.note}</p>}
            </div>
            <span
              className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase ${
                a.status === "pending"
                  ? "border-warn/50 text-warn"
                  : a.status === "approved"
                    ? "border-primary/50 text-primary"
                    : "border-destructive/50 text-destructive"
              }`}
            >
              {a.status}
            </span>
          </div>

          {a.status === "pending" && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Textarea
                rows={1}
                placeholder="admin notu (opsiyonel)"
                value={notes[a.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                className="min-h-9 flex-1 min-w-[220px]"
              />
              <Button size="sm" className="font-mono" disabled={busy === a.id} onClick={() => review(a.id, true)}>
                <Check className="mr-1 h-3.5 w-3.5" /> onayla
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="font-mono"
                disabled={busy === a.id}
                onClick={() => review(a.id, false)}
              >
                <X className="mr-1 h-3.5 w-3.5" /> reddet
              </Button>
            </div>
          )}
          {a.status !== "pending" && a.admin_note && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">not: {a.admin_note}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Dealers({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const listFn = useServerFn(adminListDealers);
  const updateFn = useServerFn(adminUpdateDealer);
  const [edit, setEdit] = useState<Record<string, { c: string; d: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dealers"],
    queryFn: () => listFn(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-dealers"] });

  const save = async (userId: string) => {
    const e = edit[userId];
    setBusy(userId);
    try {
      await updateFn({ data: { userId, discountPercent: e?.d === "" ? -1 : Number(e?.d) } });
      toast.success("Oranlar güncellendi");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (userId: string, active: boolean) => {
    try {
      await updateFn({ data: { userId, active: !active } });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bir hata oluştu");
    }
  };

  if (isLoading) return <p className="font-mono text-sm text-muted-foreground">yükleniyor…</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="p-2 text-left">bayi</th>
            <th className="p-2 text-left">kod</th>
            <th className="p-2 text-left">seviye</th>
            <th className="p-2 text-right">ciro</th>
            <th className="p-2 text-right">müşteri</th>
            <th className="p-2 text-center">indirim %</th>
            <th className="p-2 text-right">işlem</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((d, i) => (
            <tr key={d.user_id} className={i % 2 ? "bg-card/30" : ""}>
              <td className="p-2">
                <div className="font-medium">{d.company_name ?? d.display_name ?? "—"}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{d.email ?? "—"}</div>
              </td>
              <td className="p-2 font-mono text-xs text-primary">{d.code}</td>
              <td className="p-2 font-mono text-xs">{d.tier_slug}</td>
              <td className="p-2 text-right font-mono">{try_(d.total_volume_try)}</td>
              <td className="p-2 text-right">{d.customer_count}</td>
              <td className="p-2 text-center">
                <Input
                  className="mx-auto h-8 w-20 text-center font-mono"
                  value={edit[d.user_id]?.d ?? String(Number(d.discount_percent))}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      [d.user_id]: {
                        c: "0",
                        d: e.target.value,
                      },
                    })
                  }
                />
              </td>
              <td className="p-2">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" className="font-mono" disabled={busy === d.user_id} onClick={() => save(d.user_id)}>
                    kaydet
                  </Button>
                  <Button
                    size="sm"
                    variant={d.active ? "ghost" : "secondary"}
                    className="font-mono"
                    onClick={() => toggle(d.user_id, d.active)}
                  >
                    {d.active ? "pasifle" : "aktifle"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center font-mono text-xs text-muted-foreground">
                henüz bayi yok
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
