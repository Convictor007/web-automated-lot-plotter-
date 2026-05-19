import { postOcrInterpret, postOcrTesseract } from '@/api/ocr.api'
import type { ScanReviewMeta, ScannedLot } from './ocr-types'

export type { ParsedCorner, ScanReviewMeta, ScannedLot } from './ocr-types'

const TESSERACT_REVIEW_WARNINGS = [
  'Classic OCR was used. Compare every bearing and distance to your document.',
]

/** Tesseract on Vercel serverless is too slow; rely on vision interpret only. */
function isVercelHostedClient(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host.endsWith('.vercel.app') || host.includes('vercel.app')
}

/**
 * iAssess flow: POST /api/ocr-interpret (Gemini vision) first, then POST /api/ocr (Tesseract) if needed.
 */
export async function scanLandTitleImage(
  file: File | Blob,
  signal?: AbortSignal
): Promise<{ lots: ScannedLot[]; meta: ScanReviewMeta }> {
  const fromAi = await postOcrInterpret(file, signal)
  if (fromAi.ok) {
    return { lots: fromAi.lots, meta: fromAi.meta }
  }

  const aiScanMessage = fromAi.ok === false ? fromAi.message : undefined

  if (isVercelHostedClient()) {
    throw new Error(
      aiScanMessage ||
        'AI scan did not complete. Check GEMINI_API_KEY on Vercel and try a clearer photo.'
    )
  }

  const corners = await postOcrTesseract(file, signal)
  const warnings = [...TESSERACT_REVIEW_WARNINGS]
  if (aiScanMessage) {
    warnings.unshift(`AI scan did not complete: ${aiScanMessage}`)
  }
  return {
    lots: [{ corners }],
    meta: {
      extractionPath: 'tesseract',
      warnings,
    },
  }
}
