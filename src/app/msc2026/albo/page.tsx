import type { Metadata } from "next";
import { AlboClient } from "./albo-client";

export const metadata: Metadata = {
  title: "Albo dei Premiati MSC 2026 — Milano Sake Challenge",
  description:
    "Albo navigabile dei vincitori della Milano Sake Challenge 2026: indice a salto + scroll-spy per sessione e categoria. Dati reali, senza punteggi.",
};

// Hybrid navigable directory (Kura-Master browse pattern + Compify look), real data. Parallel to /msc2026 and /msc2026/portale.
export default function AlboPage() {
  return <AlboClient />;
}
