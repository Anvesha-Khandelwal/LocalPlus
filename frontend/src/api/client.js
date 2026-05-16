import axios from 'axios'
const api = axios.create({ baseURL: '/api' })
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('lp_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { localStorage.clear(); window.location.href = '/login' }
  return Promise.reject(err)
})
export default api
export const authAPI = { register: d => api.post('/auth/register', d), login: d => api.post('/auth/login', d) }
export const productsAPI = { list: () => api.get('/products/'), create: d => api.post('/products/', d), update: (id, d) => api.put(`/products/${id}`, d), remove: id => api.delete(`/products/${id}`) }
export const salesAPI = { record: d => api.post('/sales/', d), list: () => api.get('/sales/'), summary: () => api.get('/sales/summary'), history: id => api.get(`/sales/history/${id}`) }
export const udhaarAPI = { list: () => api.get('/udhaar/'), add: d => api.post('/udhaar/', d), markPaid: id => api.patch(`/udhaar/${id}/paid`), summary: () => api.get('/udhaar/summary') }
export const forecastAPI = { get: d => api.post('/forecast/', d) }
