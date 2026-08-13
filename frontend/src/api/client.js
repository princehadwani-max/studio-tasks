const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

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
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
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
  deleteTask: (token, id) => request(`/tasks/${id}`, { method: 'DELETE', token }),
  createUser: (token, payload) => request('/users', { method: 'POST', body: payload, token }),
  setUserActive: (token, id, active) =>
    request(`/users/${id}/active`, { method: 'PATCH', body: { active }, token }),
  resetPassword: (token, id, password) =>
    request(`/users/${id}/password`, { method: 'PATCH', body: { password }, token }),
};
