import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: new table not in generated types
        .from("notifications" as any)
        .select("id, type, title, body, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!cancelled) setItems((data ?? []) as unknown as Notification[]);
    };
    load();
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setItems((prev) => [payload.new as Notification, ...prev].slice(0, 30));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user) return null;
  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    // biome-ignore lint/suspicious/noExplicitAny: new table
    await supabase.from("notifications" as any).update({ read_at: new Date().toISOString() }).in("id", ids);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const markOne = async (id: string) => {
    // biome-ignore lint/suspicious/noExplicitAny: new table
    await supabase.from("notifications" as any).update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  };

  const clearAll = async () => {
    if (!items.length) return;
    const ids = items.map((n) => n.id);
    setItems([]);
    // biome-ignore lint/suspicious/noExplicitAny: new table
    await supabase.from("notifications" as any).delete().in("id", ids);
  };

  const deleteOne = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== id));
    // biome-ignore lint/suspicious/noExplicitAny: new table
    await supabase.from("notifications" as any).delete().eq("id", id);
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
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="font-mono text-xs text-muted-foreground">
            $ ./bildirimler ({unread} okunmamış)
          </div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="h-6 text-[10px] font-mono" onClick={markAllRead}>
              <Check className="h-3 w-3 mr-1" /> tümü okundu
            </Button>
          )}
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
                className={`px-3 py-2.5 border-b border-border/40 hover:bg-primary/5 transition ${
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
