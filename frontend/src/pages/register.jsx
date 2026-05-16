import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../api/client'
import toast from 'react-hot-toast'
export default function Register() {
  const nav = useNavigate()
  const [form, setForm] = useState({ name:'', phone:'', password:'', shop_name:'', city:'' })
  const [loading, setLoading] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  async function submit(e) {
    e.preventDefault(); setLoading(true)
    try {
      const { data } = await authAPI.register(form)
      localStorage.setItem('lp_token', data.access_token)
      localStorage.setItem('lp_user', data.user_name)
      localStorage.setItem('lp_shop', data.shop_name || '')
      toast.success('Shop registered!'); nav('/')
    } catch (err) { toast.error(err.response?.data?.detail || 'Registration failed') }
    finally { setLoading(false) }
  }
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:20 }}>
      <div style={{ width:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <span style={{ fontFamily:'var(--font-head)', fontWeight:700, fontSize:22 }}>Local<span style={{ color:'var(--green)' }}>Plus</span></span>
          <p style={{ color:'var(--muted)', fontSize:14, marginTop:4 }}>Create your free shop account</p>
        </div>
        <div className="card">
          <form onSubmit={submit}>
            {[{k:'name',label:'Your Name',ph:'Ravi Kumar',type:'text'},{k:'phone',label:'Mobile Number',ph:'9876543210',type:'tel'},{k:'shop_name',label:'Shop Name',ph:'Ravi Kirana',type:'text'},{k:'city',label:'City',ph:'Bengaluru',type:'text'},{k:'password',label:'Password',ph:'••••••••',type:'password'}].map(({ k, label, ph, type }) => (
              <div className="form-group" key={k}>
                <label>{label}</label>
                <input className="form-input" type={type} placeholder={ph} value={form[k]} onChange={set(k)} required={['name','phone','password'].includes(k)} />
              </div>
            ))}
            <button className="btn btn-primary" style={{ width:'100%', padding:11 }} disabled={loading}>{loading ? 'Creating…' : 'Create free account'}</button>
          </form>
          <p style={{ textAlign:'center', marginTop:14, fontSize:13, color:'var(--muted)' }}>
            Already registered? <Link to="/login" style={{ color:'var(--green)', fontWeight:500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
