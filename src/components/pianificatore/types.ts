import type {
  PlannerEducator,
  PlannerItem,
  WindowMonth,
} from "@/lib/pianificatore";
import type { CourseTypeKey } from "@/lib/domain";

// Optional placement hints carried by an add/drop interaction.
export interface AddExtra {
  city?: string;
  educatorId?: string;
  type?: CourseTypeKey;
}

// Where an "add course" request originated (calendar cell or signal suggestion).
export interface AddAt {
  year?: number;
  mIdx?: number;
  city?: string;
  educatorId?: string;
  type?: CourseTypeKey;
}

export interface ViewProps {
  win: WindowMonth[];
  courses: PlannerItem[];
  educators: PlannerEducator[];
  onDropMonth: (
    id: string,
    year: number | null,
    mIdx: number,
    extra: AddExtra,
  ) => void;
  onRequestAdd: (year: number, mIdx: number, extra?: AddExtra) => void;
  onChipClick: (item: PlannerItem) => void;
}
