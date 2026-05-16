import { useState, useEffect } from 'react'
import { productsAPI } from '../api/client'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
const EMPTY = { name:'', category:'', price:'', stock:'', unit:'units', expiry:'' }
const CATS = ['Grocery','Dairy','Beverages','Snacks','Personal Care','Stationery','Vegetables','Other']
export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const load = () => productsAPI.list().then(r => setProducts(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  function openAdd() { setEditing(null); setForm(EMPTY); setModal(true) }
  function openEdit(p) { setEditing(p); setForm({ name:p.name, category:p.category||'', price:p.price, stock:p.stock, unit:p.unit, expiry:p.expiry?.slice(0,10)||'' }); setModal(true) }
  async function save(e) {
    e.preventDefault(); setSaving(true)
    const payload = { ...form, price:parseFloat(form.price), stock:parseFloat(form.stock), expiry:form.expiry||null }
    try {
      editing ? await productsAPI.update(editing.id, payload) : await productsAPI.create(payload)
      toast.success(editing ? 'Updated' : 'Added'); setModal(false); load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Error') }
    finally { setSaving(false) }
  }
  async function remove(id) {
    if (!confirm('Delete?')) return
    try { await productsAPI.remove(id); toast.success('Deleted'); setProducts(p => p.filter(x => x.id !== id)) }
    catch { toast.error('Could not delete') }
  }
  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  const stockBadge = s => s <= 0 ? <span className="badge badge-red">Out</span> : s < 5 ? <span className="badge badge-amber">Low</span> : <span className="badge badge-green">OK</span>
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 className="page-title" style={{ margin:0 }}>Inventory</h1>
        <button className="btn btn-primary" onClick={openAdd} style={{ display:'flex', alignItems:'center', gap:6 }}><Plus size={15} />Add Product</button>
      </div>
      <input className="form-input" style={{ maxWidth:320, marginBottom:20 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      {loading ? <p style={{ color:'var(--muted)' }}>Loading…</p> : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="lp-table">
            <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={6} style={{ color:'var(--muted)', textAlign:'center', padding:32 }}>No products. Add your first one.</td></tr>
              : filtered.map(p => <tr key={p.id}><td style={{ fontWeight:500 }}>{p.name}</td><td style={{ color:'var(--muted)', fontSize:13 }}>{p.category||'—'}</td><td>₹{p.price}</td><td>{p.stock} {p.unit}</td><td>{stockBadge(p.stock)}</td><td><div style={{ display:'flex', gap:6 }}><button className="btn btn-sm" onClick={() => openEdit(p)}><Pencil size={13} /></button><button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}><Trash2 size={13} /></button></div></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:440, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 style={{ fontSize:16 }}>{editing ? 'Edit' : 'Add'} Product</h2>
              <button onClick={() => setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}><X size={18} /></button>
            </div>
            <form onSubmit={save}>
              <div className="form-group"><label>Name *</label><input className="form-input" value={form.name} onChange={set('name')} required /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group"><label>Category</label><select className="form-input" value={form.category} onChange={set('category')}><option value="">Select…</option>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div className="form-group"><label>Unit</label><select className="form-input" value={form.unit} onChange={set('unit')}>{['units','kg','g','L','ml','dozen','pack'].map(u=><option key={u} value={u}>{u}</option>)}</select></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group"><label>Price (₹) *</label><input className="form-input" type="number" step="0.01" value={form.price} onChange={set('price')} required /></div>
                <div className="form-group"><label>Stock *</label><input className="form-input" type="number" step="0.1" value={form.stock} onChange={set('stock')} required /></div>
              </div>
              <div className="form-group"><label>Expiry Date</label><input className="form-input" type="date" value={form.expiry} onChange={set('expiry')} /></div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
