import type { Metadata } from "next";
import { MedagliereClient } from "./medagliere-client";

export const metadata: Metadata = {
  title: "Medagliere MSC 2026 — Milano Sake Challenge",
  description:
    "Medagliere ufficiale della Milano Sake Challenge 2026. Prodotti premiati con Platino, Doppio Oro, Oro, Argento nelle sessioni Nihonshu, Shochu, Food Pairing e Design.",
  openGraph: {
    title: "Medagliere MSC 2026 — Milano Sake Challenge",
    description: "Scopri tutti i vincitori della Milano Sake Challenge 2026.",
    type: "website",
  },
};

export default function Msc2026Page() {
  return <MedagliereClient />;
}
