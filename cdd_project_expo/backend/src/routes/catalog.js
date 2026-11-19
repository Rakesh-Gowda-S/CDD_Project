import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const [categories, locations] = await Promise.all([
      prisma.listingCategory.findMany({
        where: { isActive: true },
        select: { key: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.campusLocation.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])
    return res.json({ categories, locations })
  } catch (error) {
    return next(error)
  }
})

export default router
