import { apiUrl } from './http-client'
import {
  messageFromHttpStatus,
  messageFromScanFetchError,
  scanRequestSignal,
} from './fetch-with-timeout'
import type { ParsedCorner, ScanReviewMeta, ScannedLot } from '@/lib/ocr/ocr-types'

type InterpretScanResult =
  | { ok: true; lots: ScannedLot[]; meta: ScanReviewMeta }
  | { ok: false; message?: string; timedOut?: boolean; httpStatus?: number }

function buildImageFormData(file: File | Blob, filename = 'scanned_title.jpg'): FormData {
  const formData = new FormData()
  formData.append('image', file, filename)
  return formData
}

function normalizeLotsFromApiJson(json: Record<string, unknown>): ScannedLot[] | null {
  const rawLots = json.lots
  if (Array.isArray(rawLots) && rawLots.length > 0) {
    const out: ScannedLot[] = []
    for (const item of rawLots) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const corners = Array.isArray(row.corners) ? (row.corners as ParsedCorner[]) : []
      const filtered = corners
        .filter(
          (c) => c && typeof c.ns === 'string' && typeof c.ew === 'string' && String(c.distance || '').length > 0
        )
        .map((c) => ({
          ...c,
          sheetLineLabel:
            typeof c.sheetLineLabel === 'string' && c.sheetLineLabel.trim()
              ? c.sheetLineLabel.trim()
              : undefined,
        }))
      if (filtered.length === 0) continue
      const lotNo =
        row.lotNo === null || row.lotNo === undefined ? null : String(row.lotNo).trim() || null
      const claimant =
        row.claimant === null || row.claimant === undefined ? null : String(row.claimant).trim() || null
      out.push({ lotNo, claimant, corners: filtered })
    }
    return out.length > 0 ? out : null
  }
  const data = json.data
  if (Array.isArray(data) && data.length > 0) {
    return [{ corners: data as ParsedCorner[] }]
  }
  return null
}

/** POST /api/ocr-interpret — Tesseract full text, then Gemini JSON (server-only key). */
export async function postOcrInterpret(
  file: File | Blob,
  signal?: AbortSignal
): Promise<InterpretScanResult> {
  const requestSignal = scanRequestSignal(signal)
  try {
    const formData = await buildImageFormData(file)
    const res = await fetch(apiUrl('/api/ocr-interpret'), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
      signal: requestSignal,
    })

    let json: Record<string, unknown> | null = null
    try {
      json = await res.json()
    } catch {
      return { ok: false, message: 'Invalid response from AI scan service.' }
    }

    if (res.ok && json?.success) {
      const lots = normalizeLotsFromApiJson(json)
      if (lots && lots.length > 0) {
        const warnings = Array.isArray(json.warnings) ? (json.warnings as string[]) : undefined
        const tiePointReference =
          typeof json.tiePointReference === 'string' && json.tiePointReference.trim()
            ? json.tiePointReference.trim()
            : json.tiePointReference === null
              ? null
              : undefined
        return {
          ok: true,
          lots,
          meta: {
            extractionPath: 'ai',
            source: json.source as ScanReviewMeta['source'],
            model: typeof json.model === 'string' ? json.model : undefined,
            warnings,
            tiePointReference,
          },
        }
      }
    }

    const message =
      typeof json?.message === 'string'
        ? json.message
        : messageFromHttpStatus(res.status) ?? `AI scan failed (${res.status})`
    return {
      ok: false,
      message,
      httpStatus: res.status,
      timedOut: res.status === 504 || res.status === 502,
    }
  } catch (e) {
    console.warn('ocr-interpret unavailable:', e)
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.message.includes('timeout'))
    return { ok: false, message: messageFromScanFetchError(e), timedOut }
  }
}

/** POST /api/ocr — Tesseract + rule-based parse. */
export async function postOcrTesseract(file: File | Blob, signal?: AbortSignal): Promise<ParsedCorner[]> {
  const formData = await buildImageFormData(file)
  const res = await fetch(apiUrl('/api/ocr'), {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
    signal: scanRequestSignal(signal),
  })

  let json: { success?: boolean; message?: string; data?: ParsedCorner[] } | null = null
  try {
    json = await res.json()
  } catch {
    throw new Error('OCR service returned an invalid response')
  }

  if (!res.ok || !json?.success) {
    throw new Error(
      json?.message || messageFromHttpStatus(res.status) || 'OCR failed to find coordinates'
    )
  }

  return json.data as ParsedCorner[]
}
