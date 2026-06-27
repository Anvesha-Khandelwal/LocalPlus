import type { Metadata } from "next";
import { Instrument_Serif, Syne, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarNav } from "@/components/SidebarNav";
import "./globals.css";

const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const syne = Syne({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AI Business Copilot", template: "%s | AI Business Copilot" },
  description: "AI-powered business management for small retailers and kirana stores",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${syne.variable} ${ibmPlexMono.variable}`}>
      <head>
        {/*
          Inline script runs BEFORE React hydrates — prevents flash of wrong theme.
          Reads localStorage and sets data-theme on <html> immediately.
        */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme') || 'dark';
              var isDark = theme === 'dark' || (theme === 'adaptive' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            } catch(e) {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          })();
        `}} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <div className="app-shell">
              <SidebarNav />
              <main className="main-content">{children}</main>
            </div>
          </AuthProvider>
        </ThemeProvider>
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ duration: 4000, style: { fontFamily: "var(--font-sans)" } }}
        />
      </body>
    </html>
  );
}
