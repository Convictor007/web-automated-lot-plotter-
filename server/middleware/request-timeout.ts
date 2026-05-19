import type { RequestHandler } from 'express'
import { getRequestTimeoutMs } from '../config/security.js'

/** Abort long-running OCR requests to limit resource exhaustion. */
export const requestTimeoutMiddleware: RequestHandler = (req, res, next) => {
  const ms = getRequestTimeoutMs()
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ success: false, message: 'Request timed out. Try a smaller or clearer image.' })
    }
  }, ms)

  res.on('finish', () => clearTimeout(timer))
  res.on('close', () => clearTimeout(timer))
  next()
}
