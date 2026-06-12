/**
 * frontend/app/customers/page.tsx
 * Customer list with RFM segment filter and segment summary cards.
 */
"use client";
import { useState, useEffect } from "react";
import { customers as custApi } from "@/lib/api";
import { toast } from "sonner";

const INR = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const SEGMENTS = ["champion","loyal","at_risk","lost"] as const;
const SEG_COLOR: Record<string, string> = { champion:"#4ade80", loyal:"#60a5fa", at_risk:"#fb923c", lost:"#f87171", unknown:"#64748b" };
const SEG_ICON:  Record<string, string> = { champion:"🏆", loyal:"💙", at_risk:"⚠️", lost:"😔", unknown:"❓" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<{ id:string;name?:string;phone?:string;segment?:string;total_spent:number;visit_count:number }[]>([]);
  const [segments, setSegments]   = useState<Record<string, number>>({});
  const [activeSegment, setActive] = useState<string|null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(()=>{
    Promise.all([custApi.list(), custApi.segments()])
      .then(([c,s])=>{ setCustomers(c); setSegments(s); })
      .catch(()=>toast.error("Failed to load customers"))
      .finally(()=>setLoading(false));
  },[]);

  const filtered = activeSegment ? customers.filter(c=>c.segment===activeSegment) : customers;

  return (
    <>
      <style>{`
        .cust-page{padding:28px}
        .seg-strip{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
        .seg-card{padding:10px 16px;border-radius:9px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:all .15s;text-align:center;min-width:100px}
        .seg-card.on{border-color:var(--amber)}
        .seg-card:hover:not(.on){border-color:var(--border-2)}
        table{width:100%;border-collapse:collapse}
        th{font-size:10px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);background:var(--surface-2)}
        td{padding:10px 14px;font-size:13px;border-bottom:1px solid var(--border)}
        tr:last-child td{border:none}
        tr:hover td{background:rgba(255,255,255,.02)}
        .sk{background:linear-gradient(90deg,var(--surface) 25%,var(--border) 50%,var(--surface) 75%);background-size:200% 100%;animation:sh 1.4s infinite;border-radius:8px}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>
      <div className="cust-page">
        <h1 style={{fontFamily:"var(--font-serif)",fontSize:26,marginBottom:4}}>Customers</h1>
        <p style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--font-mono)",marginBottom:20}}>RFM segmentation · updated weekly</p>

        {/* Segment filter */}
        <div className="seg-strip">
          <div className={`seg-card${!activeSegment?" on":""}`} onClick={()=>setActive(null)}>
            <div style={{fontSize:11,color:"var(--muted)",fontFamily:"var(--font-mono)"}}>ALL</div>
            <div style={{fontFamily:"var(--font-serif)",fontSize:20}}>{customers.length}</div>
          </div>
          {SEGMENTS.map(s=>(
            <div key={s} className={`seg-card${activeSegment===s?" on":""}`} onClick={()=>setActive(activeSegment===s?null:s)}>
              <div style={{fontSize:18,marginBottom:2}}>{SEG_ICON[s]}</div>
              <div style={{fontSize:10,color:SEG_COLOR[s],fontFamily:"var(--font-mono)",textTransform:"uppercase"}}>{s.replace("_"," ")}</div>
              <div style={{fontFamily:"var(--font-serif)",fontSize:20}}>{segments[s]??0}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
          {loading?(
            <div style={{padding:20}}>{Array.from({length:6}).map((_,i)=><div key={i} className="sk" style={{height:44,marginBottom:8}}/>)}</div>
          ):(
            <table>
              <thead><tr><th>Customer</th><th>Phone</th><th>Segment</th><th>Total Spent</th><th>Visits</th></tr></thead>
              <tbody>
                {filtered.length===0?(
                  <tr><td colSpan={5} style={{textAlign:"center",padding:"40px 0",color:"var(--muted)"}}>No customers found</td></tr>
                ):filtered.map(c=>(
                  <tr key={c.id}>
                    <td style={{fontWeight:500}}>{c.name||"Anonymous"}</td>
                    <td style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--muted)"}}>{c.phone||"—"}</td>
                    <td>
                      {c.segment && (
                        <span style={{fontSize:11,fontFamily:"var(--font-mono)",padding:"2px 8px",borderRadius:4,background:`${SEG_COLOR[c.segment||"unknown"]}22`,color:SEG_COLOR[c.segment||"unknown"]}}>
                          {SEG_ICON[c.segment||"unknown"]} {c.segment.replace("_"," ")}
                        </span>
                      )}
                    </td>
                    <td style={{fontFamily:"var(--font-mono)",color:"var(--amber)"}}>{INR(c.total_spent)}</td>
                    <td style={{fontFamily:"var(--font-mono)",color:"var(--muted)"}}>{c.visit_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
