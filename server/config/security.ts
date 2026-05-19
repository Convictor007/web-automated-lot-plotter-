/** Security-related environment (server-only). */

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',

])

/** Vercel serverless request body limit is ~4.5 MB. */
const VERCEL_MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export function isVercel(): boolean {
  return process.env.VERCEL === '1'
}

export function getMaxUploadBytes(): number {
  if (isVercel()) return VERCEL_MAX_UPLOAD_BYTES
  const n = Number(process.env.MAX_UPLOAD_BYTES)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_UPLOAD_BYTES
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function getVercelDeploymentOrigins(): string[] {
  const origins: string[] = []
  const add = (host?: string) => {
    if (!host) return
    const trimmed = host.replace(/^https?:\/\//, '')
    origins.push(`https://${trimmed}`)
  }
  add(process.env.VERCEL_URL)
  add(process.env.VERCEL_BRANCH_URL)
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  return origins
}

/** Comma-separated list, e.g. CORS_ORIGINS=https://plots.example.com,http://localhost:5173 */
export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim()
  const fromEnv = raw
    ? raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : []

  const vercelOrigins = getVercelDeploymentOrigins()

  if (fromEnv.length > 0 || vercelOrigins.length > 0) {
    return [...new Set([...fromEnv, ...vercelOrigins])]
  }

  if (isProduction()) {
    return []
  }
  return [...DEFAULT_DEV_ORIGINS]
}

export function getTrustProxy(): boolean | number {
  if (isVercel()) return true
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase()
  if (raw === 'true' || raw === '1') return true
  if (raw && /^\d+$/.test(raw)) return Number(raw)
  return false
}

export function getRateLimitWindowMs(): number {
  const n = Number(process.env.RATE_LIMIT_WINDOW_MS)
  return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000
}

/** Max requests per IP per window for all /api routes. */
export function getGlobalRateLimitMax(): number {
  const n = Number(process.env.RATE_LIMIT_MAX)
  return Number.isFinite(n) && n > 0 ? n : 120
}

/** Stricter limit for expensive OCR + Gemini routes. */
export function getOcrRateLimitMax(): number {
  const n = Number(process.env.OCR_RATE_LIMIT_MAX)
  return Number.isFinite(n) && n > 0 ? n : 20
}

export function getRequestTimeoutMs(): number {
  const n = Number(process.env.REQUEST_TIMEOUT_MS)
  const configured = Number.isFinite(n) && n > 0 ? n : 120_000
  if (isVercel()) return Math.min(configured, 55_000)
  return configured
}
