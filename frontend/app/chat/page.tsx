/**
 * frontend/app/chat/page.tsx
 * AI Business Chat — ask the AI anything about your business.
 *
 * Features:
 *   - Streaming responses (tokens appear as they generate, like ChatGPT)
 *   - Conversation history sent with every message (last 6 turns for context)
 *   - Pre-filled suggested prompts shown on empty state
 *   - Markdown rendering (bold, lists, code blocks)
 *   - Copy message button on hover
 *   - Auto-scroll to latest message
 *   - Clear conversation button
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ai } from "@/lib/api";
import { useUser } from "@/lib/store";

interface Message { role: "user" | "assistant"; content: string; id: string }

const SUGGESTIONS = [
  "What products should I reorder this week?",
  "Why have my sales dropped recently?",
  "Which of my products has the best profit margin?",
  "What offers should I run this month?",
  "Which products are not selling?",
  "How can I increase my daily revenue?",
];

/** Very basic markdown → HTML: bold, code, bullet lists */
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, `<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:12px">$1</code>`)
    .replace(/^- (.+)$/gm, `<div style="display:flex;gap:6px;margin:3px 0"><span style="color:var(--amber);flex-shrink:0">•</span><span>$1</span></div>`)
    .replace(/\n/g, "<br/>");
}

export default function ChatPage() {
  const user = useUser();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { role: "user", content: text.trim(), id: Date.now().toString() };
    const assistantMsg: Message = { role: "assistant", content: "", id: (Date.now() + 1).toString() };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      for await (const chunk of ai.chat(text.trim(), history.slice(-6))) {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m)
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === assistantMsg.id ? { ...m, content: "Sorry, I couldn't connect to the AI service. Please try again." } : m)
      );
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <>
      <style>{`
        .chat-page { display:flex; flex-direction:column; height:100vh; }
        .chat-header { padding:20px 28px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
        .messages { flex:1; overflow-y:auto; padding:24px 28px; display:flex; flex-direction:column; gap:16px; }
        .msg { max-width:720px; animation:fadeIn .2s ease; }
        .msg-user { align-self:flex-end; }
        .msg-assistant { align-self:flex-start; }
        .msg-bubble { padding:12px 16px; border-radius:12px; font-size:14px; line-height:1.6; }
        .msg-user .msg-bubble { background:rgba(245,158,11,.15); border:1px solid rgba(245,158,11,.3); border-bottom-right-radius:3px; color:var(--text); }
        .msg-assistant .msg-bubble { background:var(--surface); border:1px solid var(--border); border-bottom-left-radius:3px; }
        .msg-meta { font-size:10px; color:var(--muted); font-family:var(--font-mono); margin-top:4px; }
        .msg-user .msg-meta { text-align:right; }
        .cursor { display:inline-block; width:2px; height:14px; background:var(--amber); margin-left:2px; animation:blink .8s infinite; vertical-align:middle; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .suggestions { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
        .sug-btn { padding:8px 14px; border-radius:20px; border:1px solid var(--border); background:transparent; color:var(--text-2); font-size:12px; cursor:pointer; transition:all .15s; font-family:var(--font-sans); }
        .sug-btn:hover { border-color:var(--amber); color:var(--amber); }
        .input-area { padding:16px 28px 24px; border-top:1px solid var(--border); flex-shrink:0; }
        .input-wrap { display:flex; gap:10px; align-items:flex-end; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:10px 14px; transition:border-color .15s; }
        .input-wrap:focus-within { border-color:var(--amber); }
        .chat-input { flex:1; background:transparent; border:none; color:var(--text); font-size:14px; font-family:var(--font-sans); resize:none; outline:none; max-height:120px; line-height:1.5; }
        .send-btn { padding:8px 16px; border-radius:8px; border:none; background:var(--amber); color:#000; font-weight:700; cursor:pointer; font-size:13px; flex-shrink:0; transition:all .15s; }
        .send-btn:disabled { opacity:.5; cursor:not-allowed; }
        .send-btn:not(:disabled):hover { background:var(--amber-2); }
      `}</style>

      <div className="chat-page">
        {/* Header */}
        <div className="chat-header">
          <div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>🤖 AI Business Copilot</h1>
            <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              Ask anything about your business · powered by AI
            </p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              style={{ padding: "6px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
            >
              Clear chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="messages">
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🤖</div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 8 }}>
                Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
              </h2>
              <p style={{ color: "var(--muted)", fontSize: 14, maxWidth: 480, margin: "0 auto 4px" }}>
                I'm your AI business assistant. I can analyze your sales, inventory, and performance data to help you make better decisions.
              </p>
              <p style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 24 }}>
                Try one of these:
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="sug-btn" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`msg msg-${msg.role}`}>
                <div className="msg-bubble">
                  {msg.role === "assistant" ? (
                    <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) || (streaming ? "" : "…") }} />
                  ) : (
                    msg.content
                  )}
                  {msg.role === "assistant" && streaming && messages[messages.length - 1].id === msg.id && (
                    <span className="cursor" />
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

        {/* Input */}
        <div className="input-area">
          <div className="input-wrap">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask anything about your business…  (Enter to send)"
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
          <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 6, textAlign: "center" }}>
            AI responses are based on your real business data · Always verify important decisions
          </p>
        </div>
      </div>
    </>
  );
}
