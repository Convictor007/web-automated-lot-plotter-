import { postOcrInterpret, postOcrTesseract } from '@/api/ocr.api'
import type { ScanReviewMeta, ScannedLot } from './ocr-types'

export type { ParsedCorner, ScanReviewMeta, ScannedLot } from './ocr-types'

const TESSERACT_REVIEW_WARNINGS = [
  'Classic OCR was used. Compare every bearing and distance to your document.',
]

export async function scanLandTitleImage(
  file: File | Blob,
  signal?: AbortSignal
): Promise<{ lots: ScannedLot[]; meta: ScanReviewMeta }> {
  const fromAi = await postOcrInterpret(file, signal)
  if (fromAi.ok) {
    return { lots: fromAi.lots, meta: fromAi.meta }
  }

  const aiScanMessage = fromAi.ok === false ? fromAi.message : undefined
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
