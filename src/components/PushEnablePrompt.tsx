import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { savePushSubscription, VAPID_PUBLIC_KEY } from "@/lib/push.functions";

const DISMISS_KEY = "push_prompt_dismissed_at";
const DISMISS_DAYS = 7;

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const norm = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(norm);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushEnablePrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(savePushSubscription);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission !== "default") return; // izin verilmiş veya engellenmişse gösterme

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const age = Date.now() - Number(dismissed);
      if (age < DISMISS_DAYS * 86400 * 1000) return;
    }

    // Zaten abonelik varsa gösterme
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) return;
      } catch {
        /* noop */
      }
      const t = setTimeout(() => setShow(true), 8000); // 8sn sonra göster
      return () => clearTimeout(t);
    })();
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("İzin verilmedi");
        dismiss();
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error("Abonelik oluşturulamadı");
        return;
      }
      await save({
        data: {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent.slice(0, 200),
        },
      });
      toast.success("[✓] bildirimler aktif");
      setShow(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-40 animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="glass-card corner-cut rounded-lg p-4 border border-primary/40 neon-glow relative">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
          aria-label="Kapat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-9 w-9 rounded-md bg-primary/10 border border-primary/40 inline-flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 pr-4">
            <div className="font-mono text-sm font-semibold neon-text">Bildirimleri aç</div>
            <p className="mt-1 text-[11px] font-mono text-muted-foreground leading-relaxed">
              stok geldi · flash indirim · sipariş onaylandı — tarayıcı kapalıyken bile haberdar ol.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={enable} disabled={busy} className="font-mono h-7 text-[11px]">
                {busy ? "..." : "> etkinleştir"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismiss}
                className="font-mono h-7 text-[11px] text-muted-foreground"
              >
                sonra
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
