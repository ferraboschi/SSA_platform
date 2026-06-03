// Per-course "Programma & Economia" overlay — pure types, client+server safe.
// When present it REPLACES the base program (from corsi_giorni) so the operator's
// edits (days, sakes, notes, custom economic lines) persist across reloads.
// Stored in settings_kv under key "course_program", keyed by domain course id.

import type { Sake } from "@/lib/domain";

export interface SavedSake extends Sake {
  id: string;
}
export interface SavedDay {
  id: string;
  day: number;
  name: string;
  sakes: SavedSake[];
}
export interface SavedLine {
  id: string;
  label: string;
  value: number;
  custom?: boolean;
}
export interface CourseProgramOverlay {
  days?: SavedDay[];
  customLines?: SavedLine[];
}

export const EMPTY_PROGRAM_OVERLAY: CourseProgramOverlay = {};
