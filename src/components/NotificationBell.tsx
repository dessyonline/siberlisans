import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Trash2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  type AppNotification,
} from "@/lib/notifications.functions";

type Notification = AppNotification;

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const listFn = useServerFn(listMyNotifications);
  const readFn = useServerFn(markNotificationRead);
  const readAllFn = useServerFn(markAllNotificationsRead);
  const delFn = useServerFn(deleteNotification);
  const delAllFn = useServerFn(deleteAllNotifications);

  const load = useCallback(async () => {
    try {
      const rows = await listFn();
      setItems((rows ?? []) as Notification[]);
    } catch {
      /* sessiz */
    }
  }, [listFn]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await load();
    };
    void tick();
    const id = setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, load]);

  if (!user) return null;
  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!unread) return;
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await readAllFn({ data: undefined as never }).catch(() => {});
  };

  const markOne = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)));
    await readFn({ data: { id } }).catch(() => {});
  };

  const clearAll = async () => {
    if (!items.length) return;
    setItems([]);
    await delAllFn({ data: undefined as never }).catch(() => {});
  };

  const deleteOne = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== id));
    await delFn({ data: { id } }).catch(() => {});
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Bildirimler"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-mono font-bold text-primary-foreground neon-glow">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 gap-2">
          <div className="font-mono text-xs text-muted-foreground truncate">
            $ ./bildirimler ({unread} okunmamış)
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {unread > 0 && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] font-mono" onClick={markAllRead}>
                <Check className="h-3 w-3 mr-1" /> okundu
              </Button>
            )}
            {items.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] font-mono text-destructive hover:text-destructive"
                onClick={clearAll}
                title="Tüm bildirimleri sil"
              >
                <Trash2 className="h-3 w-3 mr-1" /> temizle
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {items.length === 0 && (
            <div className="py-10 text-center text-xs font-mono text-muted-foreground">
              henüz bildirim yok
            </div>
          )}
          {items.map((n) => {
            const inner = (
              <div
                className={`group px-3 py-2.5 border-b border-border/40 hover:bg-primary/5 transition ${
                  n.read_at ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary neon-glow shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-foreground">{n.title}</div>
                    {n.body && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>
                    )}
                    <div className="text-[10px] text-muted-foreground/70 font-mono mt-1">
                      {new Date(n.created_at).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Bildirimi sil"
                    onClick={(e) => deleteOne(n.id, e)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );

            return n.link ? (
              <Link
                key={n.id}
                to={n.link}
                onClick={() => {
                  markOne(n.id);
                  setOpen(false);
                }}
                className="block"
              >
                {inner}
              </Link>
            ) : (
              <div key={n.id} onClick={() => markOne(n.id)} className="cursor-pointer">
                {inner}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
