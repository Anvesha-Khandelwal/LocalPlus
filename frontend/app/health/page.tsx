/**
 * frontend/app/health/page.tsx
 * Updated: insufficient_data fallback state, updated dimension labels,
 * customer_engagement dimension, action-oriented onboarding links.
 */
"use client";
import { useState, useEffect } from "react";
import { ai as aiApi } from "@/lib/api";
import { toast } from "sonner";

const DIMS = [
  { key: "revenue_growth",        label: "Sales Trends",           desc: "Is your revenue trending upwards?" },
  { key: "inventory_efficiency",  label: "Low Stock Products",     desc: "How well are you managing stock levels?" },
  { key: "profit_margin",         label: "Revenue Performance",    desc: "Average profit margin across all sales" },
  { key: "stock_turnover",        label: "Inventory Turnover",     desc: "How quickly products sell through" },
  { key: "customer_engagement",   label: "Customer Engagement",    desc: "Ratio of repeat customers to total customers" },
];

function scoreColor(v: number, max = 20) {
  const p = v / max;
  return p >= 0.75 ? "#4ade80" : p >= 0.5 ? "#f59e0b" : "#f87171";
}

function ScoreRing({ score }: { score: number }) {
  const r = 70, circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#4ade80" : score >= 50 ? "#f59e0b" : "#f87171";
  return (
    <div style={{ position: "relative", width: 160, height: 160 }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="#1a2540" strokeWidth="10" />
        <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ.toFixed(2)}
          strokeDashoffset={(circ * (1 - score / 100)).toFixed(2)}
          style={{ transition: "stroke-dashoffset 1.5s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 48, lineHeight: 1, color: "#e2e8f0" }}>{score}</span>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--font-mono)" }}>/ 100</span>
      </div>
    </div>
  );
}

interface HealthData {
  insufficient_data: boolean;
  total: number;
  revenue_growth: number;
  inventory_efficiency: number;
  profit_margin: number;
  stock_turnover: number;
  customer_engagement: number;
  suggestions: string[];
}

export default function HealthPage() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    aiApi.healthScore()
      .then(setData)
      .catch(() => toast.error("Failed to load health score"))
      .finally(() => setLoading(false));
  }, []);

  const grade = (s: number) => s >= 80 ? "Excellent" : s >= 65 ? "Good" : s >= 50 ? "Average" : "Needs Work";

  return (
    <>
      <style>{`
        .hs-page{padding:28px;max-width:900px}
        .hs-top{display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:center;background:#0d1526;border:1px solid #1a2540;border-radius:14px;padding:32px;margin-bottom:20px}
        .dim-row{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid #1a2540}
        .dim-row:last-child{border:none}
        .dim-bar-track{flex:1;height:6px;background:#1a2540;border-radius:3px}
        .dim-bar-fill{height:100%;border-radius:3px;transition:width 1.2s ease}
        .sug-card{background:#0d1526;border:1px solid #1a2540;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;cursor:pointer;transition:border-color .15s}
        .sug-card:hover{border-color:#243050}
        .onboard-step{display:flex;align-items:center;gap:14px;padding:16px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:10px;margin-bottom:10px;cursor:pointer;transition:all .15s}
        .onboard-step:hover{background:rgba(245,158,11,.1)}
        .step-num{width:32px;height:32px;border-radius:50%;background:#f59e0b;color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
        .sk{background:linear-gradient(90deg,#0d1526 25%,#1a2540 50%,#0d1526 75%);background-size:200% 100%;animation:sh 1.4s infinite;border-radius:10px}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media(max-width:600px){.hs-top{grid-template-columns:1fr;text-align:center;justify-items:center}}
      `}</style>

      <div className="hs-page">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 4, color: "#e2e8f0" }}>Business Health Score</h1>
        <p style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--font-mono)", marginBottom: 20 }}>
          AI-generated assessment · recalculated every night at midnight
        </p>

        {loading ? (
          <>
            <div className="sk" style={{ height: 200, marginBottom: 20 }} />
            <div className="sk" style={{ height: 300 }} />
          </>
        ) : data?.insufficient_data ? (
          /* ── Fallback state for new accounts ── */
          <div>
            <div style={{ background: "#0d1526", border: "1px solid #1a2540", borderRadius: 14, padding: 32, marginBottom: 20, textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 26, color: "#e2e8f0", marginBottom: 8 }}>
                Not enough data yet
              </h2>
              <p style={{ color: "#64748b", fontSize: 14, maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.6 }}>
                Your Business Health Score will appear after you've added products and recorded at least one sale.
                Complete these steps to get your score:
              </p>

              <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "left" }}>
                {[
                  { step: 1, label: "Add your products to Inventory", href: "/inventory", icon: "📦" },
                  { step: 2, label: "Record your first sale in POS",  href: "/sales",     icon: "🧾" },
                  { step: 3, label: "Come back after a week of data", href: "/dashboard", icon: "📈" },
                ].map((s) => (
                  <div key={s.step} className="onboard-step" onClick={() => window.location.href = s.href}>
                    <div className="step-num">{s.step}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{s.icon} {s.label}</div>
                    </div>
                    <span style={{ marginLeft: "auto", color: "#f59e0b", fontSize: 18 }}>→</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#0d1526", border: "1px solid #1a2540", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#64748b", marginBottom: 12 }}>
                What the Health Score measures
              </div>
              {DIMS.map((dim) => (
                <div key={dim.key} className="dim-row">
                  <div style={{ width: 180, flexShrink: 0 }}>
                    <div style={{ fontSize: 13, color: "#e2e8f0" }}>{dim.label}</div>
                    <div style={{ fontSize: 10, color: "#64748b", fontFamily: "var(--font-mono)" }}>{dim.desc}</div>
                  </div>
                  <div className="dim-bar-track">
                    <div className="dim-bar-fill" style={{ width: "0%", background: "#1a2540" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#64748b", width: 50, textAlign: "right", flexShrink: 0 }}>—/20</div>
                </div>
              ))}
            </div>
          </div>
        ) : data ? (
          /* ── Full score view ── */
          <>
            <div className="hs-top">
              <ScoreRing score={data.total} />
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 36, color: scoreColor(data.total, 100), marginBottom: 6 }}>
                  {grade(data.total)}
                </div>
                <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.6, maxWidth: 420 }}>
                  Your business is scoring <strong style={{ color: "#e2e8f0" }}>{data.total}/100</strong>. Focus on the lowest-scoring areas below for the biggest improvement.
                </p>
              </div>
            </div>

            <div style={{ background: "#0d1526", border: "1px solid #1a2540", borderRadius: 12, padding: "20px 22px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#64748b", marginBottom: 14 }}>
                Score Breakdown
              </div>
              {DIMS.map((dim) => {
                const v = (data as unknown as Record<string, number>)[dim.key] as number;
                const c = scoreColor(v);
                return (
                  <div key={dim.key} className="dim-row">
                    <div style={{ width: 180, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, color: "#e2e8f0" }}>{dim.label}</div>
                      <div style={{ fontSize: 10, color: "#64748b", fontFamily: "var(--font-mono)" }}>{dim.desc}</div>
                    </div>
                    <div className="dim-bar-track">
                      <div className="dim-bar-fill" style={{ width: `${(v / 20) * 100}%`, background: c }} />
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: c, width: 50, textAlign: "right", flexShrink: 0 }}>
                      {v}/20
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#64748b", marginBottom: 12 }}>
                AI Improvement Suggestions
              </div>
              {data.suggestions.map((s, i) => (
                <div key={i} className="sug-card">
                  <span style={{ color: "#f59e0b", fontSize: 18, flexShrink: 0 }}>→</span>
                  <div>
                    <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.6 }}>{s}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
