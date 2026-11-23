const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

let currentTenantId = null;

export function setApiTenantId(tenantId) {
  currentTenantId = tenantId ? Number(tenantId) : null;
}

async function request(path, { method = 'GET', body, token, tenantId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const effectiveTenantId = tenantId || currentTenantId;
  if (effectiveTenantId) {
    headers['X-Company-Id'] = String(effectiveTenantId);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

export const api = {
  login: (username, password, companySlug) =>
    request('/auth/login', {
      method: 'POST',
      body: { username, password, companySlug: companySlug || undefined },
    }),
  me: (token) => request('/auth/me', { token }),
  listUsers: (token) => request('/users', { token }),
  listTasks: (token, { date, userId, status } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (userId) params.set('userId', userId);
    if (status) params.set('status', status);
    const qs = params.toString();
    return request(`/tasks${qs ? `?${qs}` : ''}`, { token });
  },
  summary: (token, date) => request(`/tasks/summary${date ? `?date=${date}` : ''}`, { token }),
  activity: (token, date) => request(`/tasks/activity${date ? `?date=${date}` : ''}`, { token }),
  createTask: (token, payload) => request('/tasks', { method: 'POST', body: payload, token }),
  updateStatus: (token, id, payload) =>
    request(`/tasks/${id}/status`, { method: 'PATCH', body: payload, token }),
  addTaskRemark: (token, id, remark) =>
    request(`/tasks/${id}/remarks`, { method: 'POST', body: { remark }, token }),
  deleteTask: (token, id) => request(`/tasks/${id}`, { method: 'DELETE', token }),
  createUser: (token, payload) => request('/users', { method: 'POST', body: payload, token }),
  setUserActive: (token, id, active) =>
    request(`/users/${id}/active`, { method: 'PATCH', body: { active }, token }),
  updateUserPhone: (token, id, phone) =>
    request(`/users/${id}/phone`, { method: 'PATCH', body: { phone }, token }),
  resetPassword: (token, id, password) =>
    request(`/users/${id}/password`, { method: 'PATCH', body: { password }, token }),
  listRoutines: (token, { userId, frequency } = {}) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (frequency) params.set('frequency', frequency);
    const qs = params.toString();
    return request(`/routines${qs ? `?${qs}` : ''}`, { token });
  },
  createRoutine: (token, payload) => request('/routines', { method: 'POST', body: payload, token }),
  toggleRoutine: (token, id) => request(`/routines/${id}/toggle`, { method: 'PATCH', token }),
  deleteRoutine: (token, id) => request(`/routines/${id}`, { method: 'DELETE', token }),
  whatsappStatus: (token) => request('/whatsapp/status', { token }),
  whatsappConnect: (token) => request('/whatsapp/connect', { method: 'POST', token }),
  whatsappDisconnect: (token) => request('/whatsapp/disconnect', { method: 'POST', token }),
  vapidPublicKey: () => request('/push/vapid-public-key'),
  pushSubscribe: (token, subscription) =>
    request('/push/subscribe', { method: 'POST', body: { subscription }, token }),
  pushUnsubscribe: (token, endpoint) =>
    request('/push/unsubscribe', { method: 'POST', body: { endpoint }, token }),
  pushTest: (token) => request('/push/test', { method: 'POST', token }),
  listTenants: (token) => request('/tenants', { token }),
  createTenant: (token, payload) => request('/tenants', { method: 'POST', body: payload, token }),
  updateTenant: (token, id, payload) => request(`/tenants/${id}`, { method: 'PATCH', body: payload, token }),
  createTenantAdmin: (token, id, payload) =>
    request(`/tenants/${id}/admins`, { method: 'POST', body: payload, token }),
};
