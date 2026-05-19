import { Router } from 'express'
import multer from 'multer'
import { getMaxUploadBytes } from '../config/security.js'
import {
  ocrRateLimiter,
  requestTimeoutMiddleware,
  validateImageUpload,
} from '../middleware/index.js'
import { interpretSurveyImage } from '../services/interpret.service.js'
import { runTesseractOcr } from '../services/tesseract-ocr.service.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxUploadBytes(), files: 1 },
})

export const ocrRouter = Router()

ocrRouter.get('/health', (_req, res) => {
  res.json({ ok: true })
})

ocrRouter.post(
  '/ocr',
  ocrRateLimiter,
  requestTimeoutMiddleware,
  upload.single('image'),
  validateImageUpload,
  async (req, res, next) => {
    try {
      const result = await runTesseractOcr(req.file!.buffer)
      res.json(result)
    } catch (error: unknown) {
      next(error)
    }
  }
)

ocrRouter.post(
  '/ocr-interpret',
  ocrRateLimiter,
  requestTimeoutMiddleware,
  upload.single('image'),
  validateImageUpload,
  async (req, res, next) => {
    try {
      const result = await interpretSurveyImage(req.file!.buffer)
      const status = typeof result.status === 'number' ? result.status : 200
      const body = { ...result }
      delete body.status
      res.status(status).json(body)
    } catch (error: unknown) {
      next(error)
    }
  }
)
