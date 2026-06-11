"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { auth as authApi } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function RegisterPage() {
  const router  = useRouter();
  const setUser = useStore((s) => s.setUser);
  const [form, setForm] = useState({ business_name:"", owner_name:"", email:"", password:"", phone:"" });
  const [loading, setLoading] = useState(false);
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({...form,[k]:e.target.value});

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business_name||!form.owner_name||!form.email||!form.password){ toast.error("Fill all required fields"); return; }
    setLoading(true);
    try {
      const { user, tokens } = await authApi.register(form);
      setUser(user as Parameters<typeof setUser>[0], tokens.access_token, tokens.refresh_token);
      toast.success("Account created! Welcome 🎉");
      router.push("/dashboard");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Registration failed"); }
    finally { setLoading(false); }
  };

  return (
    <>
      <style>{`
        .auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px}
        .auth-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:36px 32px;width:460px;max-width:100%}
        .field{margin-bottom:14px}
        .field label{display:block;font-size:11px;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
        .field input{width:100%;background:#111f36;border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text);font-size:13px;outline:none}
        .field input:focus{border-color:#f59e0b}
        .submit-btn{width:100%;padding:12px;border-radius:10px;border:none;background:#f59e0b;color:#000;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px}
        .submit-btn:disabled{opacity:.6;cursor:not-allowed}
        .auth-link{text-align:center;margin-top:20px;font-size:13px;color:var(--muted)}
        .auth-link a{color:#f59e0b;text-decoration:none}
      `}</style>
      <div className="auth-page">
        <div className="auth-card">
          <div style={{fontSize:36,marginBottom:12}}>🏪</div>
          <h1 style={{fontFamily:"var(--font-serif)",fontSize:28,marginBottom:6}}>Set up your store</h1>
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:24}}>Free forever · No credit card needed</p>
          <form onSubmit={handleRegister}>
            {[
              {label:"Business Name *",key:"business_name",type:"text",ph:"Sharma Kirana Store"},
              {label:"Your Name *",key:"owner_name",type:"text",ph:"Rakesh Sharma"},
              {label:"Email *",key:"email",type:"email",ph:"you@business.com"},
              {label:"Password *",key:"password",type:"password",ph:"Min 8 chars + number"},
              {label:"Phone (optional)",key:"phone",type:"tel",ph:"+91 98765 43210"},
            ].map(({label,key,type,ph})=>(
              <div key={key} className="field">
                <label>{label}</label>
                <input type={type} value={(form as Record<string,string>)[key]} onChange={f(key)} placeholder={ph} />
              </div>
            ))}
            <button type="submit" className="submit-btn" disabled={loading}>{loading?"Creating…":"Create Free Account →"}</button>
          </form>
          <div className="auth-link">Already have an account? <a href="/login">Sign in</a></div>
        </div>
      </div>
    </>
  );
}
