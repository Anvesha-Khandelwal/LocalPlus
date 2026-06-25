/**
 * frontend/app/onboarding/page.tsx
 * First-time onboarding — user selects their business type.
 * Shows after registration if business_type is not yet set.
 * Glassmorphic dark cards with hover animations.
 */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { auth as authApi } from "@/lib/api";
import { useStore } from "@/lib/store";

const BUSINESS_TYPES = [
  { key: "Grocery Store",    icon: "🛒", desc: "Kirana, supermarket, daily essentials" },
  { key: "Clothing Store",   icon: "👗", desc: "Garments, fashion, textiles" },
  { key: "Pharmacy",         icon: "💊", desc: "Medical, medicines, health products" },
  { key: "Electronics Shop", icon: "📱", desc: "Mobile, appliances, gadgets" },
  { key: "Restaurant/Cafe",  icon: "🍽️", desc: "Food, beverages, dining" },
  { key: "Beauty/Cosmetics", icon: "💄", desc: "Salon, beauty products, cosmetics" },
  { key: "Hardware Store",   icon: "🔧", desc: "Tools, construction, home repair" },
  { key: "Other",            icon: "🏪", desc: "Any other type of business" },
];

export default function OnboardingPage() {
  const router  = useRouter();
  const user    = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const [selected, setSelected]   = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  const handleConfirm = async () => {
    if (!selected) { toast.error("Please select your business type"); return; }
    setSaving(true);
    try {
      await authApi.updateBusinessType(selected);
      // Update local Zustand state so AuthProvider doesn't redirect back here
      if (user) {
        const { tokenStore } = await import("@/lib/api");
        setUser(
          { ...user, business_type: selected },
          tokenStore.getAccess()!,
          tokenStore.getRefresh()!
        );
      }
      toast.success("Business profile set up!");
      router.push("/dashboard");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Syne:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg:#080e1a;--surface:rgba(13,21,38,0.8);--border:rgba(255,255,255,0.08);
          --amber:#f59e0b;--text:#e2e8f0;--muted:#64748b;
          --serif:'Instrument Serif',Georgia,serif;--sans:'Syne',sans-serif;
        }
        body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}
        .ob-root{
          min-height:100vh;display:flex;flex-direction:column;align-items:center;
          justify-content:center;padding:32px 20px;
          background:radial-gradient(ellipse at 20% 20%, rgba(245,158,11,0.06) 0%, transparent 60%),
                      radial-gradient(ellipse at 80% 80%, rgba(96,165,250,0.05) 0%, transparent 60%),
                      var(--bg);
        }
        .ob-header{text-align:center;margin-bottom:40px}
        .ob-header h1{font-family:var(--serif);font-size:clamp(28px,5vw,44px);font-weight:400;line-height:1.2;margin-bottom:10px}
        .ob-header h1 em{color:var(--amber);font-style:italic}
        .ob-header p{font-size:15px;color:var(--muted);max-width:480px;line-height:1.6}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;max-width:900px;width:100%;margin-bottom:36px}
        .card{
          background:var(--surface);border:1.5px solid var(--border);border-radius:16px;
          padding:22px 18px;cursor:pointer;transition:all .2s;
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;
        }
        .card:hover{border-color:rgba(245,158,11,0.4);transform:translateY(-3px);background:rgba(245,158,11,0.05)}
        .card.selected{
          border-color:var(--amber);
          background:rgba(245,158,11,0.1);
          box-shadow:0 0 0 1px var(--amber), 0 8px 32px rgba(245,158,11,0.15);
          transform:translateY(-3px);
        }
        .card-icon{font-size:36px;line-height:1}
        .card-name{font-size:14px;font-weight:600;color:var(--text)}
        .card-desc{font-size:11px;color:var(--muted);line-height:1.4}
        .check{
          width:20px;height:20px;border-radius:50%;background:var(--amber);
          display:flex;align-items:center;justify-content:center;font-size:11px;
          color:#000;font-weight:700;margin-top:4px;
          animation:pop .2s cubic-bezier(0.175,0.885,0.32,1.275);
        }
        @keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
        .confirm-btn{
          padding:14px 48px;border-radius:12px;border:none;
          background:var(--amber);color:#000;font-size:16px;font-weight:700;
          cursor:pointer;font-family:var(--sans);transition:all .15s;
          box-shadow:0 4px 20px rgba(245,158,11,0.3);
        }
        .confirm-btn:hover{background:#fbbf24;transform:translateY(-1px)}
        .confirm-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .skip-btn{
          margin-top:14px;padding:8px 20px;border-radius:8px;border:1px solid var(--border);
          background:transparent;color:var(--muted);font-size:13px;cursor:pointer;font-family:var(--sans);
        }
        .skip-btn:hover{color:var(--text)}
        .progress-dots{display:flex;gap:6px;margin-bottom:28px}
        .dot{width:8px;height:8px;border-radius:50%;background:var(--border)}
        .dot.active{background:var(--amber);box-shadow:0 0 8px rgba(245,158,11,0.5)}
      `}</style>

      <div className="ob-root">
        <div className="progress-dots">
          <div className="dot" />
          <div className="dot active" />
          <div className="dot" />
        </div>

        <div className="ob-header">
          <h1>What type of <em>business</em> do you run?</h1>
          <p>
            This helps us personalise your AI recommendations, health score calculations,
            and marketing content for your specific industry.
          </p>
        </div>

        <div className="grid">
          {BUSINESS_TYPES.map((bt) => (
            <div
              key={bt.key}
              className={`card${selected === bt.key ? " selected" : ""}`}
              onClick={() => setSelected(bt.key)}
            >
              <div className="card-icon">{bt.icon}</div>
              <div className="card-name">{bt.key}</div>
              <div className="card-desc">{bt.desc}</div>
              {selected === bt.key && <div className="check">✓</div>}
            </div>
          ))}
        </div>

        <button className="confirm-btn" onClick={handleConfirm} disabled={!selected || saving}>
          {saving ? "Setting up your store…" : `Continue with ${selected || "selection"} →`}
        </button>

        <button className="skip-btn" onClick={() => router.push("/dashboard")}>
          Skip for now
        </button>
      </div>
    </>
  );
}
