// Shared visual shell for attendee-facing magic-link emails (confirm-your-data,
// exam invite): white rounded card, centered SSA badge, bold serif headline,
// black pill button — the "Mamotte"-style look the owner asked for. Content is
// the caller's job (including escaping any user-controlled text); this module
// only lays it out. Server-only — it builds an absolute logo URL from the
// app's own origin (email clients need a real HTTP(S) image URL).
import "server-only";
import { appConfig } from "@/lib/integrations/config";

export interface BrandedEmailContent {
  /** Short, bold serif headline (e.g. "Conferma i tuoi dati"). Pre-escaped HTML. */
  heading: string;
  /** One or two lines under the headline. Pre-escaped HTML (may include <strong>). */
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Small print under the button — link fallback, ignore-this-email note,
   *  support contact. Pre-built HTML (e.g. joined with <br>). */
  footerHtml: string;
}

export function renderBrandedEmailHtml(c: BrandedEmailContent): string {
  const logoUrl = `${appConfig.baseUrl.replace(/\/$/, "")}/ssa-logo.png`;
  return `<div style="background:#F4F3EF;padding:40px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:24px;padding:44px 36px;text-align:center">
      <img src="${logoUrl}" width="84" height="84" alt="SSA" style="display:block;margin:0 auto 22px" />
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;margin:0 0 12px;color:#1a1a1a;font-weight:700">${c.heading}</h1>
      <p style="font-size:15px;line-height:1.55;color:#8a8a8a;margin:0 0 28px">${c.subtitle}</p>
      <a href="${c.ctaUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:14px;font-size:15px;font-weight:700">${c.ctaLabel}</a>
      <p style="font-size:12px;color:#a3a3a3;line-height:1.6;margin:28px 0 0">${c.footerHtml}</p>
    </div>
  </div>`;
}

/** Shared support-contact line for the footer (same address used elsewhere
 *  for attendee-facing assistance). */
export const SUPPORT_EMAIL = "corsi@sakesommelierassociation.it";
