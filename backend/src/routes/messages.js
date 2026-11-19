import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const messageSchema = z.object({
  content: z.string().trim().min(10, 'Message must be at least 10 characters.').max(1000),
})

router.post('/listings/:listingId/messages', requireAuth, async (req, res, next) => {
  const parsed = messageSchema.safeParse({
    content: typeof req.body.content === 'string'
      ? req.body.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
      : req.body.content,
  })
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your message and try again.' })
  }
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.listingId },
      select: { id: true, ownerId: true, isResolved: true },
    })
    if (!listing) return res.status(404).json({ error: 'This listing could not be found.' })
    if (listing.ownerId === req.userId) return res.status(400).json({ error: 'You cannot contact yourself about your own listing.' })
    if (listing.isResolved) return res.status(400).json({ error: 'This listing has already been resolved.' })
    const message = await prisma.message.create({
      data: { content: parsed.data.content, senderId: req.userId, listingId: listing.id },
      select: { id: true, content: true, listingId: true, createdAt: true },
    })
    return res.status(201).json({ message })
  } catch (error) {
    return next(error)
  }
})

router.get('/messages', requireAuth, async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: req.userId },
          { listing: { ownerId: req.userId } },
        ],
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        senderId: true,
        sender: { select: { name: true } },
        listing: { select: { id: true, title: true, ownerId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return res.json({ messages })
  } catch (error) {
    return next(error)
  }
})

export default router
