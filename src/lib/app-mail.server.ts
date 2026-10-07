import * as React from "react";
import { render } from "@react-email/render";
import { createClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "Siber Lisans";
const SENDER_DOMAIN = "notify.siberlisans.com";
// Gönderen adresi doğrulanmış alt alan adıyla birebir eşleşsin (Gmail güven/teslim için).
const FROM_DOMAIN = "notify.siberlisans.com";

function token() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Sitenin kendi e-posta sistemiyle (notify.siberlisans.com) sıraya alır. */
export async function sendAppEmail(
  templateName: string,
  to: string,
  templateData: Record<string, unknown>,
  idempotencyKey: string,
): Promise<boolean> {
  const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const template = TEMPLATES[templateName];
  if (!url || !key || !template) {
    console.error("App mail not configured", { templateName, hasUrl: !!url, hasKey: !!key });
    return false;
  }
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = to.trim().toLowerCase();
    const messageId = crypto.randomUUID();

    const { data: suppressed, error: supErr } = await sb
      .from("suppressed_emails").select("id").eq("email", email).maybeSingle();
    if (supErr || suppressed) return false;

    const { data: existing } = await sb
      .from("email_unsubscribe_tokens").select("token, used_at").eq("email", email).maybeSingle();
    let unsub: string;
    if (existing) {
      if (existing.used_at) return false;
      unsub = existing.token;
    } else {
      await sb.from("email_unsubscribe_tokens")
        .upsert({ token: token(), email }, { onConflict: "email", ignoreDuplicates: true });
      const { data: stored } = await sb
        .from("email_unsubscribe_tokens").select("token").eq("email", email).maybeSingle();
      if (!stored) return false;
      unsub = stored.token;
    }

    const el = React.createElement(template.component, templateData);
    const html = await render(el);
    const text = await render(el, { plainText: true });
    const subject = typeof template.subject === "function" ? template.subject(templateData) : template.subject;

    await sb.from("email_send_log").insert({
      message_id: messageId, template_name: templateName, recipient_email: email, status: "pending",
    });
    const { error } = await sb.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: email,
        from: `${SITE_NAME} <info@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: templateName,
        // Her gönderim talebi benzersiz: aynı bağlantı tekrar istense de yeni mail gider.
        idempotency_key: `${idempotencyKey}-${messageId}`,
        unsubscribe_token: unsub,
        queued_at: new Date().toISOString(),
      },
    });
    if (error) {
      console.error("App mail enqueue failed", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("App mail error", e);
    return false;
  }
}
