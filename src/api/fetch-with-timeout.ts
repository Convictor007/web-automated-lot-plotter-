const DEFAULT_SCAN_TIMEOUT_MS = 90_000

export function scanRequestSignal(userSignal?: AbortSignal, timeoutMs = DEFAULT_SCAN_TIMEOUT_MS): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!userSignal) return timeoutSignal
  return AbortSignal.any([userSignal, timeoutSignal])
}

export function messageFromScanFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return 'Scan timed out. On Vercel Hobby, OCR may exceed the 10s limit — use Pro or try a smaller image.'
    }
    if (error.name === 'AbortError') {
      return 'Scan cancelled.'
    }
    return error.message
  }
  return 'Network error while contacting the scan service.'
}

export function messageFromHttpStatus(status: number): string | undefined {
  if (status === 504 || status === 502) {
    return 'Server timed out while reading the image (OCR can take up to 60s on first run). Try again or use a smaller photo.'
  }
  if (status === 413) {
    return 'Image is too large for the server (max 4 MB on Vercel).'
  }
  if (status === 404) {
    return 'Scan API not found. Redeploy or check Vercel API routes.'
  }
  if (status === 503) {
    return 'AI scan unavailable. Check GEMINI_API_KEY in Vercel environment variables.'
  }
  return undefined
}
