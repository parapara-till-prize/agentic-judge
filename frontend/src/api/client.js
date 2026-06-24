// Thin fetch wrapper around the FastAPI backend.
// Base URL is env-overridable so prod/staging is a one-line change.
export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function apiFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // send/receive the session cookie cross-origin
  })

  if (!res.ok) {
    let detail
    try {
      detail = (await res.json()).detail
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }

  // 204/empty bodies -> null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
