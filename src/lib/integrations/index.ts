// Integrations barrel + status registry.
//
// `getIntegrationStatuses()` reports which external services are wired up. It
// powers an admin "Integrazioni" panel and the end-of-project verification that
// every required extension point exists.

import {
  airtableConfig,
  dropboxConfig,
  resendConfig,
  shopifyConfig,
  supabaseConfig,
} from "./config";
import type { IntegrationStatus } from "./types";

export * from "./types";
export { getEmailService, setEmailService } from "./email";
export type {
  EmailService,
  EmailMessage,
  EmailSendResult,
  EmailAddress,
} from "./email";
export { getShopifyClient, setShopifyClient } from "./shopify";
export type { ShopifyClient } from "./shopify";
export { getAirtableClient, setAirtableClient } from "./airtable";
export type { AirtableClient } from "./airtable";
export { getDropboxClient, setDropboxClient } from "./dropbox";
export type { DropboxClient } from "./dropbox";
// Note: server-side clients (getSupabaseServerClient, getSupabaseServiceClient)
// import next/headers — import them directly from "@/lib/integrations/supabase/server"
// in server files, not from this barrel.
export {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "./supabase";

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    {
      id: "shopify",
      label: "Shopify",
      purpose: "Corsi (prodotti), ordini iscritti, profili educator.",
      configured: shopifyConfig.isConfigured,
      mode: shopifyConfig.isConfigured ? "live" : "stub",
    },
    {
      id: "airtable",
      label: "Airtable",
      purpose: "Config corso (costi/programma), catalogo sake, registrazioni QR.",
      configured: airtableConfig.isConfigured,
      mode: airtableConfig.isConfigured ? "live" : "stub",
    },
    {
      id: "dropbox",
      label: "Dropbox",
      purpose: "Sync materiali, diplomi e allegati corso.",
      configured: dropboxConfig.isConfigured,
      mode: dropboxConfig.isConfigured ? "live" : "stub",
      isNew: true,
    },
    {
      id: "resend",
      label: "Resend",
      purpose: "Email transazionali (notifiche, esiti esami, promemoria).",
      configured: resendConfig.isConfigured,
      mode: resendConfig.isConfigured ? "live" : "stub",
    },
    {
      id: "supabase",
      label: "Supabase",
      purpose: "Postgres + Auth + Storage + pgvector (RAG). Hosting con Render.",
      configured: supabaseConfig.isConfigured,
      mode: supabaseConfig.isConfigured ? "live" : "stub",
    },
  ];
}
