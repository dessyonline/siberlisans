import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { upsertBankAccount } from "@/lib/orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ayarlar")({
  component: SettingsAdmin,
});

type Bank = { id?: string; bank_name: string; iban: string; holder_name: string; active: boolean };

function SettingsAdmin() {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertBankAccount);
  const [editing, setEditing] = useState<Bank | null>(null);

  const { data: banks } = useQuery({
    queryKey: ["banks-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").order("created_at");
      if (error) throw error;
      return data as Bank[];
    },
  });

  const save = async () => {
    if (!editing) return;
    try {
      await upsertFn({ data: editing });
      toast.success("Kaydedildi");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["banks-admin"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <h1 className="font-mono text-2xl neon-text">Ayarlar — Banka Bilgileri</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        Sadece <span className="text-primary">aktif</span> banka hesabı müşterilere gösterilir.
      </p>

      <div className="mt-4 flex justify-end">
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ bank_name: "", iban: "", holder_name: "", active: true })} className="font-mono">
              <Plus className="h-4 w-4 mr-1" />yeni hesap
            </Button>
          </DialogTrigger>
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
            <DialogFooter><Button onClick={save} className="font-mono">kaydet</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 space-y-3">
        {(banks ?? []).map((b) => (
          <div key={b.id} className="glass-card rounded-lg p-4 font-mono text-sm flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{b.bank_name}</div>
              <div className="text-xs text-muted-foreground">{b.holder_name} · {b.iban}</div>
            </div>
            <div className={`text-xs ${b.active ? "text-primary" : "text-muted-foreground"}`}>
              {b.active ? "aktif" : "pasif"}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ))}
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
