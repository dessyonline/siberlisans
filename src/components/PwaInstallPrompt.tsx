import { useEffect, useState } from "react";
import { Download, Share2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Chrome/Android/Edge fire this event before the browser shows the install banner.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function shouldShow(): boolean {
  if (typeof window === "undefined") return false;
  // already installed?
  if (window.matchMedia?.("(display-mode: standalone)")?.matches) return false;
  // iOS PWA
  // biome-ignore lint/suspicious/noExplicitAny: navigator.standalone is iOS-only
  if ((window.navigator as any).standalone) return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (raw) {
    const ts = Number(raw);
    if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) return false;
  }
  return true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS fallback — no beforeinstallprompt on Safari
    if (isIOS()) {
      // show only after a small delay so it doesn't spam
      const t = setTimeout(() => setVisible(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowIosHelp(false);
  };

  const install = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        // ignore
      }
      dismiss();
      setDeferred(null);
      return;
    }
    if (isIOS()) {
      setShowIosHelp(true);
    }
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 z-[70] max-w-sm mx-auto sm:mx-0">
        <div className="glass-card corner-cut border border-primary/40 rounded-lg p-3 bg-background/95 shadow-[0_0_30px_rgba(0,255,157,0.2)]">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-md border border-primary/30 bg-primary/10 p-2">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs neon-text">SiberPHP'yi ana ekrana ekle</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Tek dokunuşla aç · offline manifest · tam ekran.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" className="h-7 font-mono text-[11px] neon-glow" onClick={install}>
                  {isIOS() ? "nasıl yüklerim?" : "yükle"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 font-mono text-[11px] text-muted-foreground" onClick={dismiss}>
                  şimdi değil
                </Button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Kapat"
              onClick={dismiss}
              className="text-muted-foreground hover:text-primary p-1 -m-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showIosHelp && (
        <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/70 p-3" onClick={dismiss}>
          <div
            className="glass-card corner-cut w-full max-w-sm rounded-lg border border-primary/40 bg-background/95 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-xs text-muted-foreground">$ ios --add-to-home-screen</div>
            <h3 className="mt-2 font-mono text-lg neon-text">iPhone / iPad kurulumu</h3>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="font-mono text-primary shrink-0">1.</span>
                <span>Safari alt barındaki <Share2 className="inline h-4 w-4 -mt-0.5 text-primary" /> <b>Paylaş</b> tuşuna dokun.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-primary shrink-0">2.</span>
                <span>Menüde <b>Ana Ekrana Ekle</b> <Plus className="inline h-4 w-4 -mt-0.5 text-primary" /> seçeneğine dokun.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-primary shrink-0">3.</span>
                <span>Sağ üstteki <b>Ekle</b>'ye dokun. İkon ana ekranda hazır.</span>
              </li>
            </ol>
            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={dismiss} className="font-mono">tamam</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
