import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle, Circle, ArrowLeft } from "lucide-react";
import { ThreadView } from "@/routes/_authenticated/destek";

export const Route = createFileRoute("/_authenticated/admin/destek")({
  ssr: false,
  head: () => ({ meta: [{ title: "Destek — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminDestek,
});

type AdminTicket = {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  last_message_at: string;
  unread_for_admin: number;
  created_at: string;
};

const STATUS_META: Record<AdminTicket["status"], { l: string; c: string }> = {
  open: { l: "açık", c: "text-primary" },
  pending: { l: "yanıt bekliyor", c: "text-cyan-400" },
  closed: { l: "kapalı", c: "text-muted-foreground" },
};

const PRIORITY_ORDER: Record<AdminTicket["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function AdminDestek() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "pending" | "closed">("all");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin-support-tickets", filter],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets" as never)
        .select("id,user_id,subject,status,priority,last_message_at,unread_for_admin,created_at")
        .order("last_message_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AdminTicket[];
    },
  });

  // Also fetch user emails for display
  const userIds = useMemo(() => Array.from(new Set((tickets ?? []).map((t) => t.user_id))), [tickets]);
  const { data: profiles } = useQuery({
    queryKey: ["admin-support-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email")
        .in("id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const emailMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles ?? []).forEach((p) => m.set(p.id, (p as { email?: string }).email ?? ""));
    return m;
  }, [profiles]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("admin-support-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const sorted = useMemo(() => {
    return [...(tickets ?? [])].sort((a, b) => {
      // unread first, then priority, then recent
      if ((b.unread_for_admin > 0 ? 1 : 0) - (a.unread_for_admin > 0 ? 1 : 0) !== 0) {
        return (b.unread_for_admin > 0 ? 1 : 0) - (a.unread_for_admin > 0 ? 1 : 0);
      }
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [tickets]);

  const active = useMemo(() => sorted.find((t) => t.id === activeId) ?? null, [sorted, activeId]);
  const totalUnread = useMemo(() => (tickets ?? []).reduce((s, t) => s + (t.unread_for_admin > 0 ? 1 : 0), 0), [tickets]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-xs text-primary/70">$ ./admin/support --live</div>
          <h1 className="font-mono text-2xl neon-text">Destek biletleri</h1>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          okunmamış: <span className="text-primary">{totalUnread}</span>
        </div>
      </div>

      <div className="mb-3 flex gap-1 font-mono text-xs">
        {(["all", "open", "pending", "closed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded border ${filter === f ? "bg-primary/15 border-primary/40 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
          >
            {f === "all" ? "hepsi" : STATUS_META[f].l}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[340px_1fr]">
        <aside className={`glass-card rounded-lg border border-border/60 overflow-hidden ${active ? "hidden md:block" : ""}`}>
          {isLoading ? (
            <div className="p-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
          ) : sorted.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Bilet yok.</div>
          ) : (
            <ul className="divide-y divide-border/60 max-h-[75vh] overflow-y-auto">
              {sorted.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={`w-full text-left px-3 py-3 hover:bg-primary/5 transition ${activeId === t.id ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium line-clamp-1">{t.subject}</span>
                      {t.unread_for_admin > 0 && (
                        <span className="shrink-0 text-[10px] font-mono bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                          {t.unread_for_admin}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{emailMap.get(t.user_id) || t.user_id.slice(0, 8)}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                      <Circle className={`h-2 w-2 fill-current ${STATUS_META[t.status].c}`} />
                      <span className={STATUS_META[t.status].c}>{STATUS_META[t.status].l}</span>
                      <span className="text-muted-foreground">· {t.priority}</span>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="text-muted-foreground">{new Date(t.last_message_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={`${!active ? "hidden md:flex md:items-center md:justify-center glass-card rounded-lg border border-border/60 min-h-[300px]" : ""}`}>
          {active ? (
            <div className="w-full">
              <div className="md:hidden mb-2">
                <button onClick={() => setActiveId(null)} className="text-xs font-mono text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> listeye dön
                </button>
              </div>
              <div className="mb-2 text-xs font-mono text-muted-foreground">
                kullanıcı: <span className="text-foreground">{emailMap.get(active.user_id) || active.user_id}</span>
              </div>
              <ThreadView
                ticket={active}
                isAdminView={true}
                onChanged={() => qc.invalidateQueries({ queryKey: ["admin-support-tickets"] })}
              />
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground p-8">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Yanıtlamak için bir bilet seç.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
