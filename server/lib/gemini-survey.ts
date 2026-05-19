import { getGeminiApiKey, getGeminiModel, getGeminiModelFallbacks } from '../config/env.js'
import {
  SURVEY_SYSTEM_PROMPT,
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

async function callGeminiModel(model: string, userPrompt: string): Promise<string> {
  const key = getGeminiApiKey()
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  const body = JSON.stringify({
    contents: [
      {
        parts: [{ text: `${SURVEY_SYSTEM_PROMPT}\n\n${userPrompt}` }],
      },
    ],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: 'application/json',
    },
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const raw = await res.text()
  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 800)}`) as Error & {
      status?: number
    }
    err.status = res.status
    throw err
  }
  return parseGeminiSuccessBody(raw)
}

/**
 * Parse full OCR text into survey JSON using Gemini with model fallbacks and retries.
 */
export async function geminiParseSurveyFromOcrText(ocrText: string): Promise<{
  rawJson: string
  modelUsed: string
}> {
  const key = getGeminiApiKey()
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env')

  if (!ocrText.trim()) {
    throw new Error('OCR produced no text to send to Gemini')
  }

  const userPrompt = buildSurveyPromptFromOcrText(ocrText)
  const preferred = getGeminiModel()
  const modelsToTry = [preferred, ...getGeminiModelFallbacks().filter((m) => m !== preferred)]

  let lastError = ''
  modelLoop: for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const text = await callGeminiModel(model, userPrompt)
        return { rawJson: extractJsonObjectFromLlmText(text), modelUsed: model }
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
