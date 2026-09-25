import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { upsertBankAccount, listBankAccounts, type BankAccountRow } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ayarlar")({
  component: SettingsAdmin,
});

type Bank = { id?: string; bank_name: string; iban: string; holder_name: string; active: boolean };

function SettingsAdmin() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertBankAccount);
  const listFn = useServerFn(listBankAccounts);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: banks, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["banks-admin"],
    queryFn: async (): Promise<BankAccountRow[]> => listFn(),
    staleTime: 30_000,
  });

  const save = async () => {
    if (!editing) return;
    const iban = editing.iban.replace(/\s+/g, "").toUpperCase();
    if (editing.bank_name.trim().length < 2 || editing.holder_name.trim().length < 2 || iban.length < 10) {
      toast.error("Banka adı, alıcı adı ve geçerli bir IBAN girin");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({ data: { ...editing, bank_name: editing.bank_name.trim(), holder_name: editing.holder_name.trim(), iban } });
      toast.success("Kaydedildi");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["banks-admin"] });
    } catch (e) {
      toast.error((e as Error).message || "Banka hesabı kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="font-mono text-xl sm:text-2xl neon-text break-words">Ayarlar — Banka Bilgileri</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Sadece <span className="text-primary">aktif</span> banka hesabı müşterilere gösterilir.
      </p>

      <div className="mt-4 flex justify-end">
        <Button onClick={() => setEditing({ bank_name: "", iban: "", holder_name: "", active: true })} className="font-mono">
          <Plus className="h-4 w-4 mr-1" />yeni hesap
        </Button>
        <Dialog open={!!editing} onOpenChange={(v) => !v && !saving && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-mono">{editing?.id ? "düzenle" : "yeni hesap"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <F label="banka adı" value={editing?.bank_name ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, bank_name: v }))} />
              <F label="alıcı adı" value={editing?.holder_name ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, holder_name: v }))} />
              <F label="IBAN" value={editing?.iban ?? ""} onChange={(v) => setEditing((p) => ({ ...p!, iban: v }))} />
              <div className="flex items-center gap-2 font-mono text-sm">
                <Switch checked={editing?.active ?? true} onCheckedChange={(v) => setEditing((p) => ({ ...p!, active: v }))} />
                <span>aktif</span>
              </div>
            </div>
            <DialogFooter><Button onClick={save} disabled={saving} className="font-mono">{saving ? "kaydediliyor…" : "kaydet"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 space-y-3">
        {isLoading && <div className="glass-card rounded-lg p-5 font-mono text-xs text-muted-foreground">banka hesapları yükleniyor…</div>}
        {isError && (
          <div className="glass-card rounded-lg border border-destructive/40 p-5 text-sm">
            <div className="font-mono text-destructive">Banka hesapları yüklenemedi</div>
            <p className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "Bağlantıyı kontrol edip tekrar deneyin."}</p>
            <Button size="sm" variant="outline" className="mt-3 font-mono" onClick={() => refetch()}>tekrar dene</Button>
          </div>
        )}
        {(banks ?? []).map((b) => (
          <div key={b.id} className="glass-card rounded-lg p-4 font-mono text-sm flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{b.bank_name}</div>
              <div className="text-xs text-muted-foreground break-all">{b.holder_name} · {b.iban}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className={`text-xs ${b.active ? "text-primary" : "text-muted-foreground"}`}>
                {b.active ? "aktif" : "pasif"}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {!isLoading && !isError && (banks ?? []).length === 0 && (
          <div className="glass-card rounded-lg border border-dashed border-border/60 p-6 text-center font-mono text-xs text-muted-foreground">
            Henüz banka hesabı yok. Ödeme sayfasında gösterilecek ilk hesabı ekleyin.
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="font-mono text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}
