import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { removeImage } from '../lib/images.js'
import { recordAdminActivity } from '../lib/admin-activity.js'
import { toCsv } from '../lib/csv.js'

const router = Router()
router.param('id', (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: 'Choose a valid record.' })
  return next()
})
const listingFields = {
  id: true,
  title: true,
  category: true,
  location: true,
  status: true,
  isResolved: true,
  expiresAt: true,
  archivedAt: true,
  createdAt: true,
  owner: { select: { name: true } },
}
const lifetimeSchema = z.object({
  listingLifetimeDays: z.number().int().min(1).max(3650),
})
const expirySchema = z.object({
  expiresAt: z.string().date(),
})
const bulkSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
  action: z.enum(['ARCHIVE', 'REMOVE']),
})

router.post('/listings/bulk', async (req, res, next) => {
  const parsed = bulkSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Choose listings and a moderation action.' })
  }
  try {
    const listings = await prisma.listing.findMany({
      where: { id: { in: parsed.data.ids } },
      select: { id: true, imagePath: true },
    })
    if (!listings.length) return res.status(404).json({ error: 'No selected listings could be found.' })
    const ids = listings.map(({ id }) => id)
    if (parsed.data.action === 'ARCHIVE') {
      await prisma.$transaction(async (tx) => {
        await tx.listing.updateMany({
          where: { id: { in: ids } },
          data: { archivedAt: new Date(), isResolved: true },
        })
        await recordAdminActivity(req, 'LISTINGS_BULK_ARCHIVED', 'LISTING', null, `Archived ${ids.length} listings.`, tx)
      })
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.listing.deleteMany({ where: { id: { in: ids } } })
        await recordAdminActivity(req, 'LISTINGS_BULK_REMOVED', 'LISTING', null, `Removed ${ids.length} listings.`, tx)
      })
      await Promise.all(listings.map(({ imagePath }) => imagePath ? removeImage(imagePath) : undefined))
    }
    return res.json({ action: parsed.data.action, affectedCount: ids.length })
  } catch (error) {
    return next(error)
  }
})

router.get('/expiry', async (req, res, next) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days)
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return res.status(400).json({ error: 'Expiry review days must be between 1 and 365.' })
  }
  try {
    const [settings, listings] = await Promise.all([
      prisma.portalSettings.findUnique({ where: { key: 'portal' } }),
      prisma.listing.findMany({
        where: {
          isResolved: false,
          archivedAt: null,
          expiresAt: { lte: new Date(Date.now() + days * 86400000) },
        },
        select: listingFields,
        orderBy: { expiresAt: 'asc' },
        take: 200,
      }),
    ])
    return res.json({
      settings: { listingLifetimeDays: settings?.listingLifetimeDays ?? 90 },
      listings: listings.map((listing) => ({
        ...listing,
        isExpired: listing.expiresAt !== null && listing.expiresAt <= new Date(),
      })),
    })
  } catch (error) {
    return next(error)
  }
})

router.patch('/expiry/settings', async (req, res, next) => {
  const parsed = lifetimeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Choose a listing lifetime from 1 to 3650 days.' })
  }
  try {
    const settings = await prisma.portalSettings.upsert({
      where: { key: 'portal' },
      update: { listingLifetimeDays: parsed.data.listingLifetimeDays },
      create: { key: 'portal', listingLifetimeDays: parsed.data.listingLifetimeDays },
    })
    await recordAdminActivity(
      req,
      'LISTING_LIFETIME_UPDATED',
      'SETTINGS',
      settings.id,
      `Set the default listing lifetime to ${settings.listingLifetimeDays} days.`,
    )
    return res.json({ settings: { listingLifetimeDays: settings.listingLifetimeDays } })
  } catch (error) {
    return next(error)
  }
})

router.patch('/listings/:id/expiry', async (req, res, next) => {
  const parsed = expirySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid expiry date.' })
  }
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id }, select: { id: true, title: true } })
    if (!existing) return res.status(404).json({ error: 'This listing could not be found.' })
    const expiresAt = new Date(`${parsed.data.expiresAt}T23:59:59.999Z`)
    const listing = await prisma.listing.update({
      where: { id: existing.id },
      data: { expiresAt },
      select: { id: true, expiresAt: true },
    })
    await recordAdminActivity(req, 'LISTING_EXPIRY_UPDATED', 'LISTING', listing.id, `Adjusted expiry for "${existing.title}".`)
    return res.json({ listing })
  } catch (error) {
    return next(error)
  }
})

const accountFilters = z.object({
  query: z.string().trim().max(100).optional(),
  status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED']).optional(),
})

router.get('/users', async (req, res, next) => {
  const parsed = accountFilters.safeParse({
    query: req.query.query,
    status: req.query.status,
  })
  if (!parsed.success) return res.status(400).json({ error: 'Check the account search filters.' })
  const query = parsed.data.query
  try {
    const users = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        ...(parsed.data.status && parsed.data.status !== 'ALL' ? { accountStatus: parsed.data.status } : {}),
        ...(query ? { OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ] } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        approvalStatus: true,
        accountStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return res.json({ users })
  } catch (error) {
    return next(error)
  }
})

async function setAccountStatus(req, res, next, accountStatus) {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, role: true, approvalStatus: true, accountStatus: true },
    })
    if (!existing || existing.role !== 'STUDENT' || existing.approvalStatus !== 'APPROVED') {
      return res.status(404).json({ error: 'This approved student account could not be found.' })
    }
    const expectedStatus = accountStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
    const result = await prisma.user.updateMany({
      where: {
        id: existing.id,
        role: 'STUDENT',
        approvalStatus: 'APPROVED',
        accountStatus: expectedStatus,
      },
      data: { accountStatus },
    })
    if (!result.count) return res.status(409).json({ error: 'This account has already changed status.' })
    await recordAdminActivity(
      req,
      accountStatus === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      'USER',
      existing.id,
      `${accountStatus === 'SUSPENDED' ? 'Suspended' : 'Reactivated'} student account "${existing.name}".`,
    )
    return res.json({ user: { id: existing.id, accountStatus } })
  } catch (error) {
    return next(error)
  }
}

router.patch('/users/:id/suspend', (req, res, next) => setAccountStatus(req, res, next, 'SUSPENDED'))
router.patch('/users/:id/activate', (req, res, next) => setAccountStatus(req, res, next, 'ACTIVE'))

const activityQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  action: z.string().trim().max(60).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
})

router.get('/activity', async (req, res, next) => {
  const parsed = activityQuerySchema.safeParse({
    query: req.query.query,
    action: req.query.action,
    from: req.query.from,
    to: req.query.to,
  })
  if (!parsed.success) return res.status(400).json({ error: 'Check the activity search filters.' })
  const { query, action, from, to } = parsed.data
  const createdAt = {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  }
  try {
    const activities = await prisma.adminActivity.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        ...(query ? { OR: [
          { summary: { contains: query, mode: 'insensitive' } },
          { adminName: { contains: query, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return res.json({ activities })
  } catch (error) {
    return next(error)
  }
})

function sendCsv(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.send(`\uFEFF${toCsv(headers, rows)}`)
}

router.get('/exports/listings.csv', async (req, res, next) => {
  try {
    const listings = await prisma.listing.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        category: true,
        location: true,
        createdAt: true,
        expiresAt: true,
        isResolved: true,
        archivedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })
    await recordAdminActivity(req, 'LISTINGS_EXPORTED', 'EXPORT', null, `Exported ${listings.length} listing summaries.`)
    return sendCsv(res, 'campus-listings.csv',
      ['listing_id', 'title', 'status', 'category', 'location', 'created_at', 'expires_at', 'resolved', 'archived'],
      listings.map((listing) => [
        listing.id,
        listing.title,
        listing.status,
        listing.category,
        listing.location,
        listing.createdAt.toISOString(),
        listing.expiresAt?.toISOString() ?? '',
        listing.isResolved,
        Boolean(listing.archivedAt),
      ]))
  } catch (error) {
    return next(error)
  }
})

router.get('/exports/approvals.csv', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: { id: true, approvalStatus: true, createdAt: true, approvalDecidedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })
    await recordAdminActivity(req, 'APPROVALS_EXPORTED', 'EXPORT', null, `Exported ${users.length} account approval summaries.`)
    return sendCsv(res, 'campus-account-approvals.csv',
      ['account_id', 'approval_status', 'requested_at', 'decided_at'],
      users.map((user) => [
        user.id,
        user.approvalStatus,
        user.createdAt.toISOString(),
        user.approvalDecidedAt?.toISOString() ?? '',
      ]))
  } catch (error) {
    return next(error)
  }
})

export default router
