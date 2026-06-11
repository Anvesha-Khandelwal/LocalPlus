/**
 * frontend/app/layout.tsx
 * Root Next.js layout — wraps every page in the app.
 *
 * Responsibilities:
 *   1. AuthProvider   — checks JWT on mount, redirects to /login if expired
 *   2. SidebarNav     — left navigation (hidden on auth pages)
 *   3. Toaster        — global toast notification system (sonner)
 *   4. Font loading   — Instrument Serif + Syne + IBM Plex Mono via Google Fonts
 *   5. Badge sync     — polls /api/v1/inventory/low-stock-summary every 5 min
 *                       and writes the count to Zustand for the sidebar badge
 *
 * Auth pages (/login, /register) render without the sidebar.
 * All other pages render with the sidebar + main content area.
 */

import type { Metadata } from "next";
import { Instrument_Serif, Syne, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { SidebarNav } from "@/components/SidebarNav";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AI Business Copilot", template: "%s | AI Business Copilot" },
  description: "AI-powered business management for small retailers and kirana stores",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${syne.variable} ${ibmPlexMono.variable}`}>
      <body>
        <AuthProvider>
          <div className="app-shell">
            <SidebarNav />
            <main className="main-content">{children}</main>
          </div>
        </AuthProvider>
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ duration: 4000, style: { fontFamily: "var(--font-sans)" } }}
        />
      </body>
    </html>
  );
}
