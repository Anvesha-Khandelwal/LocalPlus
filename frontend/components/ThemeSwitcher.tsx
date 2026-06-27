/**
 * frontend/components/ThemeSwitcher.tsx
 * Three-option theme switcher — Dark / Light / Adaptive.
 * Can be dropped anywhere: sidebar, settings page, header.
 *
 * Usage:
 *   <ThemeSwitcher />                    — compact pill (for sidebar)
 *   <ThemeSwitcher variant="full" />     — labeled cards (for settings page)
 */
"use client";
import { useState, useEffect } from "react";
import { applyTheme, getStoredTheme, THEMES, type Theme } from "@/lib/theme";

interface Props {
  variant?: "compact" | "full";
}

export function ThemeSwitcher({ variant = "compact" }: Props) {
  const [current, setCurrent] = useState<Theme>("dark");

  useEffect(() => {
    setCurrent(getStoredTheme());
  }, []);

  const handleChange = (theme: Theme) => {
    setCurrent(theme);
    applyTheme(theme);
  };

  if (variant === "full") {
    return (
      <>
        <style>{`
          .theme-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .theme-card {
            padding: 16px 12px; border-radius: 12px; border: 1.5px solid var(--border);
            background: var(--surface); cursor: pointer; text-align: center;
            transition: all .15s; user-select: none;
          }
          .theme-card:hover { border-color: var(--border-2); transform: translateY(-2px); }
          .theme-card.active {
            border-color: var(--amber);
            background: rgba(245,158,11,.08);
            box-shadow: 0 0 0 1px var(--amber);
          }
          .theme-card-icon { font-size: 28px; margin-bottom: 8px; }
          .theme-card-label { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
          .theme-card-desc { font-size: 11px; color: var(--muted); font-family: var(--font-mono); }
          .theme-check {
            width: 18px; height: 18px; border-radius: 50%; background: var(--amber);
            display: flex; align-items: center; justify-content: center;
            font-size: 10px; color: #000; font-weight: 700; margin: 8px auto 0;
            animation: pop .2s cubic-bezier(0.175,0.885,0.32,1.275);
          }
          @keyframes pop { from{transform:scale(0)} to{transform:scale(1)} }
        `}</style>
        <div className="theme-cards">
          {THEMES.map((t) => (
            <div
              key={t.key}
              className={`theme-card${current === t.key ? " active" : ""}`}
              onClick={() => handleChange(t.key)}
            >
              <div className="theme-card-icon">{t.icon}</div>
              <div className="theme-card-label">{t.label}</div>
              <div className="theme-card-desc">
                {t.key === "dark"     && "Always dark"}
                {t.key === "light"    && "Always light"}
                {t.key === "adaptive" && "Follows system"}
              </div>
              {current === t.key && <div className="theme-check">✓</div>}
            </div>
          ))}
        </div>
      </>
    );
  }

  // Compact pill variant (for sidebar)
  return (
    <>
      <style>{`
        .theme-pill {
          display: flex; gap: 2px; background: var(--bg);
          border: 1px solid var(--border); border-radius: 8px; padding: 3px;
        }
        .theme-pill-btn {
          flex: 1; padding: 5px 6px; border-radius: 5px; border: none;
          background: transparent; cursor: pointer; font-size: 14px;
          transition: all .15s; display: flex; align-items: center; justify-content: center;
          title: attr(data-label);
        }
        .theme-pill-btn.active {
          background: var(--amber);
          box-shadow: 0 1px 4px rgba(245,158,11,.3);
        }
        .theme-pill-btn:not(.active):hover { background: var(--surface-2); }
      `}</style>
      <div className="theme-pill" title="Switch theme">
        {THEMES.map((t) => (
          <button
            key={t.key}
            className={`theme-pill-btn${current === t.key ? " active" : ""}`}
            onClick={() => handleChange(t.key)}
            data-label={t.label}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </>
  );
}
