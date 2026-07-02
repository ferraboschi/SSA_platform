import { describe, it, expect, afterEach } from "vitest";
import {
  setEmailService,
  type EmailService,
  type EmailMessage,
  type EmailSendResult,
} from "@/lib/integrations/email";
import { deliverConfirmLink } from "./confirm-email";

// A spy email service that records every send() so we can assert WHO (if anyone)
// was emailed. The go-live invariant: with EXAM_RESULT_EMAILS_LIVE off, no real
// attendee may ever be emailed.
function installSpy() {
  const sent: { to: string | string[]; subject: string }[] = [];
  const service: EmailService = {
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      sent.push({ to: msg.to, subject: msg.subject });
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
  name: "Anna",
  courseName: "Certificato",
};

describe("deliverConfirmLink — go-live email gate", () => {
  const prev = process.env.EXAM_RESULT_EMAILS_LIVE;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXAM_RESULT_EMAILS_LIVE;
    else process.env.EXAM_RESULT_EMAILS_LIVE = prev;
  });

  it("test mode + no fallback (educator share path): emails NOBODY, returns the link", async () => {
    delete process.env.EXAM_RESULT_EMAILS_LIVE; // go-live OFF
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base }); // no fallbackTo
    expect(sent).toHaveLength(0); // the student is NEVER emailed
    expect(res.live).toBe(false);
    expect(res.sentTo).toBeUndefined();
    expect(res.url).toContain("/conferma/");
  });

  it("test mode + staff fallback (internal path): routes to staff, never the student", async () => {
    delete process.env.EXAM_RESULT_EMAILS_LIVE;
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base, fallbackTo: "staff@ssa.it" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("staff@ssa.it");
    expect(sent[0].to).not.toBe(base.toEmail);
    expect(res.sentTo).toBe("staff@ssa.it");
  });

  it("live mode: emails the student's confirmed address", async () => {
    process.env.EXAM_RESULT_EMAILS_LIVE = "true";
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("student@real.it");
    expect(res.sentTo).toBe("student@real.it");
    expect(res.live).toBe(true);
  });

  it("live mode + no known email: emails nobody, returns the link for WhatsApp/SMS", async () => {
    process.env.EXAM_RESULT_EMAILS_LIVE = "true";
    const sent = installSpy();
    const res = await deliverConfirmLink({ ...base, toEmail: "" });
    expect(sent).toHaveLength(0);
    expect(res.url).toContain("/conferma/");
    expect(res.error).toBeTruthy();
  });
});
