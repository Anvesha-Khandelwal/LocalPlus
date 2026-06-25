/**
 * frontend/components/AuthProvider.tsx
 * Updated: redirects to /onboarding if business_type not set after login.
 */
"use client";
import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { auth, inventory, tokenStore } from "@/lib/api";

const PUBLIC_PATHS  = ["/login", "/register", "/auth"];
const SKIP_ONBOARD  = ["/login", "/register", "/auth", "/onboarding"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const setUser            = useStore((s) => s.setUser);
  const clearAuth          = useStore((s) => s.clearAuth);
  const setLowStockCount   = useStore((s) => s.setLowStockCount);
  const setOutOfStockCount = useStore((s) => s.setOutOfStockCount);

  const isPublic      = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const skipOnboarding = SKIP_ONBOARD.some((p) => pathname.startsWith(p));

  const syncBadges = useCallback(async () => {
    try {
      const summary = await inventory.lowStockSummary();
      setLowStockCount(summary.low_stock);
      setOutOfStockCount(summary.out_of_stock);
    } catch { /* silent */ }
  }, [setLowStockCount, setOutOfStockCount]);

  useEffect(() => {
    if (isPublic) { setReady(true); return; }

    const token = tokenStore.getAccess();
    if (!token) { router.replace("/login"); return; }

    auth.me()
      .then((user) => {
        const access  = tokenStore.getAccess()!;
        const refresh = tokenStore.getRefresh()!;
        setUser(user as Parameters<typeof setUser>[0], access, refresh);
        setReady(true);
        syncBadges();

        // Redirect to onboarding if business_type not set yet
        if (!user.business_type && !skipOnboarding) {
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        clearAuth();
        router.replace("/login");
      });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll badges every 5 min
  useEffect(() => {
    if (isPublic) return;
    const id = setInterval(syncBadges, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [syncBadges, isPublic]);

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
