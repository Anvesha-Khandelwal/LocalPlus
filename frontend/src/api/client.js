import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Attach JWT on every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('lp_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('lp_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  register: d => api.post('/auth/register', d),
  login:    d => api.post('/auth/login', d),
}

// ── Products ──────────────────────────────────────────────
export const productsAPI = {
  list:   ()      => api.get('/products/'),
  create: d       => api.post('/products/', d),
  update: (id, d) => api.put(`/products/${id}`, d),
  remove: id      => api.delete(`/products/${id}`),
}

// ── Sales ─────────────────────────────────────────────────
export const salesAPI = {
  record:  d   => api.post('/sales/', d),
  list:    ()  => api.get('/sales/'),
  summary: ()  => api.get('/sales/summary'),
  history: id  => api.get(`/sales/history/${id}`),
}

// ── Udhaar ────────────────────────────────────────────────
export const udhaarAPI = {
  list:     ()  => api.get('/udhaar/'),
  add:      d   => api.post('/udhaar/', d),
  markPaid: id  => api.patch(`/udhaar/${id}/paid`),
  summary:  ()  => api.get('/udhaar/summary'),
}

// ── Forecast ──────────────────────────────────────────────
export const forecastAPI = {
  get: d => api.post('/forecast/', d),
}