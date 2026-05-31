import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { LOCALE_META } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

// Self-hosted via next/font (no runtime request to Google). The CSS variables
// feed the --font-sans / --font-mono design tokens in tokens.css.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SSA — Sake Sommelier Association",
  description:
    "Piattaforma di gestione SSA: corsi, corsisti, educator, esami e pianificazione.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={LOCALE_META[locale].htmlLang}
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
