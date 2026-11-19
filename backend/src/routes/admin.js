import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { removeImage } from '../lib/images.js'
import { recordAdminActivity } from '../lib/admin-activity.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import adminCatalogRouter from './admin-catalog.js'
import adminOperationsRouter from './admin-operations.js'
import adminReportsRouter from './admin-reports.js'

const router = Router()

router.param('id', (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return res.status(400).json({ error: 'Choose a valid record.' })
  }
  return next()
})

const adminListingFields = {
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

const pendingRegistrationFields = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
}

router.use(requireAuth, requireAdmin)

router.get('/registrations/pending', async (_req, res, next) => {
  try {
    const registrations = await prisma.user.findMany({
      where: { role: 'STUDENT', approvalStatus: 'PENDING' },
      select: pendingRegistrationFields,
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return res.json({ registrations })
  } catch (error) {
    return next(error)
  }
})

async function decideRegistration(req, res, next, approvalStatus) {
  try {
    const decidedAt = new Date()
    const result = await prisma.user.updateMany({
      where: {
        id: req.params.id,
        role: 'STUDENT',
        approvalStatus: 'PENDING',
      },
      data: {
        approvalStatus,
        approvalDecidedAt: decidedAt,
        approvalDecidedBy: req.userId,
      },
    })
    if (!result.count) {
      return res.status(404).json({ error: 'This pending registration could not be found.' })
    }
    await recordAdminActivity(
      req,
      approvalStatus === 'APPROVED' ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED',
      'USER',
      req.params.id,
      `${approvalStatus === 'APPROVED' ? 'Approved' : 'Rejected'} a student registration.`,
    )
    return res.json({ approvalStatus, approvalDecidedAt: decidedAt })
  } catch (error) {
    return next(error)
  }
}

router.patch('/registrations/:id/approve', (req, res, next) => {
  return decideRegistration(req, res, next, 'APPROVED')
})

router.patch('/registrations/:id/reject', (req, res, next) => {
  return decideRegistration(req, res, next, 'REJECTED')
})

router.get('/listings', async (_req, res, next) => {
  try {
    const listings = await prisma.listing.findMany({
      select: adminListingFields,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return res.json({ listings })
  } catch (error) {
    return next(error)
  }
})

router.patch('/listings/:id/resolve', async (req, res, next) => {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This listing could not be found.' })
    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: { isResolved: true },
      select: adminListingFields,
    })
    await recordAdminActivity(req, 'LISTING_RESOLVED', 'LISTING', listing.id, `Marked listing "${listing.title}" as resolved.`)
    return res.json({ listing })
  } catch (error) {
    return next(error)
  }
})

router.delete('/listings/:id', async (req, res, next) => {
  try {
    const existing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      select: { id: true, imagePath: true, title: true },
    })
    if (!existing) return res.status(404).json({ error: 'This listing could not be found.' })
    await prisma.listing.delete({ where: { id: existing.id } })
    await removeImage(existing.imagePath)
    await recordAdminActivity(req, 'LISTING_REMOVED', 'LISTING', existing.id, `Removed listing "${existing.title}".`)
    return res.status(204).end()
  } catch (error) {
    return next(error)
  }
})

router.use('/catalog', adminCatalogRouter)
router.use('/reports', adminReportsRouter)
router.use('/', adminOperationsRouter)

export default router
