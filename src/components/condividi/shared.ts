import type { VerificationStateId } from "@/lib/share-links/verification-state";

// Local prop shapes (structurally match the loader types) so the client
// components never import the server-only loader module.
export interface Student {
  id: number;
  kind: "corsista" | "partecipante";
  name: string;
  email: string;
  emailConfirmed: boolean;
  confirmSent: boolean;
  confirmSentAt: string | null;
  emailConfirmedAt: string | null;
  phone: string;
  iscrizioneId?: number;
  tickets?: number;
  companionsUsed?: number;
  guestOf?: string;
}
export interface SakeRow {
  code: string;
  name: string;
  type: string;
  sakagura: string;
  size: number;
  cost: number;
  qty: number;
  image: string | null;
  url: string | null;
  /** Aroma hook + narrative commentary from the Sake Company product page. */
  aroma: string | null;
  notes: string | null;
  region: string | null;
  /** Alcohol by volume, as the store's own label (e.g. "15.5%"). */
  abv: string | null;
  /** Suggested food pairing, comma-joined when the source lists several. */
  pairing: string | null;
}
export interface DayRow {
  day: number;
  name: string;
  sakes: SakeRow[];
}
export interface TestRow {
  key: string;
  label: string;
  isFinal: boolean;
  configured: boolean;
  url: string;
  closedAt: string | null;
}

export const subjKey = (s: Pick<Student, "kind" | "id">) => `${s.kind === "corsista" ? "c" : "p"}${s.id}`;

export const CHIP_CLASS: Record<VerificationStateId, string> = {
  assente: "badge badge-neutral",
  verificare: "badge badge-indigo",
  attesa: "badge badge-warning",
  confermato: "badge badge-success",
};
