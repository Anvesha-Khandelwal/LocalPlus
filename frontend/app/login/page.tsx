"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { auth as authApi, tokenStore } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const router  = useRouter();
  const setUser = useStore((s) => s.setUser);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Please fill in all fields"); return; }
    setLoading(true);
    try {
      const tokens = await authApi.login(email, password);
      tokenStore.set(tokens.access_token, tokens.refresh_token);
      const user = await authApi.me();
      setUser(user as Parameters<typeof setUser>[0], tokens.access_token, tokens.refresh_token);
      router.push("/dashboard");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <>
      <style>{`
        .auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px}
        .auth-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:36px 32px;width:420px;max-width:100%}
        .auth-title{font-family:var(--font-serif);font-size:28px;margin-bottom:6px}
        .auth-sub{font-size:13px;color:var(--muted);margin-bottom:28px}
        .field{margin-bottom:16px}
        .field label{display:block;font-size:11px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
        .field input{width:100%;background:#111f36;border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-size:13px;outline:none;transition:border-color .15s}
        .field input:focus{border-color:var(--amber)}
        .submit-btn{width:100%;padding:12px;border-radius:10px;border:none;background:#f59e0b;color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px}
        .submit-btn:disabled{opacity:.6;cursor:not-allowed}
        .auth-link{text-align:center;margin-top:20px;font-size:13px;color:var(--muted)}
        .auth-link a{color:#f59e0b;text-decoration:none}
      `}</style>
      <div className="auth-page">
        <div className="auth-card">
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to your AI Business Copilot</p>
          <form onSubmit={handleLogin}>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@business.com" /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" /></div>
            <button type="submit" className="submit-btn" disabled={loading}>{loading ? "Signing in…" : "Sign In →"}</button>
          </form>
          <div className="auth-link">No account? <a href="/register">Create one free</a></div>
        </div>
      </div>
    </>
  );
}
