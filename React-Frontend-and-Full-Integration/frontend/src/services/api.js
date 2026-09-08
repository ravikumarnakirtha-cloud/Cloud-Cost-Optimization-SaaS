// src/services/api.js
// Centralised Axios client with JWT injection and error handling

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: `${BASE_URL}/api` })

// ── Auth token injection ───────────────────────────────────────────────────
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('cco_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Global error handling ──────────────────────────────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cco_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  login:    (email, password)   => api.post('/auth/login',    { email, password }),
  register: (data)              => api.post('/auth/register', data),
  me:       ()                  => api.get('/auth/me'),
}

// ── Cloud Accounts ─────────────────────────────────────────────────────────
export const accountsApi = {
  list:      ()         => api.get('/cloud-accounts'),
  get:       (id)       => api.get(`/cloud-accounts/${id}`),
  connect:   (data)     => api.post('/connect-cloud', data),
  delete:    (id)       => api.delete(`/cloud-accounts/${id}`),
  triggerScan: (accountId) => api.post('/scan-resources', { accountId }),
  listJobs:  ()         => api.get('/scan-jobs'),
  getJob:    (id)       => api.get(`/scan-jobs/${id}`),
}

// ── Resources ──────────────────────────────────────────────────────────────
export const resourcesApi = {
  list:       (params)  => api.get('/resources',         { params }),
  get:        (id)      => api.get(`/resources/${id}`),
  summary:    (params)  => api.get('/resources/summary', { params }),
  costReport: (params)  => api.get('/get-cost-report',   { params }),
  costHistory:(params)  => api.get('/cost-history',      { params }),
}

// ── Recommendations ────────────────────────────────────────────────────────
export const recsApi = {
  list:           (params) => api.get('/get-recommendations', { params }),
  savingsSummary: ()       => api.get('/recommendations/savings-summary'),
  apply:          (id)     => api.patch(`/recommendations/${id}/apply`),
  dismiss:        (id)     => api.patch(`/recommendations/${id}/dismiss`),
}

// ── Alerts ─────────────────────────────────────────────────────────────────
export const alertsApi = {
  list:    ()   => api.get('/alerts'),
  markRead:(id) => api.patch(`/alerts/${id}/read`),
}

export default api
