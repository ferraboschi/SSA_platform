// Integration configuration — env-driven, read lazily, never throws at import.
//
// Each integration reads its credentials here. Absent credentials mean the
// integration runs in "stub" mode (no-op / mock) rather than failing, so the
// app boots and is fully navigable before any external service is wired up.

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export const shopifyConfig = {
  get storeDomain() {
    return env("SHOPIFY_STORE_DOMAIN");
  },
  get adminToken() {
    return env("SHOPIFY_ADMIN_TOKEN");
  },
  get storefrontToken() {
    return env("SHOPIFY_STOREFRONT_TOKEN");
  },
  get isConfigured() {
    return Boolean(this.storeDomain && this.adminToken);
  },
};

// Second Shopify store — "Sake Company" (supplier): exam sakes, template
// products, thresholds. Separate credentials from the SSA storefront.
export const sakeCompanyConfig = {
  get storeDomain() {
    return env("SAKECOMPANY_STORE_DOMAIN");
  },
  get adminToken() {
    return env("SAKECOMPANY_ADMIN_TOKEN");
  },
  get isConfigured() {
    return Boolean(this.storeDomain && this.adminToken);
  },
};

export const airtableConfig = {
  get apiKey() {
    return env("AIRTABLE_API_KEY");
  },
  get baseId() {
    return env("AIRTABLE_BASE_ID");
  },
  get isConfigured() {
    return Boolean(this.apiKey && this.baseId);
  },
};

export const dropboxConfig = {
  get accessToken() {
    return env("DROPBOX_ACCESS_TOKEN");
  },
  get appKey() {
    return env("DROPBOX_APP_KEY");
  },
  get appSecret() {
    return env("DROPBOX_APP_SECRET");
  },
  get refreshToken() {
    return env("DROPBOX_REFRESH_TOKEN");
  },
  get rootPath() {
    return env("DROPBOX_ROOT_PATH") ?? "/SSA";
  },
  get isConfigured() {
    return Boolean(this.accessToken || this.refreshToken);
  },
};

export const appConfig = {
  /** Absolute origin used to build links in outbound email. */
  get baseUrl() {
    return env("APP_BASE_URL") ?? "http://localhost:3210";
  },
  /**
   * When `true` the in-memory DataSource loads the demo seed (prototype-ported
   * fake data). Set `USE_SEED=false` to wipe — the app then runs against a
   * real backend (Supabase) when configured, or empty in-memory otherwise.
   * Default `true` in dev so a fresh checkout has navigable data.
   */
  get useSeed() {
    const v = env("USE_SEED");
    if (v === undefined) return true;
    return v.toLowerCase() !== "false" && v !== "0";
  },
};

export const examEmailConfig = {
  /**
   * GO-LIVE SWITCH for exam-result emails. When `false` (default) a result email
   * routes to the acting staff member instead of the student — a pre-launch safety
   * so no test send ever reaches a real corsista. Set `EXAM_RESULT_EMAILS_LIVE=true`
   * on the server at go-live to deliver results straight to students.
   */
  get live() {
    return env("EXAM_RESULT_EMAILS_LIVE") === "true";
  },
};

export const resendConfig = {
  get apiKey() {
    return env("RESEND_API_KEY");
  },
  get from() {
    // Default sender uses the VERIFIED Resend domain. Only `mail.sakesommelierassociation.it`
    // is verified (the bare apex domain is NOT) — sending from an unverified
    // domain makes Resend reject the request, so the subdomain is required.
    const configured = env("RESEND_FROM") ?? "SSA <no-reply@mail.sakesommelierassociation.it>";
    // Defensive: if RESEND_FROM (env) still points at the unverified apex domain,
    // rewrite it to the verified subdomain so mail isn't silently rejected.
    return configured.replace(
      /@sakesommelierassociation\.it/gi,
      "@mail.sakesommelierassociation.it",
    );
  },
  get replyTo() {
    return env("RESEND_REPLY_TO");
  },
  get isConfigured() {
    return Boolean(this.apiKey);
  },
};

/** Operational alert recipients (overridable via env). */
export const alertRecipients = {
  /** Stock / low-stock alerts → Camilla. */
  get stock() {
    return env("ALERT_EMAIL_STOCK") ?? "corsi@sakesommelierassociation.it";
  },
  /** Course-ended "da fatturare" notices → Luigi (accounting). */
  get invoice() {
    return env("ALERT_EMAIL_INVOICE") ?? "fatture@sakecompany.com";
  },
};

export const supabaseConfig = {
  get url() {
    return env("NEXT_PUBLIC_SUPABASE_URL");
  },
  get anonKey() {
    return env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return env("SUPABASE_SERVICE_ROLE_KEY");
  },
  get isConfigured() {
    return Boolean(this.url && this.anonKey);
  },
};

/** Serializable connection-status snapshot for the top-bar indicators. */
export interface ConnectionStatus {
  shopifySsa: boolean;
  shopifySc: boolean;
  airtable: boolean;
  dropbox: boolean;
}

/** Read current integration config and report which are connected. Server-side. */
export function getConnectionStatus(): ConnectionStatus {
  return {
    shopifySsa: shopifyConfig.isConfigured,
    shopifySc: sakeCompanyConfig.isConfigured,
    airtable: airtableConfig.isConfigured,
    dropbox: dropboxConfig.isConfigured,
  };
}
