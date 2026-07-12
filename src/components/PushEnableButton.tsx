import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  savePushSubscription,
  deletePushSubscription,
  sendTestPush,
  VAPID_PUBLIC_KEY,
} from "@/lib/push.functions";

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const norm = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(norm);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "denied" | "off" | "on" | "loading";

export function PushEnableButton() {
  const [state, setState] = useState<State>("loading");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const save = useServerFn(savePushSubscription);
  const del = useServerFn(deletePushSubscription);
  const test = useServerFn(sendTestPush);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setEndpoint(sub.endpoint);
          setState("on");
        } else {
          setState("off");
        }
      } catch (e) {
        console.error(e);
        setState("off");
      }
    })();
  }, []);

  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
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
      setEndpoint(json.endpoint);
      setState("on");
      toast.success("Web push aktif");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const disable = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await del({ data: { endpoint: sub.endpoint } });
      }
      setEndpoint(null);
      setState("off");
      toast.success("Web push kapatıldı");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const testPush = async () => {
    try {
      const r = await test({});
      if (r.sent === 0) toast.error("Aktif abonelik bulunamadı");
      else toast.success(`${r.sent} cihaza gönderildi`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="glass-card rounded-md p-4 space-y-2">
      <div className="flex items-center gap-2 font-mono text-sm">
        <BellRing className="h-4 w-4 text-primary" />
        <span className="neon-text">Tarayıcı Bildirimleri</span>
      </div>
      <p className="text-[11px] font-mono text-muted-foreground">
        stok geldi · flash başladı · sipariş onaylandı — tarayıcın kapalıyken bile bildirir.
      </p>

      {state === "loading" && <div className="text-xs font-mono">yükleniyor…</div>}
      {state === "unsupported" && (
        <div className="text-xs font-mono text-destructive">bu tarayıcı web push desteklemiyor</div>
      )}
      {state === "denied" && (
        <div className="text-xs font-mono text-destructive">
          engellenmiş — tarayıcı ayarlarından bu siteye "Bildirim: izin ver" seç
        </div>
      )}
      {state === "off" && (
        <Button size="sm" onClick={enable} className="font-mono">
          <Bell className="h-3 w-3 mr-1.5" /> etkinleştir
        </Button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={testPush} className="font-mono">
            test gönder
          </Button>
          <Button size="sm" variant="ghost" onClick={disable} className="font-mono">
            <BellOff className="h-3 w-3 mr-1.5" /> kapat
          </Button>
        </div>
      )}
      {endpoint && state === "on" && (
        <div className="text-[10px] font-mono text-muted-foreground/70 truncate">
          {new URL(endpoint).host}
        </div>
      )}
    </div>
  );
}
