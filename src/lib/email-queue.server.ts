import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

export type EmailQueueName = "auth_emails" | "transactional_emails";

export type EmailPayload = {
  run_id?: string;
  message_id: string;
  to: string;
  from: string;
  sender_domain?: string;
  subject: string;
  html: string;
  text: string;
  purpose?: string;
  label?: string;
  idempotency_key?: string;
  unsubscribe_token?: string;
  queued_at?: string;
};

export type QueuedEmail = {
  id: string;
  queue_name: EmailQueueName;
  payload: EmailPayload;
  attempts: number;
  created_at: string;
};

export type EmailQueueState = {
  retry_after_until: string | null;
  batch_size: number;
  send_delay_ms: number;
  auth_email_ttl_minutes: number;
  transactional_email_ttl_minutes: number;
};

let ready: Promise<void> | null = null;

export function ensureEmailQueueTables(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await mysqlQuery(`CREATE TABLE IF NOT EXISTS email_queue (
      id VARCHAR(36) PRIMARY KEY,
      queue_name VARCHAR(40) NOT NULL,
      payload LONGTEXT NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      available_at DATETIME NOT NULL,
      locked_until DATETIME NULL,
      lock_token VARCHAR(36) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_email_queue_ready (queue_name, available_at, locked_until),
      INDEX idx_email_queue_lock (lock_token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlQuery(`CREATE TABLE IF NOT EXISTS email_dead_letters (
      id VARCHAR(36) PRIMARY KEY,
      source_id VARCHAR(36) NOT NULL,
      queue_name VARCHAR(40) NOT NULL,
      payload LONGTEXT NOT NULL,
      reason VARCHAR(1000) NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_email_dlq_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlQuery(`CREATE TABLE IF NOT EXISTS email_send_log (
      id VARCHAR(36) PRIMARY KEY,
      message_id VARCHAR(100) NULL,
      template_name VARCHAR(100) NOT NULL,
      recipient_email VARCHAR(320) NOT NULL,
      status VARCHAR(20) NOT NULL,
      error_message VARCHAR(1000) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_email_log_message_status (message_id, status),
      INDEX idx_email_log_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlQuery(`CREATE TABLE IF NOT EXISTS email_send_state (
      id INT PRIMARY KEY,
      retry_after_until DATETIME NULL,
      batch_size INT NOT NULL DEFAULT 10,
      send_delay_ms INT NOT NULL DEFAULT 200,
      auth_email_ttl_minutes INT NOT NULL DEFAULT 15,
      transactional_email_ttl_minutes INT NOT NULL DEFAULT 60,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await mysqlQuery(
      `INSERT IGNORE INTO email_send_state
       (id, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes, updated_at)
       VALUES (1, 10, 200, 15, 60, NOW())`,
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function enqueueEmail(queueName: EmailQueueName, payload: EmailPayload): Promise<void> {
  await ensureEmailQueueTables();
  await mysqlQuery(
    `INSERT INTO email_queue (id, queue_name, payload, attempts, available_at, created_at)
     VALUES (?, ?, ?, 0, NOW(), NOW())`,
    [crypto.randomUUID(), queueName, JSON.stringify(payload)],
  );
}

export async function logEmailAttempt(input: {
  messageId?: string;
  templateName: string;
  recipientEmail: string;
  status: "pending" | "sent" | "failed" | "dlq";
  errorMessage?: string;
}): Promise<void> {
  await ensureEmailQueueTables();
  await mysqlQuery(
    `INSERT INTO email_send_log
       (id, message_id, template_name, recipient_email, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      crypto.randomUUID(),
      input.messageId ?? null,
      input.templateName,
      input.recipientEmail,
      input.status,
      input.errorMessage ?? null,
    ],
  );
}

export async function getEmailQueueState(): Promise<EmailQueueState> {
  await ensureEmailQueueTables();
  const state = await mysqlOne<EmailQueueState>(
    `SELECT retry_after_until, batch_size, send_delay_ms,
            auth_email_ttl_minutes, transactional_email_ttl_minutes
       FROM email_send_state WHERE id=1`,
  );
  return state ?? {
    retry_after_until: null,
    batch_size: 10,
    send_delay_ms: 200,
    auth_email_ttl_minutes: 15,
    transactional_email_ttl_minutes: 60,
  };
}

export async function claimEmailBatch(queueName: EmailQueueName, batchSize: number): Promise<QueuedEmail[]> {
  await ensureEmailQueueTables();
  const lockToken = crypto.randomUUID();
  const limit = Math.max(1, Math.min(50, Math.trunc(batchSize)));
  await mysqlQuery(
    `UPDATE email_queue
        SET lock_token=?, locked_until=DATE_ADD(NOW(), INTERVAL 30 SECOND), attempts=attempts+1
      WHERE queue_name=? AND available_at<=NOW()
        AND (locked_until IS NULL OR locked_until<NOW())
      ORDER BY created_at ASC LIMIT ${limit}`,
    [lockToken, queueName],
  );
  const rows = await mysqlQuery<{
    id: string;
    queue_name: EmailQueueName;
    payload: string;
    attempts: number | string;
    created_at: string;
  }>(
    `SELECT id, queue_name, payload, attempts, created_at
       FROM email_queue WHERE lock_token=? ORDER BY created_at ASC`,
    [lockToken],
  );
  const claimed: QueuedEmail[] = [];
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as EmailPayload;
      claimed.push({ ...row, attempts: Number(row.attempts) || 0, payload });
    } catch {
      await moveEmailToDlq(
        { ...row, attempts: Number(row.attempts) || 0, payload: {} as EmailPayload },
        "Invalid queue payload",
        row.payload,
      );
    }
  }
  return claimed;
}

export async function wasEmailSent(messageId: string): Promise<boolean> {
  const row = await mysqlOne<{ id: string }>(
    "SELECT id FROM email_send_log WHERE message_id=? AND status='sent' LIMIT 1",
    [messageId],
  );
  return Boolean(row);
}

export async function deleteQueuedEmail(id: string): Promise<void> {
  await mysqlQuery("DELETE FROM email_queue WHERE id=?", [id]);
}

export async function releaseQueuedEmail(id: string, delaySeconds = 30): Promise<void> {
  const delay = Math.max(1, Math.min(3600, Math.trunc(delaySeconds)));
  await mysqlQuery(
    `UPDATE email_queue
        SET lock_token=NULL, locked_until=NULL, available_at=DATE_ADD(NOW(), INTERVAL ${delay} SECOND)
      WHERE id=?`,
    [id],
  );
}

export async function moveEmailToDlq(
  message: QueuedEmail,
  reason: string,
  rawPayload?: string,
): Promise<void> {
  await mysqlQuery(
    `INSERT INTO email_dead_letters (id, source_id, queue_name, payload, reason, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [
      crypto.randomUUID(),
      message.id,
      message.queue_name,
      rawPayload ?? JSON.stringify(message.payload),
      reason.slice(0, 1000),
    ],
  );
  await logEmailAttempt({
    messageId: message.payload.message_id,
    templateName: message.payload.label || message.queue_name,
    recipientEmail: message.payload.to || "unknown",
    status: "dlq",
    errorMessage: reason.slice(0, 1000),
  });
  await deleteQueuedEmail(message.id);
}

export async function setEmailCooldown(until: Date): Promise<void> {
  await mysqlQuery("UPDATE email_send_state SET retry_after_until=?, updated_at=NOW() WHERE id=1", [
    until.toISOString().slice(0, 19).replace("T", " "),
  ]);
}