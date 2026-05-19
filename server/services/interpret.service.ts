import { getGeminiApiKey } from '../config/env.js'
import { geminiParseSurveyFromOcrText } from '../lib/gemini-survey.js'
import { normalizeOllamaLotsPayload } from '../../src/lib/ocr/ocr-survey-parse.js'
import { parseSurveyCornersFromOcr } from '../../src/lib/ocr/ocr-survey-parse.js'
import { extractTextFromImage } from './tesseract-ocr.service.js'

function buildSuccessPayload(
  lots: ReturnType<typeof normalizeOllamaLotsPayload>['lots'],
  tiePointReference: string | null,
  model: string,
  extraWarnings: string[] = []
) {
  const filtered = lots.filter((l) => l.corners.length > 0)
  return {
    success: true,
    data: filtered[0].corners,
    lots: filtered.map((l) => ({
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
    source: 'gemini' as const,
    model,
    warnings: [
      'Parsed from Tesseract OCR text, then structured by Gemini. Review against the document.',
      filtered.length > 1
        ? `Multiple lots extracted (${filtered.length}). Review each lot before plotting.`
        : 'Verify tie point, monument→corner 1, and all distances.',
      ...extraWarnings,
    ],
  }
}

/**
 * 1) Tesseract extracts full document text  
 * 2) Gemini (with model fallbacks) structures lots from that text  
 * 3) If Gemini fails, fall back to rule-based Tesseract line parsing
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

  let rawText = ''
  let pageData: Tesseract.Page | null = null

  try {
    const extracted = await extractTextFromImage(imageBuffer)
    rawText = extracted.rawText
    pageData = extracted.pageData
  } catch (e: unknown) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Tesseract OCR failed',
      status: 500,
    }
  }

  if (!rawText.trim()) {
    return {
      success: false,
      message: 'OCR could not read any text from the image. Use better lighting or upload a CSV.',
      status: 422,
    }
  }

  try {
    const { rawJson, modelUsed } = await geminiParseSurveyFromOcrText(rawText)
    let parsed: unknown
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      return {
        success: false,
        message: 'Gemini returned invalid JSON. Try another photo.',
        rawLlm: rawJson.slice(0, 4000),
        status: 422,
      }
    }

    const { tiePointReference, lots } = normalizeOllamaLotsPayload(parsed)
    if (lots.filter((l) => l.corners.length > 0).length === 0) {
      return {
        success: false,
        message:
          'Gemini could not extract valid survey lines from the OCR text. Try a clearer image or CSV.',
        rawLlm: rawJson.slice(0, 4000),
        source: 'gemini',
        model: modelUsed,
      }
    }

    return buildSuccessPayload(lots, tiePointReference, modelUsed)
  } catch (geminiError: unknown) {
    const geminiMsg = geminiError instanceof Error ? geminiError.message : 'Gemini failed'

    if (pageData) {
      const { corners, warnings } = parseSurveyCornersFromOcr(pageData)
      if (corners.length > 0) {
        return {
          success: true,
          data: corners,
          lots: [{ lotNo: null, claimant: null, corners }],
          tiePointReference: null,
          source: 'tesseract',
          model: 'tesseract-layout',
          warnings: [
            `Gemini unavailable: ${geminiMsg}`,
            'Used rule-based OCR line parsing instead. Compare every value to your document.',
            ...(warnings || []),
          ],
        }
      }
    }

    return {
      success: false,
      message: geminiMsg,
      hint: 'All Gemini models were busy or unavailable, and rule-based OCR parsing found no valid lines.',
      status: 502,
    }
  }
}
