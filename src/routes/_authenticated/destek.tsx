import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyTickets,
  createTicket,
  listTicketMessages,
  sendTicketMessage,
  markTicketRead,
  setTicketStatus,
} from "@/lib/support.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, Send, ArrowLeft, MessageCircle, Circle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/destek")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Destek — SiberPHP" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DestekPage,
});

type Ticket = {
  id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  last_message_at: string;
  last_message_by_admin: boolean;
  unread_for_user: number;
  created_at: string;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
};

const STATUS_META: Record<Ticket["status"], { l: string; c: string }> = {
  open: { l: "açık", c: "text-primary" },
  pending: { l: "yanıt bekliyor", c: "text-cyan-400" },
  closed: { l: "kapalı", c: "text-muted-foreground" },
};

function DestekPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const listTickets = useServerFn(listMyTickets);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support-tickets", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => (await listTickets()) as unknown as Ticket[],
  });

  const active = useMemo(() => tickets?.find((t) => t.id === activeId) ?? null, [tickets, activeId]);

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 md:px-4">
      <div className="font-mono text-xs text-primary/70 mb-1">$ ./support --live</div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-mono text-2xl neon-text">Destek</h1>
        {!newOpen && !active && (
          <Button onClick={() => setNewOpen(true)} className="font-mono">
            <Plus className="h-4 w-4 mr-1" /> yeni bilet
          </Button>
        )}
      </div>

      {newOpen && (
        <NewTicketForm
          onCancel={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            setActiveId(id);
            qc.invalidateQueries({ queryKey: ["support-tickets", user?.id] });
          }}
        />
      )}

      {!newOpen && (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          {/* List */}
          <aside className={`glass-card rounded-lg border border-border/60 overflow-hidden ${active ? "hidden md:block" : ""}`}>
            <div className="px-3 py-2 border-b border-border/60 font-mono text-[11px] text-muted-foreground">
              biletlerim ({tickets?.length ?? 0})
            </div>
            {isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
            ) : !tickets || tickets.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Henüz biletin yok.
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => setNewOpen(true)} className="font-mono">
                    <Plus className="h-3 w-3 mr-1" /> ilk bileti aç
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 max-h-[70vh] overflow-y-auto">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveId(t.id)}
                      className={`w-full text-left px-3 py-3 hover:bg-primary/5 transition ${activeId === t.id ? "bg-primary/10" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium line-clamp-1">{t.subject}</span>
                        {t.unread_for_user > 0 && (
                          <span className="shrink-0 text-[10px] font-mono bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                            {t.unread_for_user}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
                        <Circle className={`h-2 w-2 fill-current ${STATUS_META[t.status].c}`} />
                        <span className={STATUS_META[t.status].c}>{STATUS_META[t.status].l}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-muted-foreground">{new Date(t.last_message_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Thread */}
          <section className={`${!active ? "hidden md:flex md:items-center md:justify-center glass-card rounded-lg border border-border/60 min-h-[300px]" : ""}`}>
            {active ? (
              <ThreadView
                ticket={active}
                isAdminView={false}
                onBack={() => setActiveId(null)}
                onChanged={() => qc.invalidateQueries({ queryKey: ["support-tickets", user?.id] })}
              />
            ) : (
              <div className="text-center text-sm text-muted-foreground p-8">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Bir bilet seç ya da yeni bir tane aç.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function NewTicketForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Ticket["priority"]>("normal");
  const [loading, setLoading] = useState(false);
  const create = useServerFn(createTicket);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (subject.trim().length < 2) return toast.error("Konu en az 2 karakter olmalı.");
    if (body.trim().length < 1) return toast.error("Mesaj boş olamaz.");
    setLoading(true);
    try {
      const res = await create({ data: { subject: subject.trim(), body: body.trim(), priority } });
      toast.success("Bilet açıldı.");
      onCreated(res.id);
    } catch (err) {
      toast.error((err as Error).message || "Bilet açılamadı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-card rounded-lg p-5 border border-primary/30 space-y-4 max-w-2xl">
      <div className="font-mono text-xs text-primary/70">$ ./ticket --new</div>
      <label className="block">
        <span className="text-xs font-mono text-muted-foreground">Konu</span>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} placeholder="Kısa özet" className="mt-1" />
      </label>
      <label className="block">
        <span className="text-xs font-mono text-muted-foreground">Öncelik</span>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Ticket["priority"])}
          className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm font-mono"
        >
          <option value="low">düşük</option>
          <option value="normal">normal</option>
          <option value="high">yüksek</option>
          <option value="urgent">acil</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-mono text-muted-foreground">Mesaj</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="Yaşadığın durumu detaylı anlat..."
          className="mt-1 w-full rounded-md bg-background border border-border px-3 py-2 text-sm resize-none focus:border-primary focus:outline-none"
        />
        <span className="text-[10px] text-muted-foreground">{body.length}/4000</span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="font-mono">iptal</Button>
        <Button type="submit" disabled={loading} className="font-mono">
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} gönder
        </Button>
      </div>
    </form>
  );
}

export function ThreadView({
  ticket,
  isAdminView,
  onBack,
  onChanged,
}: {
  ticket: Ticket & { user_id?: string };
  isAdminView: boolean;
  onBack?: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const listMsgs = useServerFn(listTicketMessages);
  const sendMsg = useServerFn(sendTicketMessage);
  const markRead = useServerFn(markTicketRead);
  const setStatus = useServerFn(setTicketStatus);

  const { data: messages } = useQuery({
    queryKey: ["support-messages", ticket.id],
    refetchInterval: 15_000,
    queryFn: async () =>
      (await listMsgs({ data: { ticketId: ticket.id } })) as unknown as Message[],
  });

  // Okundu işaretle
  useEffect(() => {
    if (!user) return;
    markRead({ data: { ticketId: ticket.id, asAdmin: isAdminView } })
      .then(() => onChanged?.())
      .catch(() => {});
  }, [ticket.id, isAdminView, user, onChanged, markRead]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !body.trim()) return;
    if (ticket.status === "closed" && !isAdminView) return toast.error("Bilet kapalı.");
    setSending(true);
    try {
      const { error } = await supabase
        .from("support_messages" as never)
        .insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          is_admin: isAdminView,
          body: body.trim(),
        } as never);
      if (error) throw error;
      setBody("");
      qc.invalidateQueries({ queryKey: ["support-messages", ticket.id] });
      onChanged?.();
    } catch (err) {
      toast.error((err as Error).message || "Gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const toggleClose = async () => {
    const newStatus = ticket.status === "closed" ? "open" : "closed";
    const { error } = await supabase
      .from("support_tickets" as never)
      .update({ status: newStatus } as never)
      .eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success(newStatus === "closed" ? "Bilet kapatıldı." : "Bilet açıldı.");
    onChanged?.();
    qc.invalidateQueries({ queryKey: ["support-messages", ticket.id] });
  };

  return (
    <div className="glass-card rounded-lg border border-border/60 flex flex-col w-full min-h-[500px] max-h-[75vh]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="md:hidden text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="font-mono text-sm truncate">{ticket.subject}</div>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <Circle className={`h-2 w-2 fill-current ${STATUS_META[ticket.status].c}`} />
              <span className={STATUS_META[ticket.status].c}>{STATUS_META[ticket.status].l}</span>
              <span className="text-muted-foreground">· {ticket.priority}</span>
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={toggleClose} className="font-mono text-xs">
          {ticket.status === "closed" ? "yeniden aç" : "kapat"}
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {!messages ? (
          <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">Henüz mesaj yok.</div>
        ) : (
          messages.map((m) => {
            const mine = isAdminView ? m.is_admin : !m.is_admin;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] md:max-w-[70%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words border ${
                    mine
                      ? "bg-primary/15 border-primary/40 text-foreground"
                      : m.is_admin
                        ? "bg-cyan-500/10 border-cyan-500/30 text-foreground"
                        : "bg-background/60 border-border/60 text-foreground"
                  }`}
                >
                  <div className="text-[10px] font-mono opacity-60 mb-1">
                    {m.is_admin ? "destek" : "sen"} · {new Date(m.created_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      {ticket.status === "closed" && !isAdminView ? (
        <div className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground font-mono">
          Bu bilet kapalı. Devam etmek için "yeniden aç" butonunu kullan.
        </div>
      ) : (
        <form onSubmit={send} className="border-t border-border/60 p-2 flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e as unknown as React.FormEvent); }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Mesajını yaz... (Enter = gönder, Shift+Enter = yeni satır)"
            className="flex-1 rounded-md bg-background border border-border px-3 py-2 text-sm resize-none focus:border-primary focus:outline-none"
          />
          <Button type="submit" disabled={sending || !body.trim()} className="font-mono self-end">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
