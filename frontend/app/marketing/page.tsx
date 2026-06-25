/**
 * frontend/app/marketing/page.tsx
 * Updated: distinct WhatsApp vs Instagram generation strategies,
 * better previews, copy button, character count.
 */
"use client";
import { useState } from "react";
import { ai as aiApi } from "@/lib/api";
import { toast } from "sonner";

const CONTENT_TYPES = [
  { key: "whatsapp",  icon: "💬", label: "WhatsApp",  desc: "Short, direct, conversational broadcast" },
  { key: "instagram", icon: "📸", label: "Instagram", desc: "Storytelling caption + emojis + hashtags"  },
  { key: "offer",     icon: "🏷️", label: "Offer",     desc: "Sale / discount / clearance announcement"  },
];

const CHANNEL_TIPS: Record<string, string> = {
  whatsapp:  "Best for: under 60 words · personal tone · one clear CTA · max 2 emojis",
  instagram: "Best for: 80-120 words · storytelling · 4-6 emojis · 8-10 hashtags · strong CTA",
  offer:     "Best for: urgent tone · prominent discount · limited time · store name featured",
};

export default function MarketingPage() {
  const [contentType, setContentType] = useState("whatsapp");
  const [loading, setLoading]         = useState(false);
  const [variants, setVariants]       = useState<{ tone: string; message: string }[]>([]);
  const [copied, setCopied]           = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    setVariants([]);
    try {
      const result = await aiApi.marketingContent(contentType);
      setVariants(result.variants ?? []);
      if ((result.variants ?? []).length === 0) toast.warning("No content generated. Try again.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Generation failed. Check API key.");
    } finally { setLoading(false); }
  };

  const copy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Copy failed — please select and copy manually.");
    }
  };

  const channelColor: Record<string, string> = {
    whatsapp: "#4ade80", instagram: "#f59e0b", offer: "#f87171"
  };

  return (
    <>
      <style>{`
        .mkt-page{padding:28px;display:grid;grid-template-columns:280px 1fr;gap:20px;min-height:100vh}
        .mkt-sidebar{display:flex;flex-direction:column;gap:10px}
        .ctype-card{padding:14px 16px;border-radius:10px;border:1px solid #1a2540;background:#0d1526;cursor:pointer;transition:all .15s}
        .ctype-card.on{border-color:#f59e0b;background:rgba(245,158,11,.08)}
        .ctype-card:hover:not(.on){border-color:#243050}
        .ctype-icon{font-size:24px;margin-bottom:6px}
        .ctype-label{font-size:13px;font-weight:600;color:#e2e8f0}
        .ctype-desc{font-size:11px;color:#64748b;font-family:var(--font-mono);margin-top:2px}
        .gen-btn{padding:12px;border-radius:10px;border:none;background:#f59e0b;color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;transition:all .15s;font-family:var(--font-sans)}
        .gen-btn:hover{background:#fbbf24}
        .gen-btn:disabled{opacity:.6;cursor:not-allowed}
        .tip-box{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:10px 12px;font-size:11px;color:#f59e0b;font-family:var(--font-mono);line-height:1.5;margin-top:8px}
        .variant-card{background:#0d1526;border:1px solid #1a2540;border-radius:12px;padding:20px 22px;margin-bottom:14px;transition:border-color .15s}
        .variant-card:hover{border-color:#243050}
        .variant-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .variant-tone{font-size:11px;font-family:var(--font-mono);font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:3px 10px;border-radius:5px}
        .variant-msg{font-size:14px;color:#e2e8f0;line-height:1.75;white-space:pre-wrap;background:rgba(255,255,255,.02);border:1px solid #1a2540;border-radius:8px;padding:14px;min-height:80px}
        .variant-footer{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
        .char-count{font-size:10px;color:#64748b;font-family:var(--font-mono)}
        .copy-btn{padding:7px 14px;border-radius:7px;border:1px solid #1a2540;background:transparent;color:#64748b;font-size:12px;cursor:pointer;transition:all .15s;font-family:var(--font-sans)}
        .copy-btn.copied{border-color:#4ade80;color:#4ade80;background:rgba(74,222,128,.08)}
        .copy-btn:not(.copied):hover{border-color:#f59e0b;color:#f59e0b}
        .sk{background:linear-gradient(90deg,#0d1526 25%,#1a2540 50%,#0d1526 75%);background-size:200% 100%;animation:sh 1.4s infinite;border-radius:12px}
        @keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @media(max-width:700px){.mkt-page{grid-template-columns:1fr}}
      `}</style>

      <div className="mkt-page">
        {/* Sidebar */}
        <div className="mkt-sidebar">
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 4, color: "#e2e8f0" }}>Marketing AI</h1>
          <p style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
            Generate content based on your top products
          </p>

          {CONTENT_TYPES.map((c) => (
            <div key={c.key} className={`ctype-card${contentType === c.key ? " on" : ""}`} onClick={() => setContentType(c.key)}>
              <div className="ctype-icon">{c.icon}</div>
              <div className="ctype-label">{c.label}</div>
              <div className="ctype-desc">{c.desc}</div>
            </div>
          ))}

          <div className="tip-box">
            💡 {CHANNEL_TIPS[contentType]}
          </div>

          <button className="gen-btn" onClick={generate} disabled={loading}>
            {loading ? "✨ Generating…" : "✨ Generate 3 Variants"}
          </button>
        </div>

        {/* Content area */}
        <div>
          {variants.length === 0 && !loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#64748b" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✨</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 8, color: "#e2e8f0" }}>
                Generate AI Marketing Content
              </h2>
              <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>
                Select a content type on the left and click Generate.<br />
                The AI creates 3 variants based on your best-selling products and business type.
              </p>
            </div>
          ) : loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="sk" style={{ height: 160, marginBottom: 14 }} />
            ))
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: channelColor[contentType] }} />
                <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--font-mono)" }}>
                  {CONTENT_TYPES.find((c) => c.key === contentType)?.label} · {variants.length} variants generated
                </span>
              </div>
              {variants.map((v, i) => (
                <div key={i} className="variant-card">
                  <div className="variant-header">
                    <span className="variant-tone" style={{
                      background: `${channelColor[contentType]}18`,
                      color: channelColor[contentType],
                    }}>
                      Option {i + 1} · {v.tone}
                    </span>
                  </div>
                  <div className="variant-msg">{v.message}</div>
                  <div className="variant-footer">
                    <span className="char-count">{v.message.length} characters</span>
                    <button
                      className={`copy-btn${copied === i ? " copied" : ""}`}
                      onClick={() => copy(v.message, i)}
                    >
                      {copied === i ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
