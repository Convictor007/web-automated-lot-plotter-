import rateLimit from 'express-rate-limit'
import {
  getGlobalRateLimitMax,
  getOcrRateLimitMax,
  getRateLimitWindowMs,
} from '../config/security.js'

const windowMs = getRateLimitWindowMs()

export const globalApiRateLimiter = rateLimit({
  windowMs,
  max: getGlobalRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
})

export const ocrRateLimiter = rateLimit({
  windowMs,
  max: getOcrRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many scan requests. Please wait and try again.' },
})
