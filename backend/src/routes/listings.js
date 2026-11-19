import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { removeImage } from '../lib/images.js'
import { requireAuth } from '../middleware/auth.js'
import { getImageExtension, imageUpload } from '../middleware/upload.js'

const router = Router()
const uploadsDirectory = path.resolve('uploads')
const listingSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(100),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(2000),
  status: z.enum(['LOST', 'FOUND']),
  category: z.string().trim().min(1, 'Choose an item category.').max(60),
  approximateDate: z.string().date(),
  location: z.string().trim().min(2, 'Add a campus location.').max(100),
})
const reportSchema = z.object({
  reason: z.enum(['INAPPROPRIATE', 'MISLEADING', 'SPAM', 'OTHER']),
  details: z.string().trim().max(1000).optional().default(''),
})

const publicListingFields = {
  id: true,
  title: true,
  description: true,
  status: true,
  category: true,
  approximateDate: true,
  location: true,
  imagePath: true,
  isResolved: true,
  expiresAt: true,
  archivedAt: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
}

function cleanInput(value) {
  if (typeof value !== 'string') return value
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
}

function validateListing(body) {
  return listingSchema.safeParse({
    title: cleanInput(body.title),
    description: cleanInput(body.description),
    status: body.status,
    category: cleanInput(body.category),
    approximateDate: body.approximateDate,
    location: cleanInput(body.location),
  })
}

async function saveImage(file) {
  if (!file) return undefined
  const extension = getImageExtension(file.buffer)
  if (!extension) {
    const error = new Error('That file is not a supported image. Choose a JPEG, PNG, or WebP image.')
    error.status = 400
    throw error
  }
  await mkdir(uploadsDirectory, { recursive: true })
  const filename = `${randomUUID()}.${extension}`
  await writeFile(path.join(uploadsDirectory, filename), file.buffer)
  return `/uploads/${filename}`
}

function handleImageUpload(req, res, next) {
  imageUpload.single('image')(req, res, (error) => {
    if (error instanceof Error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Image must be 5 MB or smaller.'
        : error.code === 'LIMIT_FILE_COUNT'
          ? 'Choose only one image.'
          : error.message
      return res.status(400).json({ error: message })
    }
    return next()
  })
}

router.get('/', async (req, res, next) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 100) : ''
  const status = req.query.status
  const category = req.query.category
  const location = typeof req.query.location === 'string' ? req.query.location.trim().slice(0, 100) : ''
  const now = new Date()
  const andConditions = [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]
  if (query) {
    andConditions.push({
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    })
  }
  const where = {
    isResolved: false,
    archivedAt: null,
    AND: andConditions,
    ...(status === 'LOST' || status === 'FOUND' ? { status } : {}),
    ...(typeof category === 'string' && category.length <= 60 ? { category } : {}),
    ...(location ? { location: { contains: location, mode: 'insensitive' } } : {}),
  }
  try {
    const listings = await prisma.listing.findMany({
      where,
      select: publicListingFields,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return res.json({ listings })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: publicListingFields,
    })
    if (!listing || listing.archivedAt || (listing.expiresAt && listing.expiresAt <= new Date())) {
      return res.status(404).json({ error: 'This listing could not be found.' })
    }
    return res.json({ listing })
  } catch (error) {
    return next(error)
  }
})

router.post('/', requireAuth, handleImageUpload, async (req, res, next) => {
  const parsed = validateListing(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the listing details and try again.' })
  }
  let imagePath
  try {
    const category = await prisma.listingCategory.findFirst({
      where: { key: parsed.data.category, isActive: true },
      select: { key: true },
    })
    if (!category) return res.status(400).json({ error: 'Choose an active item category.' })
    const location = await prisma.campusLocation.findFirst({
      where: { name: parsed.data.location, isActive: true },
      select: { id: true },
    })
    if (!location) return res.status(400).json({ error: 'Choose an active campus location.' })
    const settings = await prisma.portalSettings.findUnique({
      where: { key: 'portal' },
      select: { listingLifetimeDays: true },
    })
    imagePath = await saveImage(req.file)
    const expiresAt = new Date(Date.now() + (settings?.listingLifetimeDays ?? 90) * 86400000)
    const listing = await prisma.listing.create({
      data: {
        ...parsed.data,
        approximateDate: new Date(`${parsed.data.approximateDate}T12:00:00.000Z`),
        expiresAt,
        imagePath: imagePath ?? null,
        ownerId: req.userId,
      },
      select: publicListingFields,
    })
    return res.status(201).json({ listing })
  } catch (error) {
    if (imagePath) await removeImage(imagePath)
    return next(error)
  }
})

router.patch('/:id', requireAuth, handleImageUpload, async (req, res, next) => {
  const parsed = validateListing(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the listing details and try again.' })
  }
  let newImagePath
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This listing could not be found.' })
    if (existing.ownerId !== req.userId) return res.status(403).json({ error: 'You can only edit your own listings.' })
    const category = await prisma.listingCategory.findFirst({
      where: {
        key: parsed.data.category,
        ...(parsed.data.category === existing.category ? {} : { isActive: true }),
      },
      select: { key: true },
    })
    if (!category) return res.status(400).json({ error: 'Choose an active item category.' })
    const location = await prisma.campusLocation.findFirst({
      where: {
        name: parsed.data.location,
        ...(parsed.data.location === existing.location ? {} : { isActive: true }),
      },
      select: { id: true },
    })
    if (!location) return res.status(400).json({ error: 'Choose an active campus location.' })
    newImagePath = await saveImage(req.file)
    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        approximateDate: new Date(`${parsed.data.approximateDate}T12:00:00.000Z`),
        ...(newImagePath ? { imagePath: newImagePath } : {}),
      },
      select: publicListingFields,
    })
    if (newImagePath && existing.imagePath) await removeImage(existing.imagePath)
    return res.json({ listing })
  } catch (error) {
    if (newImagePath) await removeImage(newImagePath)
    return next(error)
  }
})

router.patch('/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This listing could not be found.' })
    if (existing.ownerId !== req.userId) return res.status(403).json({ error: 'Only the owner can update this listing.' })
    if (existing.archivedAt) return res.status(403).json({ error: 'This listing has been archived by an administrator.' })
    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: { isResolved: !existing.isResolved },
      select: publicListingFields,
    })

    return res.json({ listing })
  } catch (error) {
    return next(error)
  }
})

router.post('/:id/reports', requireAuth, async (req, res, next) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the report and try again.' })
  }
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true, ownerId: true, isResolved: true, archivedAt: true, expiresAt: true },
    })
    if (!listing || listing.archivedAt || listing.isResolved || (listing.expiresAt && listing.expiresAt <= new Date())) {
      return res.status(404).json({ error: 'This listing is not available for reporting.' })
    }
    if (listing.ownerId === req.userId) {
      return res.status(400).json({ error: 'You cannot report your own listing.' })
    }
    const existing = await prisma.listingReport.findFirst({
      where: { listingId: listing.id, reporterId: req.userId },
      select: { id: true },
    })
    if (existing) return res.status(409).json({ error: 'You have already reported this listing.' })
    await prisma.listingReport.create({
      data: {
        listingId: listing.id,
        reporterId: req.userId,
        reason: parsed.data.reason,
        details: parsed.data.details || null,
      },
    })
    return res.status(201).json({ message: 'Your report has been sent to the campus administrators.' })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This listing could not be found.' })
    if (existing.ownerId !== req.userId) return res.status(403).json({ error: 'You can only remove your own listings.' })
    await prisma.listing.delete({ where: { id: existing.id } })
    await removeImage(existing.imagePath)
    return res.status(204).end()
  } catch (error) {
    return next(error)
  }
})

export default router
