/**
 * frontend/components/SidebarNav.tsx
 *
 * Left sidebar navigation — the primary way users move through the app.
 *
 * Features:
 *   - Business name + plan badge at the top
 *   - Nav links with active state (highlights current route)
 *   - Low-stock count badge on the Inventory link
 *   - Unread AI insights badge on the AI Chat link
 *   - Collapsible to icon-only mode (saves space on laptops)
 *   - Mobile: hides behind a hamburger button, slides in as a drawer
 *   - Bottom section: Settings + Logout
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useStore, useUser, useUIBadges } from "@/lib/store";
import { auth, tokenStore } from "@/lib/api";
import { toast } from "sonner";

interface NavItem {
  href:    string;
  icon:    string;
  label:   string;
  badge?:  "lowStock" | "insights";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",  icon: "⊞",  label: "Dashboard"    },
  { href: "/inventory",  icon: "📦", label: "Inventory",   badge: "lowStock"  },
  { href: "/sales",      icon: "🧾", label: "Sales & POS"  },
  { href: "/chat",       icon: "🤖", label: "AI Chat",     badge: "insights"  },
  { href: "/forecasts",  icon: "📈", label: "Forecasts"    },
  { href: "/health",     icon: "💯", label: "Health Score" },
  { href: "/customers",  icon: "👥", label: "Customers"    },
  { href: "/marketing",  icon: "📣", label: "Marketing"    },
  { href: "/ocr",        icon: "📄", label: "Scan Invoice" },
];

const PLAN_COLORS: Record<string, string> = {
  free:     "#64748b",
  pro:      "#f59e0b",
  business: "#4ade80",
};

export function SidebarNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const user     = useUser();
  const badges   = useUIBadges();
  const sidebarOpen   = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const clearAuth     = useStore((s) => s.clearAuth);

  // Don't render sidebar on auth pages
  if (["/login", "/register"].some((p) => pathname.startsWith(p))) return null;

  const handleLogout = async () => {
    const refresh = tokenStore.getRefresh();
    try {
      if (refresh) await auth.logout(refresh);
    } catch { /* ignore errors on logout */ }
    clearAuth();
    router.push("/login");
    toast.success("Logged out successfully");
  };

  const badgeCount = (item: NavItem): number => {
    if (item.badge === "lowStock")  return badges.lowStock;
    if (item.badge === "insights")  return badges.unreadInsights;
    return 0;
  };

  const w = sidebarOpen ? 240 : 64;

  return (
    <>
      <style>{`
        .sidebar {
          width: ${w}px;
          min-height: 100vh;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          transition: width .2s ease;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow: hidden;
        }
        .sidebar-header {
          padding: 18px 14px 14px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 70px;
        }
        .biz-avatar {
          width: 36px; height: 36px; border-radius: 9px;
          background: var(--amber); color: #000;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-serif); font-size: 16px; font-weight: 400;
          flex-shrink: 0;
        }
        .biz-name {
          font-size: 13px; font-weight: 600; color: var(--text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .biz-plan {
          font-size: 10px; font-family: var(--font-mono);
          text-transform: uppercase; letter-spacing: .06em;
          color: ${PLAN_COLORS[user?.plan ?? "free"]};
          margin-top: 1px;
        }
        .nav-list {
          flex: 1; padding: 10px 8px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 2px;
        }
        .nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: var(--radius-md);
          cursor: pointer; text-decoration: none;
          color: var(--muted); font-size: 13px; font-weight: 500;
          transition: all .15s; position: relative;
          white-space: nowrap; border: none; background: transparent;
          width: 100%; text-align: left;
        }
        .nav-item:hover { background: var(--surface-2); color: var(--text); }
        .nav-item.active {
          background: rgba(245,158,11,.12);
          color: var(--amber);
        }
        .nav-item.active .nav-icon { color: var(--amber); }
        .nav-icon { font-size: 17px; flex-shrink: 0; width: 20px; text-align: center; }
        .nav-label { overflow: hidden; text-overflow: ellipsis; }
        .nav-badge {
          margin-left: auto;
          min-width: 18px; height: 18px; padding: 0 5px;
          background: var(--red); color: #fff;
          border-radius: 9px; font-size: 10px; font-family: var(--font-mono);
          display: flex; align-items: center; justify-content: center;
          font-weight: 600; flex-shrink: 0;
        }
        .sidebar-footer {
          padding: 10px 8px 16px;
          border-top: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 2px;
        }
        .collapse-btn {
          position: absolute; top: 50%; right: -12px;
          transform: translateY(-50%);
          width: 24px; height: 24px; border-radius: 50%;
          background: var(--surface-2); border: 1px solid var(--border);
          color: var(--muted); font-size: 10px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all .15s; z-index: 10;
        }
        .collapse-btn:hover { color: var(--amber); border-color: var(--amber); }
        .sidebar-section-label {
          font-size: 10px; color: var(--muted); font-family: var(--font-mono);
          text-transform: uppercase; letter-spacing: .08em;
          padding: 8px 10px 4px;
        }
      `}</style>

      <nav className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="biz-avatar">
            {(user?.business_name?.[0] ?? "B").toUpperCase()}
          </div>
          {sidebarOpen && (
            <div style={{ minWidth: 0 }}>
              <div className="biz-name">{user?.business_name ?? "My Business"}</div>
              <div className="biz-plan">{user?.plan ?? "free"} plan</div>
            </div>
          )}
        </div>

        {/* Nav links */}
        <div className="nav-list">
          {sidebarOpen && <div className="sidebar-section-label">Menu</div>}

          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const count    = badgeCount(item);
            return (
              <button
                key={item.href}
                className={`nav-item${isActive ? " active" : ""}`}
                onClick={() => router.push(item.href)}
                title={!sidebarOpen ? item.label : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
                {sidebarOpen && count > 0 && (
                  <span className="nav-badge">{count > 99 ? "99+" : count}</span>
                )}
                {/* Dot badge when collapsed */}
                {!sidebarOpen && count > 0 && (
                  <span style={{
                    position: "absolute", top: 6, right: 6,
                    width: 8, height: 8, borderRadius: "50%",
                    background: "var(--red)", border: "1px solid var(--surface)",
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer: settings + logout */}
        <div className="sidebar-footer">
          <button
            className={`nav-item${pathname.startsWith("/settings") ? " active" : ""}`}
            onClick={() => router.push("/settings")}
            title={!sidebarOpen ? "Settings" : undefined}
          >
            <span className="nav-icon">⚙️</span>
            {sidebarOpen && <span className="nav-label">Settings</span>}
          </button>

          <button
            className="nav-item"
            onClick={handleLogout}
            title={!sidebarOpen ? "Logout" : undefined}
            style={{ color: "var(--red)" }}
          >
            <span className="nav-icon">↩</span>
            {sidebarOpen && <span className="nav-label">Logout</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button className="collapse-btn" onClick={toggleSidebar}>
          {sidebarOpen ? "◀" : "▶"}
        </button>
      </nav>
    </>
  );
}
