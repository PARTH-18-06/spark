import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { TutorApplication } from "@/lib/tutor-api/context";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Spark — Electricity that clicks",
    template: "%s · Spark",
  },
  description:
    "A voice-first, game-like Class 10 Electricity tutor interface.",
  applicationName: "Spark",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f4e8",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        <TutorApplication>{children}</TutorApplication>
      </body>
    </html>
  );
}
