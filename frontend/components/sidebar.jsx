import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, TrendingUp, BookOpen, ShoppingCart, LogOut } from 'lucide-react'

const links = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/inventory', icon: Package,         label: 'Inventory'  },
  { to: '/sales',     icon: ShoppingCart,    label: 'Record Sale'},
  { to: '/forecast',  icon: TrendingUp,      label: 'AI Forecast'},
  { to: '/udhaar',    icon: BookOpen,        label: 'Udhaar'     },
]

export default function Sidebar() {
  const navigate   = useNavigate()
  const shopName   = localStorage.getItem('lp_shop') || 'My Shop'
  const userName   = localStorage.getItem('lp_user') || ''

  function logout() {
    localStorage.clear()
    navigate('/login')
  }

  return (
    <aside style={{
      width: 240, height: '100vh', position: 'fixed', top: 0, left: 0,
      background: '#fff', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', padding: '24px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>L</span>
          </div>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 17 }}>
            Local<span style={{ color: 'var(--green)' }}>Plus</span>
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 38 }}>{shopName}</p>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 'var(--radius-sm)',
              textDecoration: 'none', fontSize: 14, fontWeight: 500,
              color: isActive ? 'var(--green-dark)' : 'var(--muted)',
              background: isActive ? 'var(--green-light)' : 'transparent',
              transition: 'all .15s',
            })}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{userName}</span>
        <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }} title="Logout">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}