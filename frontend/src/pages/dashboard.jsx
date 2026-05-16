import { useState, useEffect } from 'react'
import { salesAPI, udhaarAPI, productsAPI } from '../api/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, Package, BookOpen, ShoppingCart } from 'lucide-react'
export default function Dashboard() {
  const [summary, setSummary] = useState([])
  const [udhaar, setUdhaar] = useState({ total_outstanding:0, count:0 })
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([salesAPI.summary(), udhaarAPI.summary(), productsAPI.list(), salesAPI.list()])
      .then(([s,u,p,sl]) => { setSummary(s.data); setUdhaar(u.data); setProducts(p.data); setSales(sl.data.slice(0,8)) })
      .finally(() => setLoading(false))
  }, [])
  const todayRev = summary[summary.length-1]?.revenue ?? 0
  const lowStock = products.filter(p => p.stock < 5).length
  const shopName = localStorage.getItem('lp_shop') || 'Your Shop'
  const stats = [
    { label:"Today's Revenue", value:`₹${todayRev.toLocaleString('en-IN')}`, sub:'vs yesterday', icon:TrendingUp, color:'var(--green)' },
    { label:'Total Products', value:products.length, sub:`${lowStock} low stock`, icon:Package, color:'#6C63FF' },
    { label:'Udhaar Pending', value:`₹${udhaar.total_outstanding.toLocaleString('en-IN')}`, sub:`${udhaar.count} customers`, icon:BookOpen, color:'var(--amber)' },
    { label:'Sales Today', value:sales.filter(s=>s.sold_at?.startsWith(new Date().toISOString().slice(0,10))).length, sub:'transactions', icon:ShoppingCart, color:'var(--red)' },
  ]
  if (loading) return <p style={{ color:'var(--muted)', padding:40 }}>Loading dashboard…</p>
  return (
    <div>
      <h1 className="page-title">👋 Welcome, {shopName}</h1>
      <div className="stat-grid">
        {stats.map(s => (
          <div className="stat-card" key={s.label}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <p className="stat-label">{s.label}</p>
                <p className="stat-value" style={{ color:s.color }}>{s.value}</p>
                <p className="stat-sub">{s.sub}</p>
              </div>
              <div style={{ width:36, height:36, borderRadius:8, background:s.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <s.icon size={18} color={s.color} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>7-Day Revenue</h2>
        {summary.length === 0 ? <p style={{ color:'var(--muted)', fontSize:13 }}>No sales yet. Record your first sale!</p> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary} margin={{ top:0, right:0, left:-20, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize:12, fill:'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={d => new Date(d).toLocaleDateString('en-IN',{weekday:'short'})} />
              <YAxis tick={{ fontSize:12, fill:'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v}`} />
              <Tooltip formatter={v=>[`₹${v}`,'Revenue']} contentStyle={{ border:'1px solid var(--border)', borderRadius:8, fontSize:13 }} />
              <Bar dataKey="revenue" fill="var(--green)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {lowStock > 0 && <div className="alert-banner alert-warn" style={{ marginBottom:16 }}>⚠️ {lowStock} product(s) running low on stock.</div>}
      <div className="card">
        <h2 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>Recent Sales</h2>
        {sales.length === 0 ? <p style={{ color:'var(--muted)', fontSize:13 }}>No sales recorded yet.</p> : (
          <table className="lp-table">
            <thead><tr><th>Product ID</th><th>Qty</th><th>Total</th><th>Time</th></tr></thead>
            <tbody>{sales.map(s => <tr key={s.id}><td>#{s.product_id}</td><td>{s.quantity}</td><td style={{ fontWeight:600 }}>₹{s.total}</td><td style={{ color:'var(--muted)', fontSize:13 }}>{new Date(s.sold_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
