import express from 'express'
import {
  corsErrorHandler,
  corsMiddleware,
  genericErrorHandler,
  globalApiRateLimiter,
  multerErrorHandler,
  notFoundHandler,
  securityHeadersMiddleware,
} from './middleware/index.js'
import { ocrRouter } from './routes/ocr.routes.js'
import { validateStartupConfig } from './config/startup.js'
import { getTrustProxy, isVercel } from './config/security.js'

let startupValidated = false

function ensureStartupValidated(): void {
  if (startupValidated) return
  validateStartupConfig()
  startupValidated = true
}

/** Express app for `/api` routes (local server, Vercel serverless, etc.). */
export function createApiApp(): express.Express {
  ensureStartupValidated()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', isVercel() ? true : getTrustProxy())

  app.use(securityHeadersMiddleware)
  app.use(corsMiddleware)

  const apiNotFound: express.RequestHandler = (_req, res) => {
    res.status(404).json({ success: false, message: 'Not found' })
  }

  // Local dev + explicit /api/* paths
  app.use('/api', globalApiRateLimiter, ocrRouter, apiNotFound)

  // Vercel rewrites often deliver /ocr-interpret (no /api prefix) to api/index.ts
  if (isVercel()) {
    app.use(globalApiRateLimiter, ocrRouter, apiNotFound)
  }

  app.use(notFoundHandler)
  app.use(corsErrorHandler)
  app.use(multerErrorHandler)
  app.use(genericErrorHandler)

  return app
}
