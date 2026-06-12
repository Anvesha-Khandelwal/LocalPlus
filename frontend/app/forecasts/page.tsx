/**
 * frontend/app/forecasts/page.tsx
 * Demand forecasting page — shows predicted sales for each product.
 *
 * Layout:
 *   Top: summary bar (total predicted revenue, top growth product)
 *   Main: forecast cards grid — one per product
 *   Each card: product name, daily avg, 30-day prediction, reorder badge
 */
"use client";

import { useState, useEffect } from "react";
import { ai as aiApi, sales as salesApi } from "@/lib/api";
import { toast } from "sonner";

const INR = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function ForecastsPage() {
  const [forecasts, setForecasts]   = useState<{ product_id:string; product_name:string; daily_avg_units:number; predicted_30d_units:number; reorder_recommended:boolean }[]>([]);
  const [trends, setTrends]         = useState<{ date:string; revenue:number; profit:number }[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([aiApi.forecast(), salesApi.trends("daily", 30)])
      .then(([f, t]) => { setForecasts(f); setTrends(t); })
      .catch(() => toast.error("Failed to load forecasts"))
      .finally(() => setLoading(false));
  }, []);

  const maxUnits = Math.max(...forecasts.map((f) => f.predicted_30d_units), 1);

  return (
    <>
      <style>{`
        .fc-page { padding:28px; }
        .fc-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; margin-top:20px; }
        .fc-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 20px; transition:border-color .2s; }
        .fc-card:hover { border-color:var(--border-2); }
        .fc-name { font-size:14px; font-weight:600; color:var(--text); margin-bottom:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .fc-stat { display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px; }
        .fc-bar-track { height:6px; background:var(--border); border-radius:3px; margin:12px 0; }
        .fc-bar-fill { height:100%; border-radius:3px; background:var(--amber); transition:width 1s ease; }
        .reorder-badge { display:inline-block; padding:3px 9px; border-radius:5px; font-size:10px; font-family:var(--font-mono); font-weight:600; }
        .sk { background:linear-gradient(90deg,var(--surface) 25%,var(--border) 50%,var(--surface) 75%); background-size:200% 100%; animation:sh 1.4s infinite; border-radius:10px; }
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      <div className="fc-page">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 4 }}>Demand Forecasts</h1>
        <p style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: 20 }}>
          30-day predictions based on your sales history · updated nightly
        </p>

        {/* Simple 30-day sparkline */}
        {!loading && trends.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 12 }}>Revenue — Last 30 Days</div>
            <svg width="100%" height="60" viewBox={`0 0 ${trends.length * 20} 60`} preserveAspectRatio="none">
              {(() => {
                const max = Math.max(...trends.map((t) => t.revenue), 1);
                const pts = trends.map((t, i) => `${i * 20},${60 - (t.revenue / max) * 55}`).join(" ");
                return (
                  <>
                    <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
                    {trends.map((t, i) => (
                      <circle key={i} cx={i * 20} cy={60 - (t.revenue / max) * 55} r="2.5" fill="#f59e0b" />
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        )}

        {loading ? (
          <div className="fc-grid">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sk" style={{ height: 160 }} />)}
          </div>
        ) : forecasts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p>Not enough sales data yet for forecasting.</p>
            <p style={{ fontSize: 12, marginTop: 6, fontFamily: "var(--font-mono)" }}>Record at least 7 days of sales to see predictions.</p>
          </div>
        ) : (
          <div className="fc-grid">
            {forecasts.map((f) => (
              <div key={f.product_id} className="fc-card">
                <div className="fc-name" title={f.product_name}>{f.product_name}</div>

                <div className="fc-stat">
                  <span style={{ color: "var(--muted)" }}>Daily avg</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{f.daily_avg_units.toFixed(1)} units</span>
                </div>
                <div className="fc-stat">
                  <span style={{ color: "var(--muted)" }}>30-day forecast</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)", fontWeight: 600 }}>{f.predicted_30d_units} units</span>
                </div>

                <div className="fc-bar-track">
                  <div className="fc-bar-fill" style={{ width: `${(f.predicted_30d_units / maxUnits) * 100}%` }} />
                </div>

                <span className="reorder-badge" style={{
                  background: f.reorder_recommended ? "rgba(248,113,113,.15)" : "rgba(74,222,128,.1)",
                  color: f.reorder_recommended ? "var(--red)" : "var(--green)",
                }}>
                  {f.reorder_recommended ? "⚠ Reorder Needed" : "✓ Stock OK"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
