import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './lib/prisma.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import catalogRouter from './routes/catalog.js'
import listingsRouter from './routes/listings.js'
import messagesRouter from './routes/messages.js'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.')
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.')
}

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(path.resolve('uploads'), { fallthrough: false }))

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/listings', listingsRouter)
app.use('/api', messagesRouter)

if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.resolve('../frontend/dist')
  app.use(express.static(clientBuild))
  app.use((_req, res) => res.sendFile(path.join(clientBuild, 'index.html')))
}

app.use((error, _req, res, _next) => {
  if (error.code === 'P2002') {
    return res.status(409).json({ error: 'That information is already in use.' })
  }
  if (error.status && error.status < 500) {
    return res.status(error.status).json({ error: error.message })
  }
  console.error(error)
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

const server = app.listen(port, () => {
  console.log(`Campus Lost & Found API listening on port ${port}`)
})

async function shutdown() {
  server.close()
  await prisma.$disconnect()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
