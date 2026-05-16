import { useState, useEffect } from 'react'
import { productsAPI, salesAPI } from '../src/api/client'
import { Plus, Minus, Trash2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function SaleEntry() {
  const [products, setProducts] = useState([])
  const [cart,     setCart]     = useState([])    // [{product, qty}]
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [done,     setDone]     = useState(false)

  useEffect(() => { productsAPI.list().then(r => setProducts(r.data)) }, [])

  const inCart   = id => cart.find(c => c.product.id === id)
  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) && p.stock > 0
  )

  function addToCart(product) {
    setCart(c => {
      const existing = c.find(x => x.product.id === product.id)
      if (existing) return c.map(x => x.product.id === product.id ? { ...x, qty: x.qty + 1 } : x)
      return [...c, { product, qty: 1 }]
    })
  }

  function updateQty(id, delta) {
    setCart(c => c
      .map(x => x.product.id === id ? { ...x, qty: Math.max(0, x.qty + delta) } : x)
      .filter(x => x.qty > 0)
    )
  }

  function removeFromCart(id) { setCart(c => c.filter(x => x.product.id !== id)) }

  const total = cart.reduce((sum, { product, qty }) => sum + product.price * qty, 0)

  async function confirmSale() {
    if (cart.length === 0) return toast.error('Cart is empty')
    setSaving(true)
    try {
      await Promise.all(cart.map(({ product, qty }) =>
        salesAPI.record({ product_id: product.id, quantity: qty })
      ))
      setDone(true)
      setTimeout(() => { setCart([]); setDone(false) }, 2200)
      toast.success(`Sale of ₹${total.toFixed(2)} recorded!`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error recording sale')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">Record Sale</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* Product picker */}
        <div>
          <input className="form-input" style={{ marginBottom: 16 }}
            placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {filtered.map(p => {
              const c = inCart(p.id)
              return (
                <div key={p.id} className="card"
                  style={{ padding: '14px 16px', cursor: 'pointer', border: c ? '1.5px solid var(--green)' : '1px solid var(--border)' }}
                  onClick={() => addToCart(p)}>
                  <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{p.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>₹{p.price}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Stock: {p.stock} {p.unit}</p>
                  {c && <span className="badge badge-green" style={{ marginTop: 6 }}>× {c.qty} in cart</span>}
                </div>
              )
            })}
            {filtered.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No in-stock products found.</p>}
          </div>
        </div>

        {/* Cart panel */}
        <div className="card" style={{ position: 'sticky', top: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>🛒 Cart</h2>
          {cart.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Tap a product to add it</p>
            : (
              <>
                {cart.map(({ product, qty }) => (
                  <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{product.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--muted)' }}>₹{product.price} × {qty} = <strong>₹{(product.price * qty).toFixed(2)}</strong></p>
                    </div>
                    <button className="btn btn-sm" onClick={() => updateQty(product.id, -1)}><Minus size={11} /></button>
                    <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                    <button className="btn btn-sm" onClick={() => updateQty(product.id, 1)}><Plus size={11} /></button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeFromCart(product.id)}><Trash2 size={11} /></button>
                  </div>
                ))}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontWeight: 600 }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-head)', fontSize: 20, color: 'var(--green)', fontWeight: 700 }}>₹{total.toFixed(2)}</span>
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', padding: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                    onClick={confirmSale} disabled={saving || done}>
                    {done ? <><CheckCircle size={16} /> Sale recorded!</> : saving ? 'Recording…' : 'Confirm Sale'}
                  </button>
                </div>
              </>
            )
          }
        </div>
      </div>
    </div>
  )
}