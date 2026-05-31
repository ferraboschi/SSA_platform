// Airtable — source of course config (costs, program), the sake catalog, and
// QR registrations. Feeds the live DataSource adapter in production.
//
// The interface is the extension point; the live client (Airtable REST API) is
// deferred. The stub throws on every call.

import { airtableConfig } from "../config";
import { IntegrationNotConfiguredError } from "../types";
import type { CourseCosts, ProgramDay, Sake } from "@/lib/domain";

export interface AirtableCourseConfig {
  handle: string;
  costs: Partial<CourseCosts>;
  program: ProgramDay[];
  whatsappLink?: string;
}

export interface AirtableQrRegistration {
  email: string;
  registrationName: string;
}

export interface AirtableClient {
  getCourseConfig(handle: string): Promise<AirtableCourseConfig | null>;
  listSakeCatalog(): Promise<Sake[]>;
  getQrRegistrations(handle: string): Promise<AirtableQrRegistration[]>;
}

class StubAirtableClient implements AirtableClient {
  async getCourseConfig(): Promise<AirtableCourseConfig | null> {
    throw new IntegrationNotConfiguredError("airtable");
  }
  async listSakeCatalog(): Promise<Sake[]> {
    throw new IntegrationNotConfiguredError("airtable");
  }
  async getQrRegistrations(): Promise<AirtableQrRegistration[]> {
    throw new IntegrationNotConfiguredError("airtable");
  }
}

let instance: AirtableClient | null = null;

export function getAirtableClient(): AirtableClient {
  if (!instance) {
    instance = new StubAirtableClient();
  }
  return instance;
}

export function setAirtableClient(client: AirtableClient): void {
  instance = client;
}

export { airtableConfig };
