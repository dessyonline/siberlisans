import { sendLovableEmail } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'
import {
  claimEmailBatch,
  deleteQueuedEmail,
  getEmailQueueState,
  logEmailAttempt,
  moveEmailToDlq,
  releaseQueuedEmail,
  setEmailCooldown,
  wasEmailSent,
  type EmailQueueName,
} from '@/lib/email-queue.server'

const MAX_RETRIES = 5

function isStatus(error: unknown, status: number): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === status
  }
  return error instanceof Error && error.message.includes(String(status))
}

function retryAfter(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

export const Route = createFileRoute('/lovable/email/queue/process')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY
        const workerSecret = process.env.EMAIL_QUEUE_SECRET
        if (!apiKey || !workerSecret) {
          console.error('Missing email queue configuration')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const authHeader = request.headers.get('Authorization')
        if (authHeader !== `Bearer ${workerSecret}`) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const state = await getEmailQueueState()
        if (state.retry_after_until && new Date(state.retry_after_until) > new Date()) {
          return Response.json({ skipped: true, reason: 'rate_limited' })
        }
        const ttl: Record<EmailQueueName, number> = {
          auth_emails: Number(state.auth_email_ttl_minutes) || 15,
          transactional_emails: Number(state.transactional_email_ttl_minutes) || 60,
        }
        let processed = 0

        for (const queue of ['auth_emails', 'transactional_emails'] as const) {
          const messages = await claimEmailBatch(queue, Number(state.batch_size) || 10)
          for (let index = 0; index < messages.length; index++) {
            const message = messages[index]
            const payload = message.payload
            const queuedAt = payload.queued_at || message.created_at
            if (Date.now() - new Date(queuedAt).getTime() > ttl[queue] * 60_000) {
              await moveEmailToDlq(message, `TTL exceeded (${ttl[queue]} minutes)`)
              continue
            }
            if (message.attempts > MAX_RETRIES) {
              await moveEmailToDlq(message, `Max retries (${MAX_RETRIES}) exceeded`)
              continue
            }
            if (payload.message_id && await wasEmailSent(payload.message_id)) {
              await deleteQueuedEmail(message.id)
              continue
            }

            try {
              await sendLovableEmail(payload, { apiKey, sendUrl: process.env.LOVABLE_SEND_URL })
              await logEmailAttempt({
                messageId: payload.message_id,
                templateName: payload.label || queue,
                recipientEmail: payload.to,
                status: 'sent',
              })
              await deleteQueuedEmail(message.id)
              processed++
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              await logEmailAttempt({
                messageId: payload.message_id,
                templateName: payload.label || queue,
                recipientEmail: payload.to,
                status: 'failed',
                errorMessage: errorMessage.slice(0, 1000),
              })
              if (isStatus(error, 403)) {
                await moveEmailToDlq(message, errorMessage)
                return Response.json({ processed, stopped: 'forbidden' })
              }
              const delay = isStatus(error, 429) ? retryAfter(error) : 30
              await releaseQueuedEmail(message.id, delay)
              if (isStatus(error, 429)) {
                await setEmailCooldown(new Date(Date.now() + delay * 1000))
                return Response.json({ processed, stopped: 'rate_limited' })
              }
            }

            if (index < messages.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, Number(state.send_delay_ms) || 200))
            }
          }
        }
        return Response.json({ processed })
      },
    },
  },
})
