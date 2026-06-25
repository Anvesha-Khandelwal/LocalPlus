/**
 * frontend/app/chat/page.tsx
 * Updated: typing dots animation, better error display, auto-scroll, offline mode message.
 */
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ai } from "@/lib/api";
import { useUser } from "@/lib/store";

interface Message { role: "user" | "assistant"; content: string; id: string; isError?: boolean }

const SUGGESTIONS = [
  "What products should I reorder this week?",
  "Why have my sales dropped recently?",
  "Which product has the best profit margin?",
  "What offers should I run this month?",
  "Which products are not selling?",
  "How can I increase my daily revenue?",
];

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, `<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:12px">$1</code>`)
    .replace(/^- (.+)$/gm, `<div style="display:flex;gap:6px;margin:3px 0"><span style="color:#f59e0b;flex-shrink:0">•</span><span>$1</span></div>`)
    .replace(/\n/g, "<br/>");
}

export default function ChatPage() {
  const user = useUser();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message  = { role: "user",      content: text.trim(), id: Date.now().toString() };
    const assistantId       = (Date.now() + 1).toString();
    const assistantMsg: Message = { role: "assistant", content: "", id: assistantId };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);
    setStreamingId(assistantId);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      for await (const chunk of ai.chat(text.trim(), history.slice(-6))) {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m)
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "AI service unavailable.";
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId
          ? { ...m, content: `❌ **Error:** ${errMsg}\n\nMake sure your API key is set in \`backend/.env\`.`, isError: true }
          : m)
      );
    } finally {
      setStreaming(false);
      setStreamingId(null);
      inputRef.current?.focus();
    }
  }, [messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <>
      <style>{`
        .chat-page{display:flex;flex-direction:column;height:100vh;background:#080e1a}
        .chat-header{padding:20px 28px 16px;border-bottom:1px solid #1a2540;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
        .messages{flex:1;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:16px}
        .msg{max-width:720px;animation:fadeIn .2s ease}
        .msg-user{align-self:flex-end}
        .msg-assistant{align-self:flex-start}
        .msg-bubble{padding:12px 16px;border-radius:12px;font-size:14px;line-height:1.6}
        .msg-user .msg-bubble{background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);border-bottom-right-radius:3px;color:#e2e8f0}
        .msg-assistant .msg-bubble{background:#0d1526;border:1px solid #1a2540;border-bottom-left-radius:3px}
        .msg-error .msg-bubble{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.3)}
        .msg-meta{font-size:10px;color:#64748b;font-family:var(--font-mono);margin-top:4px}
        .msg-user .msg-meta{text-align:right}
        /* Typing indicator */
        .typing-dots{display:inline-flex;align-items:center;gap:4px;padding:4px 0}
        .typing-dot{width:7px;height:7px;border-radius:50%;background:#f59e0b;opacity:.4;animation:pulse 1.2s ease-in-out infinite}
        .typing-dot:nth-child(2){animation-delay:.2s}
        .typing-dot:nth-child(3){animation-delay:.4s}
        @keyframes pulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.2)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        .cursor{display:inline-block;width:2px;height:14px;background:#f59e0b;margin-left:2px;animation:blink .8s infinite;vertical-align:middle}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        .suggestions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
        .sug-btn{padding:8px 14px;border-radius:20px;border:1px solid #1a2540;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;transition:all .15s;font-family:var(--font-sans)}
        .sug-btn:hover{border-color:#f59e0b;color:#f59e0b}
        .input-area{padding:16px 28px 24px;border-top:1px solid #1a2540;flex-shrink:0}
        .input-wrap{display:flex;gap:10px;align-items:flex-end;background:#0d1526;border:1px solid #1a2540;border-radius:12px;padding:10px 14px;transition:border-color .15s}
        .input-wrap:focus-within{border-color:#f59e0b}
        .chat-input{flex:1;background:transparent;border:none;color:#e2e8f0;font-size:14px;font-family:var(--font-sans);resize:none;outline:none;max-height:120px;line-height:1.5}
        .send-btn{padding:8px 16px;border-radius:8px;border:none;background:#f59e0b;color:#000;font-weight:700;cursor:pointer;font-size:13px;flex-shrink:0;transition:all .15s}
        .send-btn:disabled{opacity:.5;cursor:not-allowed}
        .send-btn:not(:disabled):hover{background:#fbbf24}
        .offline-notice{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:#f59e0b;font-family:var(--font-mono);margin-bottom:16px}
      `}</style>

      <div className="chat-page">
        <div className="chat-header">
          <div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "#e2e8f0" }}>🤖 AI Business Copilot</h1>
            <p style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              Ask anything about your business · powered by AI
            </p>
          </div>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid #1a2540", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
              Clear chat
            </button>
          )}
        </div>

        <div className="messages">
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🤖</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 8, color: "#e2e8f0" }}>
                Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
              </h2>
              <p style={{ color: "#64748b", fontSize: 14, maxWidth: 480, margin: "0 auto 6px", lineHeight: 1.6 }}>
                I'm your AI business assistant. Ask me anything about your sales, inventory, or performance.
              </p>
              <p style={{ color: "#64748b", fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                {/* hint about offline mode */}
                💡 No API key? I'll still answer using your business data in offline mode.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="sug-btn" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`msg msg-${msg.role}${msg.isError ? " msg-error" : ""}`}>
                <div className="msg-bubble">
                  {msg.role === "assistant" ? (
                    <>
                      {/* Show typing dots while waiting for first token */}
                      {msg.content === "" && streamingId === msg.id ? (
                        <div className="typing-dots">
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                          <div className="typing-dot" />
                        </div>
                      ) : (
                        <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      )}
                      {/* Blinking cursor while still streaming */}
                      {streamingId === msg.id && msg.content !== "" && (
                        <span className="cursor" />
                      )}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
                <div className="msg-meta">
                  {msg.role === "user" ? "You" : "AI Copilot"}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="input-area">
          <div className="input-wrap">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask anything about your business…  (Enter to send, Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button className="send-btn" onClick={() => sendMessage(input)} disabled={streaming || !input.trim()}>
              {streaming ? "…" : "Send ↑"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: "#64748b", fontFamily: "var(--font-mono)", marginTop: 6, textAlign: "center" }}>
            AI responses are based on your real business data · Always verify important decisions
          </p>
        </div>
      </div>
    </>
  );
}
