// Empty means same-origin requests, which Netlify forwards through netlify.toml.
// Local development sets NEXT_PUBLIC_API_URL in .env.local to the FastAPI URL.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

export function apiUrl(path: string) {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), { ...init, credentials: 'include' });
}
