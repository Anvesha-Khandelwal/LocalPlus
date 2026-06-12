/**
 * frontend/components/AuthProvider.tsx
 *
 * Wraps the entire app. On mount:
 *   1. Reads the access token from localStorage.
 *   2. Calls GET /api/v1/auth/me to verify it's still valid.
 *   3. If valid → hydrates Zustand user state, renders children.
 *   4. If expired → tries refresh token. Success → new tokens stored.
 *   5. If refresh also fails → clears tokens, redirects to /login.
 *
 * Auth pages (/login, /register, /auth/*) are whitelisted — they render
 * without any token check so users can reach the login page.
 *
 * Also sets up a 5-minute interval to poll /inventory/low-stock-summary
 * and update the sidebar badge count in Zustand.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { auth, inventory, tokenStore } from "@/lib/api";

const PUBLIC_PATHS = ["/login", "/register", "/auth"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const setUser            = useStore((s) => s.setUser);
  const clearAuth          = useStore((s) => s.clearAuth);
  const setLowStockCount   = useStore((s) => s.setLowStockCount);
  const setOutOfStockCount = useStore((s) => s.setOutOfStockCount);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const syncBadges = useCallback(async () => {
    try {
      const summary = await inventory.lowStockSummary();
      setLowStockCount(summary.low_stock);
      setOutOfStockCount(summary.out_of_stock);
    } catch {
      // Silent fail — badge just shows stale count
    }
  }, [setLowStockCount, setOutOfStockCount]);

  useEffect(() => {
    if (isPublic) { setReady(true); return; }

    const token = tokenStore.getAccess();
    if (!token) { router.replace("/login"); return; }

    auth.me()
      .then((user) => {
        // api.ts handles token refresh internally if 401 is hit;
        // by the time we get here the tokens are fresh
        const access  = tokenStore.getAccess()!;
        const refresh = tokenStore.getRefresh()!;
        setUser(user as Parameters<typeof setUser>[0], access, refresh);
        setReady(true);
        syncBadges();
      })
      .catch(() => {
        clearAuth();
        router.replace("/login");
      });
  }, [pathname]); // re-run on route change so deep-links are protected

  // Poll low-stock badge every 5 minutes while app is open
  useEffect(() => {
    if (isPublic) return;
    const id = setInterval(syncBadges, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [syncBadges, isPublic]);

  // Show nothing while resolving auth — prevents flash of protected content
  if (!ready && !isPublic) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", background: "#080e1a",
      }}>
        <div style={{
          width: 40, height: 40, border: "3px solid #1a2540",
          borderTopColor: "#f59e0b", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
