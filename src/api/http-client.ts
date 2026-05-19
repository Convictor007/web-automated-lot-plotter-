/**
 * API base URL for the standalone lot-plotter server.
 * Dev: leave empty — Vite proxies `/api` to `API_PORT` (see vite.config.ts).
 * Prod: set VITE_API_BASE_URL if API is on another host.
 */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${normalizedPath}` : normalizedPath
}
