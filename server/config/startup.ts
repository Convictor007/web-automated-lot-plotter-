import { getCorsOrigins, isProduction, isVercel } from './security.js'
import { getGeminiApiKey } from './env.js'

/** Validate security-related config when the API boots. */
export function validateStartupConfig(): void {
  if (isProduction()) {
    const origins = getCorsOrigins()
    if (origins.length === 0 && !isVercel()) {
      throw new Error(
        'CORS_ORIGINS must be set in production (comma-separated app URLs), e.g. CORS_ORIGINS=https://plots.example.com'
      )
    }
    if (!getGeminiApiKey()) {
      console.warn('[startup] GEMINI_API_KEY is not set — AI scan (/api/ocr-interpret) will return 503.')
    }
  }
}
