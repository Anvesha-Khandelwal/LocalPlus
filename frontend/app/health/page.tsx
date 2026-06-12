/**
 * frontend/app/health/page.tsx
 * Business Health Score full page — animated score ring + sub-scores + AI suggestions.
 */
"use client";

import { useState, useEffect } from "react";
import { ai as aiApi } from "@/lib/api";
import { toast } from "sonner";

interface HealthData { total:number; revenue_growth:number; inventory_efficiency:number; profit_margin:number; stock_turnover:number; dead_stock:number; suggestions:string[] }

const DIMS = [
  { key: "revenue_growth",         label: "Revenue Growth",         desc: "Is your revenue trending up?" },
  { key: "inventory_efficiency",   label: "Inventory Efficiency",   desc: "How well are you managing stock levels?" },
  { key: "profit_margin",          label: "Profit Margin",          desc: "Average margin across all sales" },
  { key: "stock_turnover",         label: "Stock Turnover",         desc: "How quickly products sell through" },
  { key: "dead_stock",             label: "Dead Stock",             desc: "Products sitting unsold > 30 days" },
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
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 48, lineHeight: 1, color: "var(--text)" }}>{score}</span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>/ 100</span>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const [data, setData]     = useState<HealthData | null>(null);
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
        .hs-page { padding:28px; max-width:900px; }
        .hs-top { display:grid; grid-template-columns:auto 1fr; gap:40px; align-items:center; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:32px; margin-bottom:20px; }
        .dim-row { display:flex; align-items:center; gap:14px; padding:14px 0; border-bottom:1px solid var(--border); }
        .dim-row:last-child { border:none; }
        .dim-bar-track { flex:1; height:6px; background:var(--border); border-radius:3px; }
        .dim-bar-fill { height:100%; border-radius:3px; transition:width 1.2s ease; }
        .sug-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-bottom:10px; display:flex; gap:12px; align-items:flex-start; cursor:pointer; transition:border-color .15s; }
        .sug-card:hover { border-color:var(--border-2); }
        .sk { background:linear-gradient(90deg,var(--surface) 25%,var(--border) 50%,var(--surface) 75%); background-size:200% 100%; animation:sh 1.4s infinite; border-radius:10px; }
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media(max-width:600px){.hs-top{grid-template-columns:1fr;text-align:center;justify-items:center}}
      `}</style>

      <div className="hs-page">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 4 }}>Business Health Score</h1>
        <p style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: 20 }}>
          AI-generated assessment · recalculated every night at midnight
        </p>

        {loading ? (
          <>
            <div className="sk" style={{ height: 200, marginBottom: 20 }} />
            <div className="sk" style={{ height: 300 }} />
          </>
        ) : data ? (
          <>
            {/* Score ring + grade */}
            <div className="hs-top">
              <ScoreRing score={data.total} />
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 36, color: scoreColor(data.total, 100), marginBottom: 6 }}>
                  {grade(data.total)}
                </div>
                <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, maxWidth: 420 }}>
                  Your business is scoring <strong style={{ color: "var(--text)" }}>{data.total}/100</strong>. Focus on the lowest-scoring areas below for the biggest improvements.
                </p>
                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {["revenue_growth", "dead_stock"].map((k) => {
                    const v = (data as Record<string, number>)[k];
                    return (
                      <span key={k} style={{ fontSize: 11, fontFamily: "var(--font-mono)", padding: "3px 10px", borderRadius: 5, background: `${scoreColor(v)}22`, color: scoreColor(v) }}>
                        {DIMS.find((d) => d.key === k)?.label}: {v}/20
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sub-scores */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 14 }}>Score Breakdown</div>
              {DIMS.map((dim) => {
                const v = (data as Record<string, number>)[dim.key] as number;
                const c = scoreColor(v);
                return (
                  <div key={dim.key} className="dim-row">
                    <div style={{ width: 180, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--text)" }}>{dim.label}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{dim.desc}</div>
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

            {/* Suggestions */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 12 }}>
                AI Improvement Suggestions
              </div>
              {data.suggestions.map((s, i) => (
                <div key={i} className="sug-card">
                  <span style={{ color: "var(--amber)", fontSize: 18, flexShrink: 0 }}>→</span>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{s}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 4 }}>Click to discuss with AI →</div>
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
