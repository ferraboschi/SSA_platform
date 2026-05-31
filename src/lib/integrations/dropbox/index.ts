// Dropbox — NEW integration (not in the original production app).
//
// Syncs course materials, diplomas and attachments. The interface is the
// extension point; the live client (Dropbox HTTP API) is deferred. Unconfigured,
// a stub throws on write/read so callers can detect the missing wiring, while
// `listFolder` returns empty so read-only UIs degrade gracefully.

import { dropboxConfig } from "../config";
import { IntegrationNotConfiguredError } from "../types";

export interface DropboxEntry {
  name: string;
  path: string;
  kind: "file" | "folder";
  size?: number;
  modified?: string;
}

export interface DropboxUpload {
  /** Path relative to the configured root (e.g. "corsi/c01/diplomi/mario.pdf"). */
  path: string;
  content: Uint8Array | string;
  contentType?: string;
  /** Overwrite if a file already exists at the path. */
  overwrite?: boolean;
}

export interface DropboxClient {
  listFolder(path: string): Promise<DropboxEntry[]>;
  upload(file: DropboxUpload): Promise<DropboxEntry>;
  download(path: string): Promise<Uint8Array>;
  /** Create (or fetch) a shareable link for a file. */
  getSharedLink(path: string): Promise<string>;
  delete(path: string): Promise<void>;
}

class StubDropboxClient implements DropboxClient {
  async listFolder(): Promise<DropboxEntry[]> {
    return [];
  }
  async upload(): Promise<DropboxEntry> {
    throw new IntegrationNotConfiguredError("dropbox");
  }
  async download(): Promise<Uint8Array> {
    throw new IntegrationNotConfiguredError("dropbox");
  }
  async getSharedLink(): Promise<string> {
    throw new IntegrationNotConfiguredError("dropbox");
  }
  async delete(): Promise<void> {
    throw new IntegrationNotConfiguredError("dropbox");
  }
}

let instance: DropboxClient | null = null;

export function getDropboxClient(): DropboxClient {
  if (!instance) {
    // Live client deferred — wire a real DropboxClient here once
    // dropboxConfig.isConfigured and the HTTP client is implemented.
    instance = new StubDropboxClient();
  }
  return instance;
}

export function setDropboxClient(client: DropboxClient): void {
  instance = client;
}

export { dropboxConfig };
