/** Server-only environment (loaded from project root `.env` via dotenv). */

const DEFAULT_GEMINI_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
  'gemini-pro-latest',
]

export function getApiPort(): number {
  const n = Number(process.env.API_PORT)
  return Number.isFinite(n) && n > 0 ? n : 5175
}

export function getGeminiApiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY?.trim()
  return k || undefined
}

export function getGeminiModel(): string {
  const raw = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim()
  return raw.replace(/^models\//, '')
}

/** Comma-separated override: GEMINI_MODEL_FALLBACKS=model-a,model-b */
export function getGeminiModelFallbacks(): string[] {
  const raw = process.env.GEMINI_MODEL_FALLBACKS?.trim()
  if (raw) {
    return raw
      .split(',')
      .map((m) => m.trim().replace(/^models\//, ''))
      .filter(Boolean)
  }
  return [...DEFAULT_GEMINI_FALLBACKS]
}
