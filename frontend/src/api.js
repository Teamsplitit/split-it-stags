const API_URL = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('splitit_token');
}

export async function api(path, options = {}) {
  const url = `${API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

export function setToken(token) {
  if (token) localStorage.setItem('splitit_token', token);
  else localStorage.removeItem('splitit_token');
}

export function getStoredUser() {
  try {
    const u = localStorage.getItem('splitit_user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem('splitit_user', JSON.stringify(user));
  else localStorage.removeItem('splitit_user');
}
