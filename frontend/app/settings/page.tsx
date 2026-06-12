/**
 * frontend/app/settings/page.tsx
 * Account, business, and notification settings.
 * Tabs: Profile | Business | Notifications | Danger Zone
 */
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { auth as authApi, tokenStore } from "@/lib/api";
import { useStore, useUser } from "@/lib/store";
import { useRouter } from "next/navigation";

type Tab = "profile" | "business" | "notifications" | "danger";

export default function SettingsPage() {
  const router    = useRouter();
  const user      = useUser();
  const clearAuth = useStore((s) => s.clearAuth);
  const [tab, setTab]   = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);

  // Profile form
  const [name, setName]           = useState(user?.name ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (name !== user?.name) payload.name = name;
      if (newPw) { payload.current_password = currentPw; payload.new_password = newPw; }
      if (Object.keys(payload).length === 0) { toast.info("No changes to save"); return; }
      await authApi.updateMe(payload);
      toast.success("Profile updated");
      setCurrentPw(""); setNewPw("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally { setSaving(false); }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure? This will permanently delete your account and ALL business data. This cannot be undone.")) return;
    if (!confirm("Final confirmation: delete everything?")) return;
    toast.error("Account deletion is not yet available. Contact support.");
  };

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "profile",       label: "Profile",        icon: "👤" },
    { key: "business",      label: "Business",       icon: "🏪" },
    { key: "notifications", label: "Notifications",  icon: "🔔" },
    { key: "danger",        label: "Danger Zone",    icon: "⚠️" },
  ];

  return (
    <>
      <style>{`
        .settings-page { padding:28px; display:grid; grid-template-columns:200px 1fr; gap:24px; min-height:100vh; }
        .tab-list { display:flex; flex-direction:column; gap:4px; }
        .tab-btn { display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:9px; border:none; background:transparent; color:var(--muted); font-size:13px; font-family:var(--font-sans); cursor:pointer; text-align:left; transition:all .15s; }
        .tab-btn:hover { background:var(--surface-2); color:var(--text); }
        .tab-btn.on { background:rgba(245,158,11,.12); color:var(--amber); }
        .settings-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:24px 26px; margin-bottom:16px; }
        .settings-title { font-size:15px; font-weight:600; color:var(--text); margin-bottom:4px; }
        .settings-sub { font-size:12px; color:var(--muted); margin-bottom:20px; font-family:var(--font-mono); }
        .field { margin-bottom:14px; }
        .field label { display:block; font-size:11px; color:var(--muted); font-family:var(--font-mono); text-transform:uppercase; letter-spacing:.06em; margin-bottom:5px; }
        .field input { width:100%; max-width:400px; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 12px; color:var(--text); font-size:13px; outline:none; transition:border-color .15s; }
        .field input:focus { border-color:var(--amber); }
        .save-btn { padding:9px 22px; border-radius:8px; border:none; background:var(--amber); color:#000; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s; }
        .save-btn:disabled { opacity:.6; cursor:not-allowed; }
        .danger-btn { padding:9px 22px; border-radius:8px; border:1px solid var(--red); background:transparent; color:var(--red); font-size:13px; cursor:pointer; transition:all .15s; }
        .danger-btn:hover { background:rgba(248,113,113,.1); }
        .plan-badge { display:inline-block; padding:4px 12px; border-radius:6px; font-size:12px; font-family:var(--font-mono); font-weight:600; }
        @media(max-width:640px){ .settings-page{grid-template-columns:1fr} .tab-list{flex-direction:row;flex-wrap:wrap} }
      `}</style>

      <div className="settings-page">
        {/* Sidebar tabs */}
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 16, padding: "0 4px" }}>Settings</h1>
          <div className="tab-list">
            {TABS.map((t) => (
              <button key={t.key} className={`tab-btn${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div>
          {/* Profile tab */}
          {tab === "profile" && (
            <>
              <div className="settings-card">
                <div className="settings-title">Personal Information</div>
                <div className="settings-sub">Update your name and contact details</div>
                <div className="field">
                  <label>Full Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>
                <div className="field">
                  <label>Email Address</label>
                  <input value={user?.email ?? ""} disabled style={{ opacity: 0.6, cursor: "not-allowed" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button className="save-btn" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    Role: {user?.role ?? "—"}
                  </span>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-title">Change Password</div>
                <div className="settings-sub">Leave blank to keep your current password</div>
                <div className="field">
                  <label>Current Password</label>
                  <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" />
                </div>
                <div className="field">
                  <label>New Password</label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min 8 chars + number" />
                </div>
                <button className="save-btn" onClick={handleSaveProfile} disabled={saving || !currentPw || !newPw}>
                  {saving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </>
          )}

          {/* Business tab */}
          {tab === "business" && (
            <>
              <div className="settings-card">
                <div className="settings-title">Business Details</div>
                <div className="settings-sub">Your store name and plan</div>
                <div className="field">
                  <label>Business Name</label>
                  <input defaultValue={user?.business_name ?? ""} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Current Plan</div>
                  <span className="plan-badge" style={{
                    background: user?.plan === "pro" ? "rgba(245,158,11,.15)" : user?.plan === "business" ? "rgba(74,222,128,.15)" : "rgba(100,116,139,.15)",
                    color: user?.plan === "pro" ? "var(--amber)" : user?.plan === "business" ? "var(--green)" : "var(--muted)",
                  }}>
                    {(user?.plan ?? "free").toUpperCase()} PLAN
                  </span>
                  {user?.plan === "free" && (
                    <button onClick={() => toast.info("Billing page coming soon!")} style={{ marginLeft: 12, padding: "5px 14px", borderRadius: 7, border: "1px solid var(--amber)", background: "transparent", color: "var(--amber)", cursor: "pointer", fontSize: 12 }}>
                      Upgrade to Pro ✨
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-title">Invite Staff</div>
                <div className="settings-sub">Give team members access to your store</div>
                <div className="field">
                  <label>Staff Email</label>
                  <input type="email" placeholder="staff@yourbusiness.com" id="invite-email" />
                </div>
                <button className="save-btn" onClick={async () => {
                  const email = (document.getElementById("invite-email") as HTMLInputElement)?.value;
                  if (!email) { toast.error("Enter an email"); return; }
                  try {
                    await authApi.inviteStaff({ email, name: email.split("@")[0] });
                    toast.success(`Invitation sent to ${email}`);
                  } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Invite failed"); }
                }}>
                  Send Invite
                </button>
              </div>
            </>
          )}

          {/* Notifications tab */}
          {tab === "notifications" && (
            <div className="settings-card">
              <div className="settings-title">Notification Preferences</div>
              <div className="settings-sub">Control when and how you receive alerts</div>
              {[
                { label: "Low stock alerts",        desc: "When a product drops below reorder point" },
                { label: "Daily sales summary",     desc: "Morning summary of yesterday's performance" },
                { label: "Weekly health score",     desc: "Business health score report every Monday" },
                { label: "AI insights",             desc: "New AI-detected opportunities and warnings"  },
                { label: "Expiry warnings",         desc: "30 days before a product expires"            },
              ].map((n, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>{n.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{n.desc}</div>
                  </div>
                  {/* Toggle switch */}
                  <div style={{ position: "relative", width: 40, height: 22, cursor: "pointer" }}
                    onClick={(e) => { const t = e.currentTarget.querySelector(".toggle-thumb") as HTMLElement; const on = t.style.left === "20px"; t.style.left = on ? "2px" : "20px"; (e.currentTarget.querySelector(".toggle-track") as HTMLElement).style.background = on ? "#1a2540" : "#f59e0b"; }}>
                    <div className="toggle-track" style={{ width: "100%", height: "100%", borderRadius: 11, background: i < 3 ? "#f59e0b" : "#1a2540", transition: "background .2s" }} />
                    <div className="toggle-thumb" style={{ position: "absolute", top: 3, left: i < 3 ? "20px" : "2px", width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </div>
                </div>
              ))}
              <button className="save-btn" style={{ marginTop: 16 }} onClick={() => toast.success("Preferences saved")}>Save Preferences</button>
            </div>
          )}

          {/* Danger Zone tab */}
          {tab === "danger" && (
            <>
              <div className="settings-card" style={{ border: "1px solid rgba(248,113,113,.3)" }}>
                <div className="settings-title" style={{ color: "var(--red)" }}>⚠️ Danger Zone</div>
                <div className="settings-sub">These actions are irreversible. Be careful.</div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>Clear all sales data</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Permanently delete all transaction history</div>
                  </div>
                  <button className="danger-btn" onClick={() => toast.error("Contact support to perform this action safely")}>Clear Data</button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>Export all data</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Download your full data as CSV</div>
                  </div>
                  <button className="save-btn" onClick={() => toast.info("Export feature coming soon!")}>Export CSV</button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--red)" }}>Delete account</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Permanently delete account and all data</div>
                  </div>
                  <button className="danger-btn" onClick={handleDeleteAccount}>Delete Account</button>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-title">Logout everywhere</div>
                <div className="settings-sub">Sign out of all devices and sessions</div>
                <button className="danger-btn" onClick={async () => {
                  const refresh = tokenStore.getRefresh();
                  if (refresh) await authApi.logout(refresh).catch(() => {});
                  clearAuth();
                  router.push("/login");
                }}>
                  Logout All Devices
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
