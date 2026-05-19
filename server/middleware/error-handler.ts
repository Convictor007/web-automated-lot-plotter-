import type { ErrorRequestHandler, RequestHandler } from 'express'
import { getMaxUploadBytes } from '../config/security.js'

/** Reject malformed multipart / oversize uploads from multer before generic handler. */
export const multerErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: string }).code)
    if (code === 'LIMIT_FILE_SIZE') {
      const maxMb = Math.round(getMaxUploadBytes() / (1024 * 1024))
      res.status(413).json({ success: false, message: `Image is too large (max ${maxMb} MB).` })
      return
    }
    if (code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ success: false, message: 'Unexpected upload field. Use field name "image".' })
      return
    }
  }
  next(err)
}

export const corsErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    res.status(403).json({ success: false, message: 'Origin not allowed.' })
    return
  }
  next(err)
}

export const genericErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return

  console.error(`[api] ${req.method} ${req.path}:`, err)

  const status =
    err && typeof err === 'object' && 'status' in err && typeof (err as { status: number }).status === 'number'
      ? (err as { status: number }).status
      : 500

  res.status(status >= 400 && status < 600 ? status : 500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
  })
}

/** Minimal health response — no internal paths or versions. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' })
}
