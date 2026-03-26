import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  register: (d) => api.post('/auth/register', d),
  login:    (d) => api.post('/auth/login', d),
  me:       () => api.get('/auth/me'),
}

export const tasksApi = {
  list:   (page = 1, perPage = 20) => api.get(`/tasks?page=${page}&per_page=${perPage}`),
  get:    (id) => api.get(`/tasks/${id}`),
  create: (d)  => api.post('/tasks', d),
  update: (id, d) => api.patch(`/tasks/${id}`, d),
  delete: (id) => api.delete(`/tasks/${id}`),
  run:    (id) => api.post(`/tasks/${id}/run`),
  toggle: (id) => api.patch(`/tasks/${id}/toggle`),
}

export const notificationsApi = {
  list:    (page = 1, perPage = 50) => api.get(`/notifications?page=${page}&per_page=${perPage}`),
  sendSms: (d) => api.post('/sms/send', d),
}

export const analyticsApi = {
  get:        (days = 30) => api.get(`/analytics?days=${days}`),
  exportXlsx: () => api.get('/analytics/export/notifications.xlsx', { responseType: 'blob' }),
}

export const orgsApi = {
  list:       () => api.get('/orgs'),
  create:     (d) => api.post('/orgs', d),
  members:    (orgId) => api.get(`/orgs/${orgId}/members`),
  invite:     (orgId, d) => api.post(`/orgs/${orgId}/members`, d),
  updateRole: (orgId, userId, d) => api.patch(`/orgs/${orgId}/members/${userId}`, d),
  remove:     (orgId, userId) => api.delete(`/orgs/${orgId}/members/${userId}`),
}

export const webhooksApi = {
  list:       () => api.get('/webhooks'),
  create:     (d) => api.post('/webhooks', d),
  update:     (id, d) => api.patch(`/webhooks/${id}`, d),
  delete:     (id) => api.delete(`/webhooks/${id}`),
  deliveries: (id) => api.get(`/webhooks/${id}/deliveries`),
  eventTypes: () => api.get('/webhooks/events/list'),
}

export const datasourcesApi = {
  list:   () => api.get('/datasources'),
  create: (d) => api.post('/datasources', d),
  update: (id, d) => api.patch(`/datasources/${id}`, d),
  delete: (id) => api.delete(`/datasources/${id}`),
  fetch:  (id) => api.post(`/datasources/${id}/fetch`),
}

export const whatsappApi = {
  send:    (d) => api.post('/whatsapp/send', d),
  history: (page = 1, perPage = 50) => api.get(`/whatsapp/history?page=${page}&per_page=${perPage}`),
}

export const emailApi = {
  send:    (d) => api.post('/email/send', d),
  history: (page = 1, perPage = 50) => api.get(`/email/history?page=${page}&per_page=${perPage}`),
}

export const telegramApi = {
  send:    (d) => api.post('/telegram/send', d),
  history: (page = 1, perPage = 50) => api.get(`/telegram/history?page=${page}&per_page=${perPage}`),
  botInfo: () => api.get('/telegram/bot-info'),
}

export const monitorsApi = {
  list:      () => api.get('/monitors'),
  create:    (d) => api.post('/monitors', d),
  update:    (id, d) => api.patch(`/monitors/${id}`, d),
  delete:    (id) => api.delete(`/monitors/${id}`),
  checkNow:  (id) => api.post(`/monitors/${id}/check`),
  logs:      (id, limit = 50) => api.get(`/monitors/${id}/logs?limit=${limit}`),
}

export const settingsApi = {
  updateProfile:  (d) => api.patch('/settings/profile', d),
  changePassword: (d) => api.post('/settings/change-password', d),
}

export default api
