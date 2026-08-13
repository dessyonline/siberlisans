import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUsers, setUserRole, deleteUser, getUserOrders } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Search,
  Shield,
  ShieldOff,
  Trash2,
  User as UserIcon,
  ChevronDown,
  ChevronUp,
  X,
  MailCheck,
  MailX,
  Send,
} from "lucide-react";

type SortKey = "recent_signup" | "recent_login" | "top_spender" | "most_orders";

function timeAgo(iso: string | null): string {
  if (!iso) return "hiç";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}g önce`;
  const mo = Math.floor(d / 30);
  return `${mo}ay önce`;
}

export const Route = createFileRoute("/_authenticated/admin/kullanicilar")({
  component: UsersAdmin,
  head: () => ({ meta: [{ title: "Kullanıcılar — Admin" }] }),
});

function UsersAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const setRoleFn = useServerFn(setUserRole);
  const delFn = useServerFn(deleteUser);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "user">("all");
  const [sort, setSort] = useState<SortKey>("recent_signup");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (users ?? []).filter((u) => {
      const isAdmin = u.roles.includes("admin");
      if (filter === "admin" && !isAdmin) return false;
      if (filter === "user" && isAdmin) return false;
      if (!q) return true;
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "recent_login":
          return (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? "");
        case "top_spender":
          return b.stats.spend - a.stats.spend;
        case "most_orders":
          return b.stats.total - a.stats.total;
        default:
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      }
    });
    return sorted;
  }, [users, search, filter, sort]);

  const totals = useMemo(() => {
    const admins = (users ?? []).filter((u) => u.roles.includes("admin")).length;
    const oneDayAgo = Date.now() - 86400000;
    const newLast24h = (users ?? []).filter(
      (u) => new Date(u.created_at).getTime() > oneDayAgo,
    ).length;
    const activeLast24h = (users ?? []).filter(
      (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > oneDayAgo,
    ).length;
    return {
      admins,
      users: (users ?? []).length - admins,
      total: users?.length ?? 0,
      newLast24h,
      activeLast24h,
    };
  }, [users]);

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      await setRoleFn({ data: { userId, role: "admin", grant: !isAdmin } });
      toast.success(isAdmin ? "Admin rolü kaldırıldı" : "Admin yapıldı");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeUser = async (userId: string, email: string | null) => {
    if (!confirm(`${email ?? "Kullanıcı"} kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await delFn({ data: { userId } });
      toast.success("Kullanıcı silindi");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-mono text-xl sm:text-2xl neon-text">Kullanıcılar</h1>
        <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
          <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
            <Shield className="inline h-3 w-3 mr-1" />admin {totals.admins}
          </span>
          <span className="rounded border border-border/60 bg-muted/20 px-2 py-1 text-muted-foreground">
            <UserIcon className="inline h-3 w-3 mr-1" />kullanıcı {totals.users}
          </span>
          <span className="rounded border border-cyan/30 bg-cyan/5 px-2 py-1 text-cyan">
            toplam {totals.total}
          </span>
          <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
            +{totals.newLast24h} / 24s yeni
          </span>
          <span className="rounded border border-cyan/30 bg-cyan/5 px-2 py-1 text-cyan">
            {totals.activeLast24h} / 24s aktif
          </span>
        </div>
      </div>

      <div className="mt-5 glass-card rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e-posta veya isim ara…"
              className="pl-7 pr-7 h-9 font-mono text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-9 rounded border border-border bg-input px-2 font-mono text-xs"
          >
            <option value="all">tümü</option>
            <option value="admin">adminler</option>
            <option value="user">kullanıcılar</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 rounded border border-border bg-input px-2 font-mono text-xs"
          >
            <option value="recent_signup">son kayıt</option>
            <option value="recent_login">son giriş</option>
            <option value="top_spender">en çok harcayan</option>
            <option value="most_orders">en çok sipariş</option>
          </select>
        </div>


        <div className="space-y-2">
          {isLoading && (
            <div className="text-center text-muted-foreground font-mono py-6 text-sm">
              yükleniyor...
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center text-muted-foreground font-mono py-6 text-sm">
              kullanıcı bulunamadı
            </div>
          )}
          {filtered.map((u) => {
            const isAdmin = u.roles.includes("admin");
            const isOpen = expanded === u.id;
            return (
              <div key={u.id} className="rounded-lg border border-border/60 bg-background/40">
                <div className="flex items-center justify-between gap-3 p-3">
                  <button
                    onClick={() => setExpanded(isOpen ? null : u.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <div
                      className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center font-mono text-xs ${
                        isAdmin
                          ? "bg-primary/15 text-primary border border-primary/40"
                          : "bg-muted/40 text-muted-foreground border border-border"
                      }`}
                    >
                      {(u.display_name ?? u.email ?? "?")[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {u.display_name || u.email || "isimsiz"}
                        </span>
                        {isAdmin && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                            ADMIN
                          </span>
                        )}
                        {u.email_confirmed ? (
                          <MailCheck className="h-3 w-3 text-primary" aria-label="e-posta doğrulanmış" />
                        ) : (
                          <MailX className="h-3 w-3 text-warn" aria-label="e-posta doğrulanmamış" />
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="text-xs text-muted-foreground truncate font-mono">
                          {u.email ?? "—"}
                        </div>
                        {(u as any).telegram_handle && (
                          <div className="text-[10px] text-cyan/80 font-mono flex items-center gap-1">
                            <Send className="h-2.5 w-2.5" />
                            {(u as any).telegram_handle}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end shrink-0 font-mono text-[10px] text-muted-foreground">
                      <span>{u.stats.total} sipariş · ₺{u.stats.spend.toLocaleString("tr-TR")}</span>
                      <span className="text-cyan">giriş: {timeAgo(u.last_sign_in_at)}</span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-border/60 p-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                      <Stat label="toplam" value={u.stats.total} />
                      <Stat label="onaylı" value={u.stats.approved} accent="primary" />
                      <Stat label="bekleyen" value={u.stats.pending} accent="warn" />
                      <Stat
                        label="harcama"
                        value={`₺${u.stats.spend.toLocaleString("tr-TR")}`}
                        accent="cyan"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 text-[11px] font-mono text-muted-foreground">
                      <div>kayıt: {new Date(u.created_at).toLocaleString("tr-TR")}</div>
                      <div>
                        son giriş:{" "}
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleString("tr-TR")
                          : "—"}
                      </div>
                      <div className="sm:col-span-2">
                        son IP:{" "}
                        {u.last_seen_ip ? (
                          <span className="text-cyan">{u.last_seen_ip}</span>
                        ) : (
                          "—"
                        )}
                        {u.last_seen_at && (
                          <span className="ml-2 text-[10px]">
                            ({timeAgo(u.last_seen_at)})
                          </span>
                        )}
                      </div>
                    </div>
                    {u.recent_ips && u.recent_ips.length > 0 && (
                      <div className="rounded border border-border/40 p-2 space-y-1">
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                          son ip adresleri ({u.recent_ips.length})
                        </div>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {u.recent_ips.map((ip) => (
                            <div
                              key={ip.ip}
                              className="flex items-center justify-between gap-2 text-[11px] font-mono"
                            >
                              <span className="text-cyan truncate">{ip.ip}</span>
                              <span className="text-muted-foreground shrink-0">
                                {ip.count}× · {timeAgo(ip.last_seen)}
                                {ip.vpn && (
                                  <span className="ml-1 text-warn">VPN</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <UserOrders userId={u.id} />
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleAdmin(u.id, isAdmin)}
                        className="font-mono text-xs"
                      >
                        {isAdmin ? (
                          <>
                            <ShieldOff className="h-3 w-3 mr-1" />admin'i kaldır
                          </>
                        ) : (
                          <>
                            <Shield className="h-3 w-3 mr-1" />admin yap
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeUser(u.id, u.email)}
                        className="font-mono text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />sil
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "primary" | "warn" | "cyan";
}) {
  const cls =
    accent === "primary"
      ? "text-primary border-primary/40"
      : accent === "warn"
      ? "text-warn border-warn/40"
      : accent === "cyan"
      ? "text-cyan border-cyan/40"
      : "text-foreground border-border";
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function UserOrders({ userId }: { userId: string }) {
  const fn = useServerFn(getUserOrders);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-orders", userId],
    queryFn: () => fn({ data: { userId } }),
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground font-mono">siparişler yükleniyor…</div>;
  }
  if (!data || data.length === 0) {
    return <div className="text-xs text-muted-foreground font-mono">sipariş yok</div>;
  }
  return (
    <div className="max-h-48 overflow-auto space-y-1">
      {data.map((o) => (
        <div
          key={o.id}
          className="flex items-center justify-between gap-2 text-xs font-mono border border-border/40 rounded px-2 py-1.5"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate">{o.product?.name ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground">
              {o.reference_code} ·{" "}
              {new Date(o.created_at).toLocaleDateString("tr-TR")}
            </div>
          </div>
          <span className="text-primary shrink-0">
            ₺{Number(o.price_try).toLocaleString("tr-TR")}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
              o.status === "approved"
                ? "text-primary border-primary/40 bg-primary/5"
                : o.status === "rejected"
                ? "text-destructive border-destructive/40 bg-destructive/5"
                : "text-muted-foreground border-border/60"
            }`}
          >
            {o.status}
          </span>
        </div>
      ))}
    </div>
  );
}
