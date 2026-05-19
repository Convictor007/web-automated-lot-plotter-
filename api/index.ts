/**
 * Vercel serverless entry — all `/api/*` requests are rewritten here.
 * @see vercel.json
 */
import { createApiApp } from '../server/create-app.js'

const app = createApiApp()

export default app
