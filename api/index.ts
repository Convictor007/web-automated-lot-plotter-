/**
 * Vercel serverless entry — all `/api/*` requests are rewritten here.
 * @see vercel.json
 */
import { createApiApp } from '../server/create-app.js'

const app = createApiApp()

export default app

/** Vercel function limits (Pro: up to 60s; Hobby: 10s max — OCR may fail on Hobby). */
export const config = {
  maxDuration: 60,
  memory: 1024,
}
