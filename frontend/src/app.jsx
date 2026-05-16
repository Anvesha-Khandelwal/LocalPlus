import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar    from './components/Sidebar'
import Dashboard  from './pages/Dashboard'
import Inventory  from './pages/Inventory'
import SaleEntry  from './pages/SaleEntry'
import Forecast   from './pages/Forecast'
import Udhaar     from './pages/Udhaar'
import Login      from './pages/Login'
import Register   from './pages/Register'

function Protected({ children }) {
  const token = localStorage.getItem('lp_token')
  return token ? children : <Navigate to="/login" replace />
}

function AppLayout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'var(--font-body)', fontSize: 13 } }} />
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Protected><AppLayout><Dashboard /></AppLayout></Protected>} />
        <Route path="/inventory" element={<Protected><AppLayout><Inventory /></AppLayout></Protected>} />
        <Route path="/sales"     element={<Protected><AppLayout><SaleEntry /></AppLayout></Protected>} />
        <Route path="/forecast"  element={<Protected><AppLayout><Forecast /></AppLayout></Protected>} />
        <Route path="/udhaar"    element={<Protected><AppLayout><Udhaar /></AppLayout></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}