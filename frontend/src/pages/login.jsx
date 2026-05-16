import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../api/client'
import toast from 'react-hot-toast'
export default function Login() {
  const nav = useNavigate()
  const [form, setForm] = useState({ phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  async function submit(e) {
    e.preventDefault(); setLoading(true)
    try {
      const { data } = await authAPI.login(form)
      localStorage.setItem('lp_token', data.access_token)
      localStorage.setItem('lp_user', data.user_name)
      localStorage.setItem('lp_shop', data.shop_name || '')
      toast.success(`Welcome back, ${data.user_name}!`); nav('/')
    } catch (err) { toast.error(err.response?.data?.detail || 'Login failed') }
    finally { setLoading(false) }
  }
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ width:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ color:'#fff', fontWeight:700, fontSize:18 }}>L</span>
            </div>
            <span style={{ fontFamily:'var(--font-head)', fontWeight:700, fontSize:22 }}>Local<span style={{ color:'var(--green)' }}>Plus</span></span>
          </div>
          <p style={{ color:'var(--muted)', fontSize:14 }}>Sign in to your shop dashboard</p>
        </div>
        <div className="card">
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Mobile Number</label>
              <input className="form-input" type="tel" placeholder="9876543210" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button className="btn btn-primary" style={{ width:'100%', padding:11 }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p style={{ textAlign:'center', marginTop:16, fontSize:13, color:'var(--muted)' }}>
            New shop? <Link to="/register" style={{ color:'var(--green)', fontWeight:500 }}>Register free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
