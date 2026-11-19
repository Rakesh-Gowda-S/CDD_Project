import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { recordAdminActivity } from '../lib/admin-activity.js'

const router = Router()
router.param('id', (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: 'Choose a valid record.' })
  return next()
})
const nameSchema = z.string().trim().min(2, 'Enter at least 2 characters.').max(60)
const categorySchema = z.object({
  name: nameSchema,
})
const categoryUpdateSchema = z.object({
  name: nameSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined, 'Provide a name or active status.')
const locationUpdateSchema = z.object({
  name: nameSchema.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined, 'Provide a name or active status.')

function categoryKey(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

router.get('/categories', async (_req, res, next) => {
  try {
    const categories = await prisma.listingCategory.findMany({ orderBy: { name: 'asc' } })
    const result = await Promise.all(categories.map(async (category) => ({
      ...category,
      listingCount: await prisma.listing.count({ where: { category: category.key } }),
    })))
    return res.json({ categories: result })
  } catch (error) {
    return next(error)
  }
})

router.post('/categories', async (req, res, next) => {
  const parsed = categorySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the category name.' })
  }
  const key = categoryKey(parsed.data.name)
  if (!key) return res.status(400).json({ error: 'Category name must contain a letter or number.' })
  try {
    const category = await prisma.listingCategory.create({
      data: { key, name: parsed.data.name },
    })
    await recordAdminActivity(req, 'CATEGORY_CREATED', 'CATEGORY', category.id, `Added category "${category.name}".`)
    return res.status(201).json({ category })
  } catch (error) {
    return next(error)
  }
})

router.patch('/categories/:id', async (req, res, next) => {
  const parsed = categoryUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the category changes.' })
  }
  try {
    const existing = await prisma.listingCategory.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This category could not be found.' })
    const category = await prisma.listingCategory.update({
      where: { id: existing.id },
      data: parsed.data,
    })
    await recordAdminActivity(req, 'CATEGORY_UPDATED', 'CATEGORY', category.id, `Updated category "${category.name}".`)
    return res.json({ category })
  } catch (error) {
    return next(error)
  }
})

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const existing = await prisma.listingCategory.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This category could not be found.' })
    const listingCount = await prisma.listing.count({ where: { category: existing.key } })
    if (listingCount) {
      return res.status(409).json({ error: 'This category is used by listings. Deactivate it instead.' })
    }
    await prisma.listingCategory.delete({ where: { id: existing.id } })
    await recordAdminActivity(req, 'CATEGORY_DELETED', 'CATEGORY', existing.id, `Deleted unused category "${existing.name}".`)
    return res.status(204).end()
  } catch (error) {
    return next(error)
  }
})

router.get('/locations', async (_req, res, next) => {
  try {
    const locations = await prisma.campusLocation.findMany({ orderBy: { name: 'asc' } })
    const result = await Promise.all(locations.map(async (location) => ({
      ...location,
      listingCount: await prisma.listing.count({ where: { location: location.name } }),
    })))
    return res.json({ locations: result })
  } catch (error) {
    return next(error)
  }
})

router.post('/locations', async (req, res, next) => {
  const parsed = categorySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the location name.' })
  }
  try {
    const location = await prisma.campusLocation.create({ data: { name: parsed.data.name } })
    await recordAdminActivity(req, 'LOCATION_CREATED', 'LOCATION', location.id, `Added campus location "${location.name}".`)
    return res.status(201).json({ location })
  } catch (error) {
    return next(error)
  }
})

router.patch('/locations/:id', async (req, res, next) => {
  const parsed = locationUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the location changes.' })
  }
  try {
    const existing = await prisma.campusLocation.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'This campus location could not be found.' })
    const location = await prisma.$transaction(async (tx) => {
      const updated = await tx.campusLocation.update({
        where: { id: existing.id },
        data: parsed.data,
      })
      if (parsed.data.name && parsed.data.name !== existing.name) {
        await tx.listing.updateMany({
          where: { location: existing.name },
          data: { location: parsed.data.name },
        })
      }
      await recordAdminActivity(req, 'LOCATION_UPDATED', 'LOCATION', updated.id, `Updated campus location "${updated.name}".`, tx)
      return updated
    })
    return res.json({ location })
  } catch (error) {
    return next(error)
  }
})

export default router
