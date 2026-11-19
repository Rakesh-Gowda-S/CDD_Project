import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { recordAdminActivity } from '../lib/admin-activity.js'

const router = Router()
router.param('id', (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: 'Choose a valid report.' })
  return next()
})
const reportActionSchema = z.object({
  action: z.enum(['ARCHIVE', 'RESOLVE']),
})

router.get('/', async (req, res, next) => {
  const status = req.query.status === undefined ? 'PENDING' : req.query.status
  if (!['PENDING', 'DISMISSED', 'ACTIONED', 'ALL'].includes(status)) {
    return res.status(400).json({ error: 'Choose a valid report status.' })
  }
  try {
    const reports = await prisma.listingReport.findMany({
      where: status === 'ALL' ? {} : { status },
      include: {
        listing: {
          select: { id: true, title: true, category: true, location: true, status: true, isResolved: true, archivedAt: true },
        },
        reporter: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return res.json({ reports })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id/dismiss', async (req, res, next) => {
  try {
    const report = await prisma.listingReport.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    })
    if (!report || report.status !== 'PENDING') {
      return res.status(404).json({ error: 'This pending report could not be found.' })
    }
    await prisma.$transaction(async (tx) => {
      const result = await tx.listingReport.updateMany({
        where: { id: report.id, status: 'PENDING' },
        data: { status: 'DISMISSED', reviewedAt: new Date(), reviewedBy: req.userId },
      })
      if (!result.count) throw Object.assign(new Error('This report has already been reviewed.'), { status: 409 })
      await recordAdminActivity(req, 'REPORT_DISMISSED', 'REPORT', report.id, 'Dismissed a student listing report.', tx)
    })
    return res.json({ status: 'DISMISSED' })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id/action', async (req, res, next) => {
  const parsed = reportActionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose whether to archive or resolve the listing.' })
  try {
    const report = await prisma.listingReport.findUnique({
      where: { id: req.params.id },
      select: { id: true, listingId: true, status: true },
    })
    if (!report || report.status !== 'PENDING') {
      return res.status(404).json({ error: 'This pending report could not be found.' })
    }
    await prisma.$transaction(async (tx) => {
      const result = await tx.listingReport.updateMany({
        where: { id: report.id, status: 'PENDING' },
        data: { status: 'ACTIONED', reviewedAt: new Date(), reviewedBy: req.userId },
      })
      if (!result.count) throw Object.assign(new Error('This report has already been reviewed.'), { status: 409 })
      await tx.listing.update({
        where: { id: report.listingId },
        data: parsed.data.action === 'ARCHIVE'
          ? { archivedAt: new Date(), isResolved: true }
          : { isResolved: true },
      })
      await recordAdminActivity(
        req,
        parsed.data.action === 'ARCHIVE' ? 'REPORT_LISTING_ARCHIVED' : 'REPORT_LISTING_RESOLVED',
        'LISTING',
        report.listingId,
        `${parsed.data.action === 'ARCHIVE' ? 'Archived' : 'Resolved'} a listing after reviewing a report.`,
        tx,
      )
    })
    return res.json({ status: 'ACTIONED', action: parsed.data.action })
  } catch (error) {
    return next(error)
  }
})

export default router
