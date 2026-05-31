// Shared integration types.

export type IntegrationId =
  | "shopify"
  | "airtable"
  | "dropbox"
  | "resend"
  | "supabase";

export type IntegrationMode = "live" | "stub";

export interface IntegrationStatus {
  id: IntegrationId;
  label: string;
  /** What this integration is responsible for, in one line. */
  purpose: string;
  configured: boolean;
  mode: IntegrationMode;
  /** New integration not present in the original production app. */
  isNew?: boolean;
}

/** Raised by a stub when a live-only operation is attempted unconfigured. */
export class IntegrationNotConfiguredError extends Error {
  constructor(public integration: IntegrationId) {
    super(
      `Integration "${integration}" is not configured. Set its environment variables to enable live mode.`,
    );
    this.name = "IntegrationNotConfiguredError";
  }
}
