import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { transferOrder } from "@/lib/transfer.functions";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

export function TransferButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(transferOrder);
  const qc = useQueryClient();

  async function submit() {
    if (!email.includes("@")) return toast.error("Geçerli e-posta gir");
    if (!confirm(`Lisansı ${email} adresine kalıcı devretmek istediğine emin misin?`)) return;
    setBusy(true);
    try {
      await fn({ data: { orderId, toEmail: email } });
      toast.success("Lisans devredildi");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "hata");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted-foreground hover:text-primary font-mono flex items-center gap-1"
      >
        <ArrowRightLeft className="h-3 w-3" /> devret
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        placeholder="alıcı e-postası"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-8 text-xs max-w-[220px]"
      />
      <Button size="sm" onClick={submit} disabled={busy}>
        onayla
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        iptal
      </Button>
    </div>
  );
}
