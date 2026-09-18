import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mfaEnrollStart, mfaEnrollVerify } from "@/lib/mfa.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Copy, QrCode, KeyRound } from "lucide-react";

type EnrollState = {
  qrSvg: string;
  secret: string;
  uri: string;
};

export function MfaEnroll({ onDone }: { onDone?: () => void }) {
  const enrollStart = useServerFn(mfaEnrollStart);
  const enrollVerify = useServerFn(mfaEnrollVerify);
  const [state, setState] = useState<EnrollState | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    (async () => {
      setStarting(true);
      try {
        const data = await enrollStart();
        setState({ qrSvg: data.qrSvg, secret: data.secret, uri: data.uri });
      } catch (e) {
        toast.error(`[!] ${(e as Error).message ?? "enroll hatası"}`);
      } finally {
        setStarting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    if (!state) return;
    const cleaned = code.replace(/\s/g, "");
    if (cleaned.length !== 6) return toast.error("[!] 6 haneli kod gir");
    setLoading(true);
    try {
      await enrollVerify({ data: { code: cleaned } });
      toast.success("[✓] 2FA aktifleştirildi");
      onDone?.();
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`[✓] ${label} kopyalandı`);
  };

  if (starting) {
    return (
      <div className="font-mono text-xs text-muted-foreground p-4">
        $ generating totp secret<span className="terminal-caret" />
      </div>
    );
  }
  if (!state) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 font-mono text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>adım 1 · authenticator uygulaması aç</span>
        </div>
        <div className="mt-1">
          Google Authenticator, Authy, 1Password, Microsoft Authenticator veya benzeri bir TOTP uygulaması kullan.
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-background/40 p-4">
        <div className="flex items-center gap-2 font-mono text-xs text-primary">
          <QrCode className="h-3.5 w-3.5" /> adım 2 · qr kodu tara
        </div>
        <div
          className="mt-3 mx-auto w-fit rounded bg-white p-3"
          // Sunucuda kendi ürettiğimiz güvenli SVG
          dangerouslySetInnerHTML={{ __html: state.qrSvg }}
        />
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 rounded border border-border/50 bg-background/60 px-2 py-1.5 font-mono text-[11px] break-all">
            {state.secret}
          </div>
          <Button size="sm" variant="outline" className="font-mono" onClick={() => copy(state.secret, "gizli anahtar")}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          QR taranamıyorsa bu gizli anahtarı manuel olarak gir.
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-background/40 p-4">
        <div className="flex items-center gap-2 font-mono text-xs text-primary">
          <KeyRound className="h-3.5 w-3.5" /> adım 3 · uygulamadaki 6 haneli kodu gir
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="font-mono text-center tracking-[0.4em] text-lg"
          />
          <Button disabled={loading || code.length !== 6} onClick={verify} className="font-mono neon-glow">
            {loading ? "…" : "> onayla"}
          </Button>
        </div>
      </div>
    </div>
  );
}
