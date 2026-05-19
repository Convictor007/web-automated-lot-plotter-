import { getGeminiApiKey, getGeminiModel, getGeminiModelFallbacks } from '../config/env.js'
import {
  SURVEY_SYSTEM_PROMPT,
  SURVEY_VISION_SYSTEM_PROMPT,
  SURVEY_VISION_USER_PROMPT,
  buildSurveyPromptFromOcrText,
  extractJsonObjectFromLlmText,
} from './survey-prompts.js'

const GEMINI_RETRYABLE_STATUS = new Set([503, 429, 500])
const GEMINI_MAX_ATTEMPTS_PER_MODEL = Number(process.env.GEMINI_MAX_RETRIES || '4') || 4

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseGeminiSuccessBody(raw: string): string {
  let data: {
    promptFeedback?: { blockReason?: string }
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Gemini returned non-JSON body')
  }
  if (data.error?.message) throw new Error(`Gemini: ${data.error.message}`)
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}`)
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string') throw new Error('Gemini returned no candidate text')
  return text
}

export function detectImageMimeType(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF') {
    return 'image/webp'
  }
  return 'image/jpeg'
}

async function callGeminiGenerate(model: string, body: object): Promise<string> {
  const key = getGeminiApiKey()
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 800)}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return parseGeminiSuccessBody(raw)
}

async function callGeminiWithRetries(
  modelsToTry: string[],
  buildBody: () => object
): Promise<{ text: string; modelUsed: string }> {
  let lastError = ''
  modelLoop: for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const text = await callGeminiGenerate(model, buildBody())
        return { text, modelUsed: model }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        lastError = msg
        const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 0
        if (status === 404) continue modelLoop
        if (GEMINI_RETRYABLE_STATUS.has(status) && attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL) {
          await sleep(900 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400))
          continue
        }
        if (GEMINI_RETRYABLE_STATUS.has(status)) continue modelLoop
        if (status >= 400 && status < 500 && status !== 429) continue modelLoop
      }
    }
  }
  throw new Error(
    `All Gemini models unavailable (tried: ${modelsToTry.join(', ')}). Last error: ${lastError}`
  )
}

/** iAssess-style: send image to Gemini vision (primary scan path). */
export async function geminiVisionSurveyJson(
  imageBase64: string,
  mimeType: string
): Promise<{ rawJson: string; modelUsed: string }> {
  const preferred = getGeminiModel()
  const modelsToTry = [preferred, ...getGeminiModelFallbacks().filter((m) => m !== preferred)]
  const combinedPrompt = `${SURVEY_VISION_SYSTEM_PROMPT}\n\n${SURVEY_VISION_USER_PROMPT}`

  const { text, modelUsed } = await callGeminiWithRetries(modelsToTry, () => ({
    contents: [
      {
        parts: [
          { text: combinedPrompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }))

  return { rawJson: extractJsonObjectFromLlmText(text), modelUsed }
}

/** Text-only parse when Tesseract OCR text is already available (`/api/ocr` fallback tooling). */
export async function geminiParseSurveyFromOcrText(ocrText: string): Promise<{
  rawJson: string
  modelUsed: string
}> {
  if (!ocrText.trim()) {
    throw new Error('OCR produced no text to send to Gemini')
  }

  const userPrompt = buildSurveyPromptFromOcrText(ocrText)
  const preferred = getGeminiModel()
  const modelsToTry = [preferred, ...getGeminiModelFallbacks().filter((m) => m !== preferred)]

  const { text, modelUsed } = await callGeminiWithRetries(modelsToTry, () => ({
    contents: [
      {
        parts: [{ text: `${SURVEY_SYSTEM_PROMPT}\n\n${userPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: 'application/json',
    },
  }))

  return { rawJson: extractJsonObjectFromLlmText(text), modelUsed }
}
