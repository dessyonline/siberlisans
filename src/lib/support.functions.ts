import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth, requireAdmin } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, bool } from "./mysql.server";

export type SupportTicket = {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  last_message_at: string;
  last_message_by_admin: boolean;
  unread_for_user: number;
  unread_for_admin: number;
  created_at: string;
  user_email?: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
};

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type RawTicket = Omit<SupportTicket, "last_message_by_admin"> & { last_message_by_admin: unknown };

function mapTicket(r: RawTicket): SupportTicket {
  return {
    ...r,
    status: (r.status ?? "open") as SupportTicket["status"],
    priority: (r.priority ?? "normal") as SupportTicket["priority"],
    last_message_by_admin: bool(r.last_message_by_admin),
    unread_for_user: Number(r.unread_for_user ?? 0),
    unread_for_admin: Number(r.unread_for_admin ?? 0),
  };
}

const TICKET_COLS = `id, user_id, subject, status, priority, last_message_at,
  last_message_by_admin, unread_for_user, unread_for_admin, created_at`;

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<SupportTicket[]> => {
    const rows = await mysqlQuery<RawTicket>(
      `SELECT ${TICKET_COLS} FROM support_tickets WHERE user_id=? ORDER BY last_message_at DESC`,
      [context.userId],
    );
    return rows.map(mapTicket);
  });

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((d: unknown) =>
    z.object({ status: z.enum(["all", "open", "pending", "closed"]).default("all") }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<SupportTicket[]> => {
    const where = data.status === "all" ? "" : "WHERE t.status=?";
    const params = data.status === "all" ? [] : [data.status];
    const rows = await mysqlQuery<RawTicket>(
      `SELECT ${TICKET_COLS.split(",").map((c) => `t.${c.trim()}`).join(", ")}, p.email AS user_email
         FROM support_tickets t
         LEFT JOIN profiles p ON p.id = t.user_id
         ${where}
        ORDER BY t.last_message_at DESC
        LIMIT 300`,
      params,
    );
    return rows.map(mapTicket);
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        subject: z.string().trim().min(2).max(160),
        body: z.string().trim().min(1).max(4000),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const id = crypto.randomUUID();
    const now = ts();
    await mysqlQuery(
      `INSERT INTO support_tickets
        (id,user_id,subject,status,priority,last_message_at,last_message_by_admin,unread_for_user,unread_for_admin,created_at,updated_at)
       VALUES (?,?,?,'open',?,?,0,0,1,?,?)`,
      [id, context.userId, data.subject, data.priority, now, now, now],
    );
    await mysqlQuery(
      "INSERT INTO support_messages (id,ticket_id,sender_id,is_admin,body,created_at) VALUES (?,?,?,0,?,?)",
      [crypto.randomUUID(), id, context.userId, data.body, now],
    );
    return { ok: true as const, id };
  });

async function assertTicketAccess(ticketId: string, userId: string, isAdmin: boolean) {
  const t = await mysqlOne<{ id: string; user_id: string; status: string }>(
    "SELECT id,user_id,status FROM support_tickets WHERE id=? LIMIT 1",
    [ticketId],
  );
  if (!t) throw new Error("Bilet bulunamadı.");
  if (!isAdmin && t.user_id !== userId) throw new Error("Bu bilete erişimin yok.");
  return t;
}

export const listTicketMessages = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ ticketId: z.string().max(64) }).parse(d))
  .handler(async ({ data, context }): Promise<SupportMessage[]> => {
    await assertTicketAccess(data.ticketId, context.userId, context.isAdmin);
    const rows = await mysqlQuery<SupportMessage & { is_admin: unknown }>(
      `SELECT id, ticket_id, sender_id, is_admin, body, created_at
         FROM support_messages WHERE ticket_id=? ORDER BY created_at ASC`,
      [data.ticketId],
    );
    return rows.map((m) => ({ ...m, is_admin: bool(m.is_admin) }));
  });

export const sendTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z
      .object({
        ticketId: z.string().max(64),
        body: z.string().trim().min(1).max(4000),
        asAdmin: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ticket = await assertTicketAccess(data.ticketId, context.userId, context.isAdmin);
    const asAdmin = data.asAdmin && context.isAdmin;
    if (!asAdmin && ticket.status === "closed") throw new Error("Bilet kapalı.");
    const now = ts();
    await mysqlQuery(
      "INSERT INTO support_messages (id,ticket_id,sender_id,is_admin,body,created_at) VALUES (?,?,?,?,?,?)",
      [crypto.randomUUID(), data.ticketId, context.userId, asAdmin ? 1 : 0, data.body, now],
    );
    if (asAdmin) {
      await mysqlQuery(
        `UPDATE support_tickets
            SET last_message_at=?, last_message_by_admin=1,
                unread_for_user=COALESCE(unread_for_user,0)+1,
                status=CASE WHEN status='closed' THEN status ELSE 'pending' END,
                updated_at=?
          WHERE id=?`,
        [now, now, data.ticketId],
      );
      await mysqlQuery(
        "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
        [
          crypto.randomUUID(),
          ticket.user_id,
          "support_reply",
          "Destek yanıtı",
          data.body.slice(0, 160),
          "/destek",
          now,
        ],
      );
    } else {
      await mysqlQuery(
        `UPDATE support_tickets
            SET last_message_at=?, last_message_by_admin=0,
                unread_for_admin=COALESCE(unread_for_admin,0)+1,
                status=CASE WHEN status='closed' THEN status ELSE 'open' END,
                updated_at=?
          WHERE id=?`,
        [now, now, data.ticketId],
      );
    }
    return { ok: true as const };
  });

export const markTicketRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ ticketId: z.string().max(64), asAdmin: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTicketAccess(data.ticketId, context.userId, context.isAdmin);
    const col = data.asAdmin && context.isAdmin ? "unread_for_admin" : "unread_for_user";
    await mysqlQuery(`UPDATE support_tickets SET ${col}=0 WHERE id=?`, [data.ticketId]);
    return { ok: true as const };
  });

export const setTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) =>
    z.object({ ticketId: z.string().max(64), status: z.enum(["open", "pending", "closed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTicketAccess(data.ticketId, context.userId, context.isAdmin);
    await mysqlQuery("UPDATE support_tickets SET status=?, updated_at=? WHERE id=?", [
      data.status,
      ts(),
      data.ticketId,
    ]);
    return { ok: true as const };
  });
