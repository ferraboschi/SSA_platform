// Shared shapes for the "Programma & Economia" course editor —
// ProgrammaEconomiaSection owns the state, programma-rows and EconomiaPanel
// render it.

import type { Sake } from "@/lib/domain";
import type { ScCatalogItem } from "@/components/sake/SakeProductPicker";

export interface SakeState extends Sake {
  id: string;
}

export interface CostLine {
  id: string;
  label: string;
  value: number;
  source?: string;
  custom?: boolean;
}

// One row of the per-SKU stock check (each program SKU once; need = bottles
// required for the enrolled students).
export interface StockCheckRow {
  sake: SakeState;
  need: number;
  item: ScCatalogItem | undefined;
  stock: number | null;
  insufficient: boolean;
  low: boolean;
}
