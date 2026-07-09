import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  sendAdminNotification,
  listRecentAdminNotifications,
} from "@/lib/admin-notifications.functions";
import { listUsers } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Users, User as UserIcon, Mail, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/bildirimler")({
  component: NotificationsAdmin,
  head: () => ({ meta: [{ title: "Bildirimler — Admin" }] }),
});

type Target = "all" | "user" | "email";

function NotificationsAdmin() {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendAdminNotification);
  const listFn = useServerFn(listRecentAdminNotifications);
  const usersFn = useServerFn(listUsers);

  const [target, setTarget] = useState<Target>("all");
  const [userQuery, setUserQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [type, setType] = useState("admin");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => usersFn(),
    enabled: target === "user",
  });

  const { data: recent } = useQuery({
    queryKey: ["admin-notifications-recent"],
    queryFn: () => listFn(),
    refetchInterval: 15000,
  });

  const userMatches = useMemo(() => {
    if (target !== "user") return [];
    const q = userQuery.trim().toLowerCase();
    if (!q) return (users ?? []).slice(0, 8);
    return (users ?? [])
      .filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.display_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [users, userQuery, target]);

  const selectedUser = useMemo(
    () => (users ?? []).find((u) => u.id === userId) ?? null,
    [users, userId],
  );

  const totalUsers = users?.length ?? 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Başlık zorunlu");
      return;
    }
    if (target === "user" && !userId) {
      toast.error("Kullanıcı seç");
      return;
    }
    if (target === "email" && !email.trim()) {
      toast.error("E-posta gir");
      return;
    }
    if (
      target === "all" &&
      !confirm("Tüm kullanıcılara bildirim gönderilsin mi?")
    ) {
      return;
    }
    setSending(true);
    try {
      const res = await sendFn({
        data: {
          target,
          userId: target === "user" ? userId : null,
          email: target === "email" ? email.trim() : null,
          type: type.trim() || "admin",
          title: title.trim(),
          body: body.trim() || null,
          link: link.trim() || null,
        },
      });
      toast.success(`${res.count} bildirim gönderildi`);
      setTitle("");
      setBody("");
      setLink("");
      qc.invalidateQueries({ queryKey: ["admin-notifications-recent"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-xl sm:text-2xl neon-text">Bildirimler</h1>
        <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 font-mono text-xs text-primary">
          <Bell className="inline h-3 w-3 mr-1" /> hedef havuzu: {totalUsers}
        </span>
      </div>

      <form onSubmit={submit} className="mt-5 glass-card rounded-lg p-4 space-y-4">
        {/* Target selector */}
        <div>
          <div className="text-xs font-mono text-muted-foreground mb-2">hedef</div>
          <div className="grid grid-cols-3 gap-2">
            <TargetBtn
              active={target === "all"}
              onClick={() => setTarget("all")}
              icon={<Users className="h-3.5 w-3.5" />}
              label="tümü"
            />
            <TargetBtn
              active={target === "user"}
              onClick={() => setTarget("user")}
              icon={<UserIcon className="h-3.5 w-3.5" />}
              label="kullanıcı"
            />
            <TargetBtn
              active={target === "email"}
              onClick={() => setTarget("email")}
              icon={<Mail className="h-3.5 w-3.5" />}
              label="e-posta"
            />
          </div>
        </div>

        {target === "user" && (
          <div>
            <div className="text-xs font-mono text-muted-foreground mb-1">
              kullanıcı ara {selectedUser && `· seçili: ${selectedUser.email ?? selectedUser.id}`}
            </div>
            <Input
              value={userQuery}
              onChange={(e) => {
                setUserQuery(e.target.value);
                setUserId(null);
              }}
              placeholder="e-posta veya isim…"
              className="h-9 font-mono text-xs"
            />
            <div className="mt-2 space-y-1 max-h-52 overflow-auto">
              {userMatches.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => {
                    setUserId(u.id);
                    setUserQuery(u.email ?? u.display_name ?? "");
                  }}
                  className={`w-full text-left rounded border px-2 py-1.5 font-mono text-xs ${
                    userId === u.id
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/60 bg-background/40 hover:border-primary/40"
                  }`}
                >
                  <div className="truncate">{u.email ?? "—"}</div>
                  {u.display_name && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      {u.display_name}
                    </div>
                  )}
                </button>
              ))}
              {userMatches.length === 0 && (
                <div className="text-xs text-muted-foreground font-mono">
                  eşleşme yok
                </div>
              )}
            </div>
          </div>
        )}

        {target === "email" && (
          <div>
            <div className="text-xs font-mono text-muted-foreground mb-1">e-posta</div>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@mail.com"
              className="h-9 font-mono text-xs"
              type="email"
            />
          </div>
        )}

        <div className="grid sm:grid-cols-[140px,1fr] gap-3">
          <div>
            <div className="text-xs font-mono text-muted-foreground mb-1">tür</div>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="admin"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground mb-1">başlık *</div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Duyuru başlığı"
              className="h-9 font-mono text-xs"
              maxLength={200}
            />
          </div>
        </div>

        <div>
          <div className="text-xs font-mono text-muted-foreground mb-1">mesaj</div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Bildirim içeriği…"
            rows={4}
            className="font-mono text-xs"
            maxLength={2000}
          />
        </div>

        <div>
          <div className="text-xs font-mono text-muted-foreground mb-1">link (opsiyonel)</div>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/kampanyalar veya https://…"
            className="h-9 font-mono text-xs"
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-border/40">
          <Button type="submit" disabled={sending} className="font-mono text-xs">
            <Send className="h-3 w-3 mr-1" />
            {sending ? "gönderiliyor…" : "gönder"}
          </Button>
        </div>
      </form>

      <div className="mt-6">
        <h2 className="font-mono text-sm text-muted-foreground mb-2">son bildirimler</h2>
        <div className="glass-card rounded-lg p-3 space-y-1 max-h-96 overflow-auto">
          {(recent ?? []).length === 0 && (
            <div className="text-center text-muted-foreground font-mono py-4 text-xs">
              henüz bildirim yok
            </div>
          )}
          {(recent ?? []).map((n) => (
            <div
              key={n.id}
              className="rounded border border-border/60 bg-background/40 p-2 font-mono text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-primary truncate">{n.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(n.created_at).toLocaleString("tr-TR")}
                </span>
              </div>
              {n.body && (
                <div className="mt-1 text-muted-foreground truncate">{n.body}</div>
              )}
              <div className="mt-1 text-[10px] text-muted-foreground/70">
                {n.type} · user {n.user_id.slice(0, 8)}
                {n.link ? ` · ${n.link}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded border px-2 py-2 font-mono text-xs transition ${
        active
          ? "border-primary/60 bg-primary/10 text-primary neon-text"
          : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
