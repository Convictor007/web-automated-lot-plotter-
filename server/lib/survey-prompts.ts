/** Prompts for Gemini text parsing of Tesseract OCR output from land titles / lot descriptions. */

export const SURVEY_SYSTEM_PROMPT = `You are a cadastral survey assistant. You read noisy OCR text from land titles, technical descriptions, and traverse tables. You output strict JSON only.`

export const SURVEY_USER_PROMPT_PREFIX = `The following is raw OCR text extracted by Tesseract from a scanned land document (title page, memorandum, lot description table, or traverse sheet). OCR may have typos, broken lines, or merged cells — use context to reconstruct the survey data.

Your task:

1) **Tie point (monument)**  
   Find the official reference (BLLM, PRC, geodetic station, cadastral monument, etc.).  
   Put a short phrase in **tiePointReference** or **null** if none is readable.

2) **Single lot** — use when the document describes **one** parcel only  
   Return **corners** in traverse order: quadrant bearings N/S, degrees (0–90), minutes (0–59), E/W, distance in **meters**.  
   - First corner = monument → corner 1 (MON. TO CORNER 1, etc.)  
   - Then each boundary line in order.

3) **Multiple lots** — use when the OCR shows a **table of many lots** (LOT NO., CLAIMANT, MON. TO CORNER 1, LINE 1-2, …)  
   Return **lots** array; never merge different lots into one **corners** list.  
   Per lot: **lotNo**, **claimant** (or null), **corners** with **sheetLineLabel** when readable ("MON->C1", "1-2", "2-3", …).

**Return shape (choose one):**  
- One lot: {"tiePointReference":"…","corners":[…]}  
- Several lots: {"tiePointReference":"…","lots":[{"lotNo":"…","claimant":"…","corners":[…]}]}

Rules:
- "ns" exactly "N" or "S". "ew" exactly "E" or "W".
- "deg" and "min" integers. "distance" positive number (meters).
- Fix obvious OCR errors (O→0, l→1) only when confident.
- Do not invent lines you cannot support from the OCR text.
- Skip header rows. Omit unreadable lines rather than guessing wildly.

--- OCR TEXT START ---
`

export const SURVEY_USER_PROMPT_SUFFIX = `
--- OCR TEXT END ---

Respond with JSON only.`

export function buildSurveyPromptFromOcrText(ocrText: string): string {
  const trimmed = ocrText.trim().slice(0, 120_000)
  return `${SURVEY_USER_PROMPT_PREFIX}${trimmed}${SURVEY_USER_PROMPT_SUFFIX}`
}

export function extractJsonObjectFromLlmText(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) return fence[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}
