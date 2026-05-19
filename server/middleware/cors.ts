import cors from 'cors'
import type { CorsOptions } from 'cors'
import { getCorsOrigins, isProduction } from '../config/security.js'

function buildCorsOptions(): CorsOptions {
  const allowed = getCorsOrigins()

  if (isProduction() && allowed.length === 0) {
    console.warn(
      '[security] CORS_ORIGINS is empty in production. Set CORS_ORIGINS to your app URL(s), e.g. https://your-domain.com'
    )
  }

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }
      if (allowed.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type'],
    maxAge: 600,
  }
}

export const corsMiddleware = cors(buildCorsOptions())
