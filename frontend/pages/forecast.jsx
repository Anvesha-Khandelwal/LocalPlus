import { useState, useEffect } from 'react'
import { productsAPI, forecastAPI } from '../api/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { Brain, AlertTriangle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Forecast() {
  const [products,   setProducts]   = useState([])
  const [selected,   setSelected]   = useState('')
  const [forecast,   setForecast]   = useState(null)
  const [loading,    setLoading]    = useState(false)

  useEffect(() => { productsAPI.list().then(r => { setProducts(r.data); if (r.data.length > 0) setSelected(r.data[0].id) }) }, [])

  async function runForecast() {
    if (!selected) return toast.error('Pick a product first')
    setLoading(true)
    setForecast(null)
    try {
      const { data } = await forecastAPI.get({ product_id: parseInt(selected), days: 7 })
      setForecast(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Forecast failed')
    } finally {
      setLoading(false)
    }
  }

  function barColor(predicted) {
    const avg = forecast?.forecasts?.reduce((s, d) => s + d.predicted, 0) / (forecast?.forecasts?.length || 1)
    if (predicted >= avg * 1.35) return '#BA7517'
    if (predicted <= avg * 0.75) return '#D85A30'
    return '#1D9E75'
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{label} — {d.predicted} {forecast.unit}</p>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Confidence: {d.confidence}%</p>
        {d.signals?.length > 0 && (
          <div>{d.signals.map(s => <span key={s} style={{ display: 'inline-block', background: '#FAEEDA', color: '#633806', borderRadius: 99, padding: '1px 7px', fontSize: 11, marginRight: 4 }}>{s}</span>)}</div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Brain size={22} color="var(--green)" />
        <h1 className="page-title" style={{ margin: 0 }}>AI Demand Oracle</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Predicts what you'll sell over the next 7 days — using your sales history, upcoming local festivals, IPL matches, and weather — so you never over-stock or run out.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, maxWidth: 280 }}>
            <label>Select Product</label>
            <select className="form-input" value={selected} onChange={e => setSelected(e.target.value)}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={runForecast} disabled={loading || !selected}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px' }}>
            <Brain size={15} />
            {loading ? 'Forecasting…' : 'Run Forecast'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Oracle is thinking…</p>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Crunching sales history, weather & local events</p>
        </div>
      )}

      {forecast && (
        <>
          {/* Alert banner */}
          {forecast.alert
            ? <div className="alert-banner alert-warn" style={{ marginBottom: 20 }}>
                <AlertTriangle size={16} /> {forecast.alert}
                {forecast.reorder_by && <span style={{ marginLeft: 6, fontWeight: 600 }}>Order by: {new Date(forecast.reorder_by).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>}
              </div>
            : <div className="alert-banner alert-ok" style={{ marginBottom: 20 }}>
                <CheckCircle size={16} /> Demand looks normal this week. Stock your usual amount.
              </div>
          }

          {/* Chart */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>7-Day Forecast — {forecast.product_name}</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Hover bars for signals. 🟡 High demand &nbsp; 🔴 Low demand &nbsp; 🟢 Normal</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={forecast.forecasts} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: 'var(--muted)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted)' }}
                  tickFormatter={v => `${v} ${forecast.unit}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="predicted" radius={[6, 6, 0, 0]}>
                  {forecast.forecasts.map((d, i) => <Cell key={i} fill={barColor(d.predicted)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Day-by-day table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="lp-table">
              <thead>
                <tr><th>Day</th><th>Date</th><th>Predicted</th><th>Confidence</th><th>Active Signals</th></tr>
              </thead>
              <tbody>
                {forecast.forecasts.map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{d.day}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>{new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td style={{ fontWeight: 600, color: barColor(d.predicted) }}>{d.predicted} {forecast.unit}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, maxWidth: 80 }}>
                          <div style={{ width: `${d.confidence}%`, height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.confidence}%</span>
                      </div>
                    </td>
                    <td>
                      {d.signals?.length > 0
                        ? d.signals.map(s => <span key={s} className="badge badge-amber" style={{ marginRight: 4, fontSize: 11 }}>{s}</span>)
                        : <span style={{ color: 'var(--muted)', fontSize: 13 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!forecast && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 56, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔮</div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Select a product and run the forecast</p>
          <p style={{ fontSize: 13 }}>The Oracle needs at least a few days of sales history to be accurate.</p>
        </div>
      )}
    </div>
  )
}