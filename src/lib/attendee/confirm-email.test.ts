import { describe, it, expect } from "vitest";
import {
  setEmailService,
  type EmailService,
  type EmailMessage,
  type EmailSendResult,
} from "@/lib/integrations/email";
import { deliverConfirmLink } from "./confirm-email";
import { verifyConfirmToken } from "./confirm-token";

// Spy email service: records every send() so we can assert WHO was emailed and
// WHAT link they received.
function installSpy() {
  const sent: { to: string | string[]; subject: string; html: string }[] = [];
  const service: EmailService = {
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      sent.push({ to: msg.to, subject: msg.subject, html: msg.html });
      return { status: "sent", provider: "stub", id: "spy" };
    },
  };
  setEmailService(service);
  return sent;
}

const base = {
  courseId: "10",
  kind: "corsista" as const,
  subjectId: "5",
  toEmail: "student@real.it",
  name: "Anna Bianchi",
  courseName: "Certificato",
};

describe("deliverConfirmLink — live delivery (the send IS the verification)", () => {
  it("sends straight to the attendee's email", async () => {
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("student@real.it");
    expect(res.sentTo).toBe("student@real.it");
  });

  it("no known email → nothing sent, manual link returned for WhatsApp/SMS", async () => {
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base, toEmail: "" });
    expect(sent).toHaveLength(0);
    expect(res.url).toContain("/conferma/");
    expect(res.error).toBeTruthy();
  });

  it("the EMAILED link locks the email field (ch=email); the COPY link stays editable (ch=manual)", async () => {
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base });
    // Copy link → manual channel.
    const copyToken = res.url.split("/conferma/")[1];
    const copyPayload = verifyConfirmToken(copyToken);
    expect(copyPayload.ok && copyPayload.payload.ch).toBe("manual");
    // Emailed link → email channel (extract from the html).
    const m = /\/conferma\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(sent[0].html);
    expect(m).toBeTruthy();
    const mailPayload = verifyConfirmToken(m![1]);
    expect(mailPayload.ok && mailPayload.payload.ch).toBe("email");
    // Both carry an issue time (drives the spent-link closure).
    expect(mailPayload.ok && typeof mailPayload.payload.ia).toBe("number");
  });

  it("uses the branded card template (SSA badge + CTA + fallback link)", async () => {
    const sent = installSpy();
    await deliverConfirmLink({ ...base });
    const html = sent[0].html;
    expect(html).toContain("ssa-logo.png");
    expect(html).toContain("Conferma i miei dati");
    expect(html).toContain("Il pulsante non funziona?");
  });
});
