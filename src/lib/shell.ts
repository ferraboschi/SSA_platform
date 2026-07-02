// Compact, serializable shapes the (client) shell needs: the sidebar course
// sub-menu and the global search index. The live builders live in shell-data.ts
// (cached, Supabase-backed) — this file is just the shared types.

import type { BadgeTone } from "@/components/ui/Badge";

export interface SidebarCourse {
  id: string;
  label: string;
  href: string;
  meta: string;
  /** Sake program/template assigned to the course (green vs grey dot). */
  hasProgram: boolean;
  /** Missing essentials → red status dot (tooltip lists what's missing). */
  missEducator: boolean;
  missLocation: boolean;
  missDate: boolean;
  /**
   * Exam family for the course type: certificato → "nihonshu", shochu → "shochu",
   * everything else (e.g. introduttivo) → null (no exam). Drives whether the
   * nested course menu shows an "Esame" section.
   */
  examFamily: "nihonshu" | "shochu" | null;
}

export interface SearchEntry {
  id: string;
  title: string;
  sub: string;
  icon: string;
  href: string;
  badge?: string;
  badgeTone?: BadgeTone;
  haystack: string;
}

export interface SearchIndex {
  corsi: SearchEntry[];
  corsisti: SearchEntry[];
  educator: SearchEntry[];
}
