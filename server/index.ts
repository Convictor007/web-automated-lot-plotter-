/**
 * Local / self-hosted API + static app (not used on Vercel — see api/index.ts).
 * Run: npm run dev:api  (or npm run dev for Vite + API together)
 */
import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiApp } from './create-app.js'
import { getApiPort } from './config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distPath = path.join(projectRoot, 'dist')

const app = createApiApp()

if (process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
  app.use(express.static(distPath, { index: false, maxAge: '1d' }))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const port = getApiPort()
app.listen(port, () => {
  console.log(`[lot-plotter-api] http://localhost:${port} (health: /api/health)`)
})
