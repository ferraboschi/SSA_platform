// Two-axis "readiness signal" for a course, shared by the sidebar sub-menu and
// the catalog views so the predicate logic lives in exactly one place.
//
// The two axes are ORTHOGONAL — they answer different questions and are always
// both rendered (presence/absence is instantly readable, unlike the old dots
// where the second dot could disappear entirely):
//
//   1) COMPLETENESS — is the logistics trio (educator + venue + date) set?
//        • all set          → green check-circle  "Tutto pronto"
//        • something missing → red warning icon    tooltip names what's missing
//          (the owner singled out "educator missing = red" — preserved here).
//
//   2) MATERIALS — is the sake programme/template assigned?
//        • assigned     → blue filled book  "Materiali assegnati"
//        • not assigned → muted grey book   "Materiali non assegnati"
//
// This helper returns icon names (from the shared Icon set), CSS colour tokens,
// and i18n tooltip keys — it renders nothing itself and pulls in no React.

import type { IconName } from "@/components/ui/Icon";

/** The minimal per-course flags the signal needs. Both callers can satisfy it. */
export interface CourseSignalFlags {
  /** Sake programme/template assigned to the course. */
  hasProgram: boolean;
  /** Educator not assigned. */
  missEducator: boolean;
  /** Venue / city not set. */
  missLocation: boolean;
  /** Date (year + month + day) not fully set. */
  missDate: boolean;
}

/** Which logistics pieces are missing, as i18n key names under `corsi.catalog`. */
export type MissingKey = "missEducator" | "missLocation" | "missDate";

export interface AxisSignal {
  icon: IconName;
  /** A CSS colour token, e.g. "var(--success)". */
  color: string;
  /** i18n key under `corsi.catalog` for the tooltip / aria-label. */
  tooltipKey: string;
}

export interface CompletenessSignal extends AxisSignal {
  complete: boolean;
  /** Keys of the missing pieces (empty when complete) — for the tooltip. */
  missing: MissingKey[];
}

export interface CourseSignal {
  completeness: CompletenessSignal;
  materials: AxisSignal;
}

export function courseSignal(flags: CourseSignalFlags): CourseSignal {
  const missing: MissingKey[] = [];
  if (flags.missEducator) missing.push("missEducator");
  if (flags.missLocation) missing.push("missLocation");
  if (flags.missDate) missing.push("missDate");
  const complete = missing.length === 0;

  const completeness: CompletenessSignal = complete
    ? {
        complete: true,
        missing,
        icon: "check",
        color: "var(--success)",
        tooltipKey: "signalReadyTip",
      }
    : {
        complete: false,
        missing,
        icon: "warn",
        color: "var(--danger)",
        // tooltip is composed by the caller: `signalMissingTip` + the missing labels
        tooltipKey: "signalMissingTip",
      };

  const materials: AxisSignal = flags.hasProgram
    ? {
        icon: "book",
        color: "var(--indigo)",
        tooltipKey: "signalMaterialsOn",
      }
    : {
        icon: "book",
        color: "var(--text-mute)",
        tooltipKey: "signalMaterialsOff",
      };

  return { completeness, materials };
}
