import { useState, useEffect } from 'react'
import { udhaarAPI } from '../api/client'
import { Plus, CheckCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = { customer: '', phone: '', amount: '' }

export default function Udhaar() {
  const [entries,  setEntries]  = useState([])
  const [summary,  setSummary]  = useState({ total_outstanding: 0, count: 0 })
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)

  const load = () => Promise.all([udhaarAPI.list(), udhaarAPI.summary()])
    .then(([e, s]) => { setEntries(e.data); setSummary(s.data) })
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function addEntry(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await udhaarAPI.add({ ...form, amount: parseFloat(form.amount) })
      toast.success('Udhaar recorded')
      setModal(false)
      setForm(EMPTY)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error adding udhaar')
    } finally {
      setSaving(false)
    }
  }

  async function markPaid(id, name) {
    try {
      await udhaarAPI.markPaid(id)
      toast.success(`${name} marked as paid`)
      load()
    } catch { toast.error('Error updating') }
  }

  const daysAgo = dateStr => {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return `${diff} days ago`
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Udhaar — Credit Ledger</h1>
        <button className="btn btn-primary" onClick={() => setModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Add Entry
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, maxWidth: 480 }}>
        <div className="stat-card">
          <p className="stat-label">Total Outstanding</p>
          <p className="stat-value" style={{ color: 'var(--amber)' }}>₹{summary.total_outstanding.toLocaleString('en-IN')}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Customers with Credit</p>
          <p className="stat-value">{summary.count}</p>
        </div>
      </div>

      {loading
        ? <p style={{ color: 'var(--muted)' }}>Loading…</p>
        : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="lp-table">
              <thead>
                <tr><th>Customer</th><th>Phone</th><th>Amount</th><th>Given</th><th></th></tr>
              </thead>
              <tbody>
                {entries.length === 0
                  ? <tr><td colSpan={5} style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>No pending udhaar. Great!</td></tr>
                  : entries.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{e.customer}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{e.phone || '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--amber)', fontSize: 15 }}>₹{e.amount.toLocaleString('en-IN')}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{daysAgo(e.created_at)}</td>
                      <td>
                        <button className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--green-light)', color: 'var(--green-dark)', border: 'none' }}
                          onClick={() => markPaid(e.id, e.customer)}>
                          <CheckCircle size={13} /> Paid
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )
      }

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 380, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16 }}>Add Udhaar Entry</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <form onSubmit={addEntry}>
              <div className="form-group">
                <label>Customer Name *</label>
                <input className="form-input" placeholder="Ramesh" value={form.customer} onChange={set('customer')} required />
              </div>
              <div className="form-group">
                <label>Phone (optional)</label>
                <input className="form-input" type="tel" placeholder="9876543210" value={form.phone} onChange={set('phone')} />
              </div>
              <div className="form-group">
                <label>Amount (₹) *</label>
                <input className="form-input" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={set('amount')} required />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}