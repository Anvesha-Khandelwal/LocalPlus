/**
 * frontend/app/dashboard/page.tsx
 * Main command centre — KPIs, revenue chart, top products, AI insights, health score.
 * Connected to real API endpoints via lib/api.ts (sales, ai).
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { sales as salesApi, ai as aiApi } from "@/lib/api";
import { useUser } from "@/lib/store";
import { toast } from "sonner";

const fmtCompact = (n: number) =>
  n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n}`;

const today = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const INSIGHT_CFG: Record<string, { icon: string; label: string; color: string }> = {
  restock:     { icon: "📦", label: "Restock",     color: "#f87171" },
  deadstock:   { icon: "🕸️", label: "Dead Stock",  color: "#fb923c" },
  opportunity: { icon: "💡", label: "Opportunity", color: "#4ade80" },
  alert:       { icon: "📊", label: "Insight",     color: "#60a5fa" },
};
const URGENCY_DOT: Record<string, string> = { high: "#f87171", medium: "#fb923c", low: "#4ade80" };

function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600, fontFamily:"var(--font-mono)",
      color: up?"#4ade80":"#f87171", background: up?"rgba(74,222,128,.1)":"rgba(248,113,113,.1)", padding:"2px 7px", borderRadius:4 }}>
      {up?"▲":"▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function ScoreBar({ label, score, max=20 }: { label:string; score:number; max?:number }) {
  const pct=(score/max)*100;
  const color = pct>=75?"#4ade80":pct>=50?"#f59e0b":"#f87171";
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--muted)", marginBottom:4, fontFamily:"var(--font-mono)" }}>
        <span>{label}</span><span style={{ color }}>{score}/{max}</span>
      </div>
      <div style={{ height:4, background:"#1e293b", borderRadius:2 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2, transition:"width 1s ease" }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useUser();
  const [kpi, setKpi] = useState<Awaited<ReturnType<typeof salesApi.dashboard>> | null>(null);
  const [trends, setTrends] = useState<{date:string;revenue:number;profit:number}[]>([]);
  const [insights, setInsights] = useState<{id:string;type:string;urgency:string;message:string;product_name?:string}[]>([]);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof aiApi.healthScore>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<"both"|"revenue"|"profit">("both");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, t, i, h] = await Promise.all([
        salesApi.dashboard(),
        salesApi.trends("daily", 7),
        aiApi.recommendations(),
        aiApi.healthScore(),
      ]);
      setKpi(k); setTrends(t); setInsights(i); setHealth(h);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = insights.filter(i => !dismissed.includes(i.id));

  return (
    <>
      <style>{`
        .dash-root{padding:0 28px 40px;min-height:100vh}
        .header{display:flex;align-items:center;justify-content:space-between;padding:24px 0 20px;border-bottom:1px solid var(--border);margin-bottom:28px}
        .header-left h1{font-family:var(--font-serif);font-size:26px;font-weight:400}
        .header-left h1 em{color:var(--amber);font-style:italic}
        .header-left p{font-size:12px;color:var(--muted);font-family:var(--font-mono);margin-top:3px}
        .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
        .btn-p{background:var(--amber);color:#000}
        .btn-g{background:var(--surface);color:var(--text);border:1px solid var(--border)}
        .btn-g:hover{border-color:var(--amber);color:var(--amber)}
        .kpi-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
        .kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 20px 14px;position:relative;overflow:hidden;transition:all .2s}
        .kpi-card:hover{border-color:var(--accent,var(--amber));transform:translateY(-2px)}
        .kpi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent,var(--amber))}
        .kpi-icon{font-size:22px;margin-bottom:10px}
        .kpi-label{font-size:11px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.08em}
        .kpi-value{font-family:var(--font-serif);font-size:30px;margin-top:2px;line-height:1}
        .mid-row{display:grid;grid-template-columns:1fr 360px;gap:16px;margin-bottom:16px}
        .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 22px}
        .card-title{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
        .card-sub{font-size:11px;color:var(--muted);font-family:var(--font-mono);margin-bottom:18px}
        .chart-toggle{display:flex;gap:8px;margin-bottom:16px}
        .toggle-btn{font-size:11px;font-family:var(--font-mono);font-weight:500;padding:4px 10px;border-radius:5px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);transition:all .15s}
        .toggle-btn.active{background:var(--amber);color:#000;border-color:var(--amber)}
        .product-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
        .product-row:last-child{border-bottom:none}
        .bot-row{display:grid;grid-template-columns:1fr 320px;gap:16px}
        .insight-card{border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;background:rgba(255,255,255,.02);animation:slideIn .3s ease}
        @keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .insight-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
        .insight-badge{font-size:10px;font-family:var(--font-mono);font-weight:600;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.06)}
        .urgency-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .insight-msg{font-size:13px;line-height:1.55}
        .insight-actions{display:flex;gap:8px;margin-top:10px}
        .insight-btn{font-size:11px;font-family:var(--font-mono);padding:4px 10px;border-radius:5px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted)}
        .insight-btn.primary{color:var(--amber);border-color:var(--amber)}
        .score-ring{width:110px;height:110px;position:relative;margin:0 auto 10px}
        .score-ring svg{transform:rotate(-90deg)}
        .sk{background:linear-gradient(90deg,var(--surface) 25%,var(--border) 50%,var(--surface) 75%);background-size:200% 100%;animation:sh 1.5s infinite;border-radius:8px}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media(max-width:1100px){.mid-row{grid-template-columns:1fr}.bot-row{grid-template-columns:1fr}}
      `}</style>

      <div className="dash-root">
        <header className="header">
          <div className="header-left">
            <h1>Good morning, <em>{user?.name?.split(" ")[0] ?? "..."}</em> 👋</h1>
            <p>{today()} · {user?.business_name ?? "Loading..."}</p>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn btn-g" onClick={load}>↻ Refresh</button>
            <a className="btn btn-g" href="/chat" style={{ textDecoration:"none" }}>🤖 Ask AI</a>
            <a className="btn btn-p" href="/sales" style={{ textDecoration:"none" }}>+ Record Sale</a>
          </div>
        </header>

        {/* KPI strip */}
        <div className="kpi-strip">
          {loading || !kpi ? Array.from({length:4}).map((_,i)=><div key={i} className="sk" style={{height:116}}/>) : (
            <>
              <div className="kpi-card" style={{ "--accent":"#f59e0b" } as React.CSSProperties}>
                <div className="kpi-icon">₹</div>
                <div className="kpi-label">Revenue · Today</div>
                <div className="kpi-value">{fmtCompact(kpi.revenue)}</div>
                <div style={{marginTop:6}}><Delta pct={kpi.revenue_change_pct}/></div>
              </div>
              <div className="kpi-card" style={{ "--accent":"#4ade80" } as React.CSSProperties}>
                <div className="kpi-icon">📈</div>
                <div className="kpi-label">Profit · Today</div>
                <div className="kpi-value">{fmtCompact(kpi.profit)}</div>
                <div style={{marginTop:6}}><Delta pct={kpi.profit_change_pct}/></div>
              </div>
              <div className="kpi-card" style={{ "--accent":"#60a5fa" } as React.CSSProperties}>
                <div className="kpi-icon">📦</div>
                <div className="kpi-label">Units Sold</div>
                <div className="kpi-value">{kpi.units_sold.toLocaleString("en-IN")}</div>
                <div style={{marginTop:6}}><Delta pct={kpi.units_change_pct}/></div>
              </div>
              <div className="kpi-card" style={{ "--accent":"#f87171" } as React.CSSProperties}>
                <div className="kpi-icon">🧾</div>
                <div className="kpi-label">Transactions</div>
                <div className="kpi-value">{kpi.transaction_count}</div>
              </div>
            </>
          )}
        </div>

        {/* Mid row */}
        <div className="mid-row">
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div className="card-title">Revenue & Profit Trend</div>
                <div className="card-sub">Last 7 days</div>
              </div>
              <div className="chart-toggle">
                {(["both","revenue","profit"] as const).map(m=>(
                  <button key={m} className={`toggle-btn${activeChart===m?" active":""}`} onClick={()=>setActiveChart(m)}>
                    {m.charAt(0).toUpperCase()+m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {loading ? <div className="sk" style={{height:220,marginTop:8}}/> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trends} margin={{top:4,right:4,left:-20,bottom:0}}>
                  <defs>
                    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false}/>
                  <XAxis dataKey="date" tick={{fill:"#64748b",fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmtCompact}/>
                  <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,fontSize:12}}/>
                  {(activeChart==="both"||activeChart==="revenue") && <Area type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} fill="url(#gr)"/>}
                  {(activeChart==="both"||activeChart==="profit") && <Area type="monotone" dataKey="profit" stroke="#4ade80" strokeWidth={2} fill="url(#gp)"/>}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-title">Top Products</div>
            <div className="card-sub">By revenue today</div>
            {loading ? Array.from({length:5}).map((_,i)=><div key={i} className="sk" style={{height:44,marginBottom:8}}/>) :
              (kpi?.top_products ?? []).length===0 ? <div style={{textAlign:"center",padding:"24px 0",color:"var(--muted)",fontSize:13}}>No sales yet today</div> :
              kpi!.top_products.map((p,idx)=>(
                <div key={p.name} className="product-row">
                  <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--muted)",width:20,textAlign:"center"}}>#{idx+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--amber)",fontWeight:600}}>{fmtCompact(p.revenue)}</div>
                    <div style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--muted)"}}>{p.units} units</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Bottom row */}
        <div className="bot-row">
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div className="card-title">🤖 AI Insights</div>
              <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>{visible.length} active</span>
            </div>
            <div className="card-sub">Personalised recommendations</div>
            {loading ? Array.from({length:3}).map((_,i)=><div key={i} className="sk" style={{height:90,marginBottom:10}}/>) :
              visible.length===0 ? <div style={{textAlign:"center",padding:"32px 0",color:"var(--muted)",fontSize:13}}>✅ All caught up!</div> :
              visible.map(ins=>{
                const cfg=INSIGHT_CFG[ins.type]??INSIGHT_CFG.alert;
                return (
                  <div key={ins.id} className="insight-card">
                    <div className="insight-header">
                      <span style={{fontSize:16}}>{cfg.icon}</span>
                      <span className="insight-badge" style={{color:cfg.color}}>{cfg.label}</span>
                      {ins.product_name && <span style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>— {ins.product_name}</span>}
                      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
                        <div className="urgency-dot" style={{background:URGENCY_DOT[ins.urgency]}}/>
                        <span style={{fontSize:10,color:"var(--muted)",fontFamily:"var(--font-mono)",textTransform:"uppercase"}}>{ins.urgency}</span>
                      </div>
                    </div>
                    <div className="insight-msg">{ins.message}</div>
                    <div className="insight-actions">
                      <a className="insight-btn primary" href="/chat" style={{textDecoration:"none"}}>Tell me more →</a>
                      <button className="insight-btn" onClick={()=>setDismissed(p=>[...p,ins.id])}>Dismiss</button>
                    </div>
                  </div>
                );
              })
            }
          </div>

          <div className="card">
            <div className="card-title">Business Health Score</div>
            <div className="card-sub">Updates daily</div>
            {loading || !health ? <div className="sk" style={{height:300}}/> : (
              <>
                <div className="score-ring">
                  <svg width="110" height="110" viewBox="0 0 110 110">
                    <circle cx="55" cy="55" r="46" fill="none" stroke="#1a2540" strokeWidth="8"/>
                    <circle cx="55" cy="55" r="46" fill="none"
                      stroke={health.total>=70?"#4ade80":health.total>=50?"#f59e0b":"#f87171"}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2*Math.PI*46}`}
                      strokeDashoffset={`${2*Math.PI*46*(1-health.total/100)}`}
                      style={{transition:"stroke-dashoffset 1.2s ease"}}/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-serif)",fontSize:30}}>
                    {health.total}
                  </div>
                </div>
                <div style={{textAlign:"center",fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:14}}>out of 100</div>
                <ScoreBar label="Revenue Growth" score={health.revenue_growth}/>
                <ScoreBar label="Inventory Efficiency" score={health.inventory_efficiency}/>
                <ScoreBar label="Profit Margin" score={health.profit_margin}/>
                <ScoreBar label="Stock Turnover" score={health.stock_turnover}/>
                <ScoreBar label="Dead Stock Ratio" score={health.dead_stock}/>
                <div style={{marginTop:18}}>
                  <div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Suggestions</div>
                  {health.suggestions.map((s,i)=>(
                    <div key={i} style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,padding:"8px 10px",borderRadius:7,marginBottom:6,background:"rgba(255,255,255,.03)",border:"1px solid var(--border)",cursor:"pointer"}}>
                      <span style={{color:"var(--amber)",marginRight:6}}>→</span>{s}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
