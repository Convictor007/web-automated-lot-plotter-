/** Client-side environment (Vite `import.meta.env`). */

/** Google Maps — required for GIS map tiles and PDF static map (restrict by HTTP referrer). */
export function getGoogleMapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
}

/** Optional override when API is not same-origin (default: Vite proxy `/api` → internal server). */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
}
