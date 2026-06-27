/**
 * frontend/lib/theme.ts
 * Theme management — light, dark, adaptive (follows system preference).
 * Stores preference in localStorage. Applies CSS class to <html> element.
 */

export type Theme = "light" | "dark" | "adaptive";

export const THEMES: { key: Theme; label: string; icon: string }[] = [
  { key: "dark",     label: "Dark",     icon: "🌙" },
  { key: "light",    label: "Light",    icon: "☀️" },
  { key: "adaptive", label: "Adaptive", icon: "💻" },
];

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("theme") as Theme) ?? "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;

  const isDark =
    theme === "dark" ||
    (theme === "adaptive" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  root.setAttribute("data-theme", isDark ? "dark" : "light");
  localStorage.setItem("theme", theme);
}

export function initTheme() {
  const theme = getStoredTheme();
  applyTheme(theme);

  // Listen for system preference changes when in adaptive mode
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStoredTheme() === "adaptive") applyTheme("adaptive");
  });
}
