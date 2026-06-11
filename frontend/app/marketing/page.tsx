/**
 * frontend/app/marketing/page.tsx
 * AI Marketing Content Generator — creates WhatsApp, Instagram, and offer messages.
 *
 * Layout:
 *   Left: content type selector + generate button
 *   Right: generated variants (3 options with tone labels + copy button)
 */
"use client";

import { useState } from "react";
import { ai as aiApi } from "@/lib/api";
import { toast } from "sonner";

const CONTENT_TYPES = [
  { key: "whatsapp",  icon: "💬", label: "WhatsApp",  desc: "Broadcast message for customer groups" },
  { key: "instagram", icon: "📸", label: "Instagram", desc: "Caption + hashtags for product posts"  },
  { key: "offer",     icon: "🏷️",  label: "Offer",     desc: "Sale / discount announcement"         },
];

export default function MarketingPage() {
  const [contentType, setContentType] = useState("whatsapp");
  const [loading, setLoading]         = useState(false);
  const [variants, setVariants]       = useState<{ tone: string; message: string }[]>([]);

  const generate = async () => {
    setLoading(true);
    try {
      const result = await aiApi.marketingContent(contentType);
      setVariants(result.variants ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <>
      <style>{`
        .mkt-page { padding:28px; display:grid; grid-template-columns:280px 1fr; gap:20px; min-height:100vh; }
        .mkt-sidebar { display:flex; flex-direction:column; gap:10px; }
        .ctype-card { padding:14px 16px; border-radius:10px; border:1px solid var(--border); background:var(--surface); cursor:pointer; transition:all .15s; }
        .ctype-card.on { border-color:var(--amber); background:rgba(245,158,11,.08); }
        .ctype-card:hover:not(.on) { border-color:var(--border-2); }
        .ctype-icon { font-size:24px; margin-bottom:6px; }
        .ctype-label { font-size:13px; font-weight:600; color:var(--text); }
        .ctype-desc { font-size:11px; color:var(--muted); font-family:var(--font-mono); margin-top:2px; }
        .gen-btn { padding:12px; border-radius:10px; border:none; background:var(--amber); color:#000; font-size:14px; font-weight:700; cursor:pointer; margin-top:8px; transition:all .15s; }
        .gen-btn:hover { background:var(--amber-2); }
        .gen-btn:disabled { opacity:.6; cursor:not-allowed; }
        .variant-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 22px; margin-bottom:14px; }
        .variant-tone { font-size:10px; font-family:var(--font-mono); font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--amber); margin-bottom:10px; }
        .variant-msg { font-size:14px; color:var(--text); line-height:1.7; white-space:pre-wrap; }
        .copy-btn { margin-top:12px; padding:7px 14px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--muted); font-size:12px; cursor:pointer; transition:all .15s; }
        .copy-btn:hover { border-color:var(--amber); color:var(--amber); }
        @media(max-width:700px){.mkt-page{grid-template-columns:1fr}}
      `}</style>

      <div className="mkt-page">
        <div className="mkt-sidebar">
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 4 }}>Marketing AI</h1>
          <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginBottom: 10 }}>
            Generate promotional content based on your top products
          </p>

          {CONTENT_TYPES.map((c) => (
            <div key={c.key} className={`ctype-card${contentType === c.key ? " on" : ""}`} onClick={() => setContentType(c.key)}>
              <div className="ctype-icon">{c.icon}</div>
              <div className="ctype-label">{c.label}</div>
              <div className="ctype-desc">{c.desc}</div>
            </div>
          ))}

          <button className="gen-btn" onClick={generate} disabled={loading}>
            {loading ? "✨ Generating…" : "✨ Generate Content"}
          </button>
        </div>

        <div>
          {variants.length === 0 && !loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "var(--muted)" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✨</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 8, color: "var(--text)" }}>
                Generate AI Content
              </h2>
              <p style={{ fontSize: 13 }}>
                Select a content type on the left and click Generate.<br />
                The AI will create 3 variants based on your best-selling products.
              </p>
            </div>
          ) : loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: 140, borderRadius: 12, marginBottom: 14, background: "linear-gradient(90deg,var(--surface) 25%,var(--border) 50%,var(--surface) 75%)", backgroundSize: "200% 100%", animation: "sh 1.4s infinite" }} />
            ))
          ) : (
            variants.map((v, i) => (
              <div key={i} className="variant-card">
                <div className="variant-tone">Option {i + 1} · {v.tone}</div>
                <div className="variant-msg">{v.message}</div>
                <button className="copy-btn" onClick={() => copy(v.message)}>📋 Copy</button>
              </div>
            ))
          )}
        </div>
      </div>
      <style>{`@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </>
  );
}
