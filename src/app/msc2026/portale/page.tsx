import type { Metadata } from "next";
import { PortaleClient } from "./portale-client";

export const metadata: Metadata = {
  title: "Medagliere MSC 2026 — Portale Risultati (Compify)",
  description:
    "Portale risultati Milano Sake Challenge 2026 — port fedele del design agenzia (Compify). Directory premi, filtri, schede prodotto. Dati di esempio.",
};

// Faithful port of the agency handoff (design-handoff-msc). Parallel to /msc2026 — nothing here changes that page.
export default function PortalePage() {
  return <PortaleClient />;
}
