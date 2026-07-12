import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Bell, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getNotificationPrefs, updateNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs.functions";
import { PushEnableButton } from "@/components/PushEnableButton";

export const Route = createFileRoute("/_authenticated/bildirimler")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Bildirim Tercihleri — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const ROWS: Array<{ key: keyof NotificationPrefs; label: string; desc: string }> = [
  { key: "order_updates", label: "Sipariş güncellemeleri", desc: "Onay, teslim ve iade bildirimleri" },
  { key: "wallet_events", label: "Cüzdan hareketleri", desc: "Yükleme, iade ve komisyon bildirimleri" },
  { key: "marketing", label: "Kampanya & fırsat", desc: "İndirim kodları ve yeni ürün duyuruları" },
  { key: "abandonment", label: "Sepet hatırlatma", desc: "Ödemeden 15 dk sonra hatırlatma" },
];

function Page() {
  const router = useRouter();
  const get = useServerFn(getNotificationPrefs);
  const save = useServerFn(updateNotificationPrefs);
  const [state, setState] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["notif-prefs"], queryFn: () => get() });
  useEffect(() => { if (data) setState(data); }, [data]);

  const toggle = (k: keyof NotificationPrefs) => (v: boolean) =>
    setState((s) => (s ? { ...s, [k]: v } : s));

  const onSave = async () => {
    if (!state) return;
    setSaving(true);
    try {
      await save({ data: state });
      toast.success("[✓] tercihler kaydedildi");
      router.invalidate();
    } catch (e) {
      toast.error(`[!] ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-12">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild size="sm" variant="ghost" className="font-mono">
          <Link to="/hesabim"><ArrowLeft className="mr-1 h-4 w-4" /> hesabım</Link>
        </Button>
      </div>
      <div className="flex items-center gap-2 mb-6">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="font-mono text-2xl neon-text">Bildirim Tercihleri</h1>
      </div>

      {isLoading || !state ? (
        <div className="glass-card rounded-lg p-8 text-center font-mono text-sm text-muted-foreground animate-pulse">
          yükleniyor…
        </div>
      ) : (
        <div className="space-y-3">
          {ROWS.map((r) => (
            <div key={r.key} className="glass-card rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold">{r.label}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{r.desc}</div>
              </div>
              <Switch
                checked={Boolean(state[r.key])}
                onCheckedChange={toggle(r.key)}
              />
            </div>
          ))}

          <div className="glass-card rounded-lg p-4">
            <div className="font-mono text-sm font-semibold">Telegram chat ID</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              Botumuza <code>/start</code> yazdıktan sonra size verilen numarayı girin (opsiyonel).
            </div>
            <Input
              value={state.telegram_chat_id ?? ""}
              onChange={(e) => setState((s) => (s ? { ...s, telegram_chat_id: e.target.value.trim() || null } : s))}
              placeholder="örn. 123456789"
              className="mt-3 font-mono text-sm"
              inputMode="numeric"
            />
          </div>

          <Button onClick={onSave} disabled={saving} className="font-mono w-full sm:w-auto">
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "kaydediliyor…" : "> kaydet"}
          </Button>
        </div>
      )}
    </div>
  );
}
