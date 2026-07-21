// Transactional email — the single seam through which ALL outbound mail flows.
//
// Notifications, exam outcomes, shipment reminders, etc. send via EmailService.
// Live mode uses Resend (REST, no SDK dependency). Unconfigured, a stub logs
// and reports `skipped` so flows that send mail still work end-to-end in dev.

import { resendConfig } from "../config";

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content (Resend's `attachments[].content` format). */
  content: string;
  contentType?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  /** Optional tag for analytics / templating (e.g. "educator-mismatch"). */
  tag?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSendResult {
  status: "sent" | "skipped";
  id?: string;
  provider: "resend" | "stub";
}

export interface EmailService {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

class ResendEmailService implements EmailService {
  constructor(
    private apiKey: string,
    private defaultFrom: string,
    private defaultReplyTo?: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from ?? this.defaultFrom,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo ?? this.defaultReplyTo,
        tags: message.tag ? [{ name: "tag", value: message.tag }] : undefined,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Resend send failed (${res.status}): ${await res.text()}`,
      );
    }
    const data = (await res.json()) as { id?: string };
    return { status: "sent", id: data.id, provider: "resend" };
  }
}

class StubEmailService implements EmailService {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const to = Array.isArray(message.to) ? message.to.join(", ") : message.to;
    console.info(`[email:stub] skipped → ${to} · "${message.subject}"`);
    return { status: "skipped", provider: "stub" };
  }
}

/** Synthetic contact addresses invented by the sync (email-less orders,
 *  multi-ticket extra seats). They are real rows in `corsisti` but must never
 *  receive actual mail — Resend would hard-bounce and hurt sender reputation. */
const PLACEHOLDER_EMAIL_RE = /@(ssa\.placeholder|placeholder\.ssa)\s*$/i;

/** Strips placeholder recipients from every message at the single outbound
 *  seam; a message left with no real recipient reports `skipped`. */
class PlaceholderFilterService implements EmailService {
  constructor(private inner: EmailService) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const recipients = (Array.isArray(message.to) ? message.to : [message.to]).filter(
      (t) => !PLACEHOLDER_EMAIL_RE.test(t),
    );
    if (recipients.length === 0) {
      console.info(`[email] skipped — placeholder-only recipient · "${message.subject}"`);
      return { status: "skipped", provider: "stub" };
    }
    return this.inner.send({ ...message, to: recipients });
  }
}

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) {
    instance = new PlaceholderFilterService(
      resendConfig.isConfigured
        ? new ResendEmailService(
            resendConfig.apiKey!,
            resendConfig.from,
            resendConfig.replyTo,
          )
        : new StubEmailService(),
    );
  }
  return instance;
}

/** Override the email service (tests). */
export function setEmailService(service: EmailService): void {
  instance = service;
}
