/** Vision prompts (same flow as iAssess `/api/ocr-interpret`). */
export const SURVEY_VISION_SYSTEM_PROMPT = `You read land survey / technical description tables from photos (Excel screenshots, typed documents, or camera photos).`

export const SURVEY_VISION_USER_PROMPT = `Look at the **entire** image (title page, memorandum, technical description, or traverse table).

1) **Tie point (monument)**  
   Find the official reference parcels are tied from: e.g. BLLM, PRC, geodetic station, cadastral monument (often **one** reference for a whole "LOT DESCRIPTIONS" / cadastral sheet).  
   Put a short literal phrase in **tiePointReference** (or **null** if none is readable).

2) **Single lot — corners array** (use when the image describes **one** parcel only)  
   Build **corners** in traverse order as quadrant bearings: N/S, degrees (0–90), minutes (0–59), E/W, distance in **meters** (positive number).  
   - **First object in corners** = **monument → corner 1** (same as "MON. TO CORNER 1", "Beginning at… from [monument]…").  
   - Each following object = the next boundary side (1→2, 2→3, …).

3) **Multiple lots — lots array** (when the image is a **table of many lots**, e.g. columns LOT NO., CLAIMANT, **MON. TO CORNER 1**, LINE 1-2, LINE 2-3, …)  
   Return **lots** as an array; **do not** merge different lots into one corners list.  
   For **each** lot row in the table:
   - **lotNo**: the lot number from the LOT NO. column (string).
   - **claimant**: short text from CLAIMANT if visible, else null.
   - **corners**: array for **that lot only**, in order:
     - **First** object = bearing & distance from **MON. TO CORNER 1** (monument to first corner of **this** lot).
     - Include **sheetLineLabel** on each object: use "MON->C1" for monument-to-corner line, then the sheet column label like "1-2", "2-3", ...
     - Then each **LINE 1-2, 2-3, …** segment in order.
   Skip lots you cannot read; omit empty lots.

**Return shape (choose one):**  
- **One lot:** {"tiePointReference":"…","corners":[…]}  
- **Several lots:** {"tiePointReference":"…","lots":[{"lotNo":"487","claimant":"…","corners":[…]}]}

Rules:
- Never mix two lots into one **corners** array. Each lot always starts with its own monument→C1 line.
- "tiePointReference" is a string or **null** (JSON null), max one short phrase from the document.
- "ns" must be exactly "N" or "S". "ew" must be exactly "E" or "W".
- "deg" and "min" are integers. "distance" is a number (decimals allowed).
- "sheetLineLabel" is optional but preferred when readable: "MON->C1", "1-2", "2-3", ...
- Skip header rows. Omit lines you cannot read confidently; do not guess wildly.`

/** Prompts for Gemini text parsing of Tesseract OCR output (fallback `/api/ocr` path only). */

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
