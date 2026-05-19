export interface ParsedCorner {
  ns: string
  deg: string
  min: string
  sec?: string
  ew: string
  distance: string
  sheetLineLabel?: string
}

export type ScanReviewMeta = {
  extractionPath: 'ai' | 'tesseract'
  source?: 'gemini' | 'tesseract'
  model?: string
  warnings?: string[]
  tiePointReference?: string | null
}

export type ScannedLot = {
  lotNo?: string | null
  claimant?: string | null
  corners: ParsedCorner[]
}
