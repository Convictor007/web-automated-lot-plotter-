import { getGeminiApiKey, getGeminiModel } from '../config/env.js'
import {
  detectImageMimeType,
  geminiVisionSurveyJson,
} from '../lib/gemini-survey.js'
import { normalizeOllamaLotsPayload } from '../../src/lib/ocr/ocr-survey-parse.js'

function parseModelJson(rawLlm: string): { parsed: unknown; error: string | null } {
  try {
    const start = rawLlm.trim().indexOf('{')
    const end = rawLlm.trim().lastIndexOf('}')
    const json =
      start >= 0 && end > start ? rawLlm.trim().slice(start, end + 1) : rawLlm.trim()
    return { parsed: JSON.parse(json), error: null }
  } catch {
    return { parsed: null, error: 'Model did not return valid JSON. Try another photo.' }
  }
}

/**
 * iAssess flow: Gemini vision on the uploaded image (no Tesseract on this route).
 * Tesseract remains on POST /api/ocr for client fallback only.
 */
export async function interpretSurveyImage(imageBuffer: Buffer): Promise<Record<string, unknown>> {
  if (!getGeminiApiKey()) {
    return {
      success: false,
      message: 'GEMINI_API_KEY is not set in .env. AI scan requires Google Gemini.',
      hint: 'Add GEMINI_API_KEY from Google AI Studio (https://aistudio.google.com/apikey)',
      status: 503,
    }
  }

  const imageBase64 = imageBuffer.toString('base64')
  const mimeType = detectImageMimeType(imageBuffer)

  let rawLlm = ''
  let modelLabel = ''

  try {
    const result = await geminiVisionSurveyJson(imageBase64, mimeType)
    rawLlm = result.rawJson
    modelLabel = result.modelUsed
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gemini request failed'
    return {
      success: false,
      message: msg,
      hint: 'Check GEMINI_API_KEY and GEMINI_MODEL in Vercel env (https://aistudio.google.com/apikey)',
      status: 502,
    }
  }

  const { parsed, error: parseErr } = parseModelJson(rawLlm)
  if (parseErr || parsed === null) {
    return {
      success: false,
      message: parseErr || 'Invalid JSON',
      rawLlm: rawLlm.slice(0, 4000),
      status: 422,
    }
  }

  const { tiePointReference, lots: parsedLots } = normalizeOllamaLotsPayload(parsed)
  const lots = parsedLots.filter((l) => l.corners.length > 0)

  if (lots.length === 0) {
    return {
      success: false,
      message:
        'No valid survey lines after validation (0–90°, 0–59′, distance > 0). Try a clearer image or CSV upload.',
      rawLlm: rawLlm.slice(0, 4000),
      source: 'gemini',
    }
  }

  return {
    success: true,
    data: lots[0].corners,
    lots: lots.map((l) => ({
      lotNo: l.lotNo,
      claimant: l.claimant,
      corners: l.corners.map((c) => ({
        ns: c.ns,
        deg: c.deg,
        min: c.min,
        ew: c.ew,
        distance: c.distance,
        sheetLineLabel: c.sheetLineLabel,
      })),
    })),
    tiePointReference,
    source: 'gemini',
    model: modelLabel || getGeminiModel(),
    warnings: [
      lots.length > 1
        ? `Multiple lots extracted (${lots.length}). Each lot's line 1 is monument → corner 1 for that parcel. Switch lots in review before OK.`
        : 'Line 1 should be from the document tie monument to corner 1; verify tiePointReference and all distances.',
      'Review all values against the document before plotting. Vision models can still make mistakes.',
    ],
  }
}
