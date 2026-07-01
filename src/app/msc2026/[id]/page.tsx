import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VISIBLE } from "../shared";
import { ProductView } from "../product-view";

// Pre-render a static page per awarded product (clean shareable marketing URLs).
export function generateStaticParams() {
  return VISIBLE.map((w) => ({ id: w.reg_id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const w = VISIBLE.find((x) => x.reg_id === id);
  if (!w) return { title: "Medagliere MSC 2026 — Milano Sake Challenge" };
  const title = `${w.name} — ${w.company_en} · Medagliere MSC 2026`;
  const description = `${w.name} di ${w.company_en}${w.prefecture ? ` (${w.prefecture})` : ""}, premiato alla Milano Sake Challenge 2026.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const winner = VISIBLE.find((x) => x.reg_id === id);
  if (!winner) notFound();
  return <ProductView winner={winner} />;
}
