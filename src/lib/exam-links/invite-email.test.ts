import { describe, it, expect, afterEach } from "vitest";
import {
  setEmailService,
  type EmailService,
  type EmailMessage,
  type EmailSendResult,
} from "@/lib/integrations/email";
import { deliverExamInvite } from "./invite-email";

// Same go-live invariant as the confirmation email: with EXAM_RESULT_EMAILS_LIVE
// off, no real student may ever be emailed a personal exam link.
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
  testKey: "final" as const,
  subject: { kind: "corsista" as const, id: "42" },
  testLabel: "Esame finale",
  toEmail: "student@real.it",
  name: "Anna",
  courseName: "Certificato",
};

describe("deliverExamInvite — go-live email gate", () => {
  const prev = process.env.EXAM_RESULT_EMAILS_LIVE;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXAM_RESULT_EMAILS_LIVE;
    else process.env.EXAM_RESULT_EMAILS_LIVE = prev;
  });

  it("test mode + no fallback (educator share path): emails NOBODY, returns the personal link", async () => {
    delete process.env.EXAM_RESULT_EMAILS_LIVE;
    const sent = installSpy();
    const res = await deliverExamInvite({ ...base });
    expect(sent).toHaveLength(0);
    expect(res.live).toBe(false);
    expect(res.sentTo).toBeUndefined();
    expect(res.url).toContain("/esame/");
  });

  it("test mode + staff fallback: routes to staff, never the student", async () => {
    delete process.env.EXAM_RESULT_EMAILS_LIVE;
    const sent = installSpy();
    const res = await deliverExamInvite({ ...base, fallbackTo: "staff@ssa.it" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("staff@ssa.it");
    expect(sent[0].to).not.toBe(base.toEmail);
  });

  it("live mode: emails the student's confirmed address", async () => {
    process.env.EXAM_RESULT_EMAILS_LIVE = "true";
    const sent = installSpy();
    const res = await deliverExamInvite({ ...base });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("student@real.it");
    expect(res.sentTo).toBe("student@real.it");
    expect(res.live).toBe(true);
  });

  it("live mode + no known email: emails nobody, returns the link for WhatsApp/SMS", async () => {
    process.env.EXAM_RESULT_EMAILS_LIVE = "true";
    const sent = installSpy();
    const res = await deliverExamInvite({ ...base, toEmail: "" });
    expect(sent).toHaveLength(0);
    expect(res.url).toContain("/esame/");
    expect(res.error).toBeTruthy();
  });
});
