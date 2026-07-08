import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MfaChallenge } from "./MfaChallenge";

/**
 * Reusable 2FA challenge modal.
 * open=true iken kullanıcıdan totp kodu ister; başarıda onSuccess çağırır.
 */
export function MfaGateDialog({
  open,
  onOpenChange,
  onSuccess,
  title = "İşlem için 2FA gerekli",
  description = "Bu işlemi tamamlamak için authenticator uygulamandan 6 haneli kod gir.",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{title}</DialogTitle>
        </DialogHeader>
        <p className="font-mono text-[11px] text-muted-foreground -mt-1">{description}</p>
        <MfaChallenge
          title=""
          onCancel={() => onOpenChange(false)}
          onSuccess={() => {
            onOpenChange(false);
            onSuccess();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
