import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isVercel } from '../config/security.js'
import Tesseract from 'tesseract.js'
import { parseSurveyCornersFromOcr } from '../../src/lib/ocr/ocr-survey-parse.js'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverDir, '../..')

function getTesseractWorkerPath(): string {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'))
  const pkgJson = projectRequire.resolve('tesseract.js/package.json')
  const root = path.dirname(pkgJson)
  return path.join(root, 'src', 'worker-script', 'node', 'index.js')
}

const TESSERACT_WORKER_PATH = getTesseractWorkerPath()

export type TesseractExtractResult = {
  rawText: string
  pageData: Tesseract.Page
}

/** Run Tesseract and return full page text + layout for rule-based fallback. */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<TesseractExtractResult> {
  const tempDir = isVercel()
    ? path.join(os.tmpdir(), 'lot-plotter-ocr')
    : path.join(projectRoot, 'server', 'temp', 'images')
  fs.mkdirSync(tempDir, { recursive: true })
  const tempFilePath = path.join(tempDir, `ocr_scan_${Date.now()}.jpg`)
  fs.writeFileSync(tempFilePath, imageBuffer)

  try {
    if (!fs.existsSync(TESSERACT_WORKER_PATH)) {
      throw new Error(`Tesseract worker not found. Run npm install.`)
    }
    const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      workerPath: TESSERACT_WORKER_PATH,
    })
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        user_defined_dpi: '300',
      })
      let result = await worker.recognize(tempFilePath)
      let pageData = result.data

      let parsed = parseSurveyCornersFromOcr(pageData)
      if (parsed.corners.length === 0) {
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
          user_defined_dpi: '300',
        })
        result = await worker.recognize(tempFilePath)
        pageData = result.data
      }

      return { rawText: pageData.text || '', pageData }
    } finally {
      await worker.terminate()
    }
  } finally {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)
  }
}

/** Rule-based parse only (legacy /api/ocr endpoint). */
export async function runTesseractOcr(imageBuffer: Buffer): Promise<{
  success: boolean
  data?: ReturnType<typeof parseSurveyCornersFromOcr>['corners']
  warnings?: string[]
  message?: string
  rawText?: string
}> {
  const { rawText, pageData } = await extractTextFromImage(imageBuffer)

  if (!rawText.trim()) {
    return { success: false, message: 'OCR produced no text.', rawText }
  }

  const { corners, warnings } = parseSurveyCornersFromOcr(pageData)
  if (corners.length === 0) {
    return {
      success: false,
      message:
        'No valid survey lines found from OCR layout. Try a clearer image, CSV upload, or ensure GEMINI_API_KEY is set for AI parsing.',
      rawText,
      warnings,
    }
  }

  return { success: true, data: corners, warnings, rawText }
}
