import helmet from 'helmet'
import type { RequestHandler } from 'express'

/**
 * HTTP security headers. CSP is disabled here because Google Maps / ArcGIS
 * need many third-party origins; tune CSP at the reverse proxy if required.
 */
export const securityHeadersMiddleware: RequestHandler = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
})
