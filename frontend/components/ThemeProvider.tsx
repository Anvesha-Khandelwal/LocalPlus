/**
 * frontend/components/ThemeProvider.tsx
 * Initialises theme on mount and listens for system changes.
 * Wrap this around the app in layout.tsx.
 */
"use client";
import { useEffect } from "react";
import { initTheme } from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initTheme();
  }, []);
  return <>{children}</>;
}
