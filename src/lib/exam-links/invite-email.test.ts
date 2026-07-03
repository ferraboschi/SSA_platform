import { describe, it, expect } from "vitest";
import {
  setEmailService,
  type EmailService,
  type EmailMessage,
  type EmailSendResult,
} from "@/lib/integrations/email";
import { deliverExamInvite } from "./invite-email";

// Educator-triggered exam invites deliver LIVE (owner decision, like the
// confirm-data emails). Only automated RESULT emails keep a go-live gate.
function installSpy(status: EmailSendResult["status"] = "sent") {
  const sent: { to: string | string[]; subject: string }[] = [];
  const service: EmailService = {
    async send(msg: EmailMessage): Promise<EmailSendResult> {
      sent.push({ to: msg.to, subject: msg.subject });
      return { status, provider: "stub", id: "spy" };
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

describe("deliverExamInvite — live delivery", () => {
  it("emails the student's confirmed address, no [PROVA] marker", async () => {
    const sent = installSpy();
    const res = await deliverExamInvite({ ...base });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("student@real.it");
    expect(sent[0].subject).toBe("Esame finale — SSA");
    expect(res.sentTo).toBe("student@real.it");
    expect(res.url).toContain("/esame/");
  });

  it("no known email: emails nobody, returns the link for WhatsApp/SMS", async () => {
    const sent = installSpy();
    const res = await deliverExamInvite({ ...base, toEmail: "" });
    expect(sent).toHaveLength(0);
    expect(res.sentTo).toBeUndefined();
    expect(res.url).toContain("/esame/");
    expect(res.error).toBeTruthy();
  });

  it("provider not configured (skipped): honest error + link fallback", async () => {
    installSpy("skipped");
    const res = await deliverExamInvite({ ...base });
    expect(res.sentTo).toBeUndefined();
    expect(res.error).toContain("Email non configurata");
    expect(res.url).toContain("/esame/");
  });
});
