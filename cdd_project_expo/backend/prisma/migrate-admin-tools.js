import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

const prisma = new PrismaClient()
const defaultCategories = [
  { key: 'ID_CARD', name: 'ID cards' },
  { key: 'BOOKS', name: 'Books' },
  { key: 'ELECTRONICS', name: 'Electronics' },
  { key: 'KEYS', name: 'Keys' },
  { key: 'CLOTHING', name: 'Clothing' },
  { key: 'ACCESSORIES', name: 'Accessories' },
  { key: 'OTHER', name: 'Other' },
]
const defaultLocations = ['Library', 'Student Center', 'Science Building', 'Cafeteria']

async function main() {
  await prisma.$runCommandRaw({
    update: 'User',
    updates: [{
      q: { accountStatus: { $exists: false } },
      u: { $set: { accountStatus: 'ACTIVE' } },
      multi: true,
    }],
  })

  const settings = await prisma.portalSettings.upsert({
    where: { key: 'portal' },
    update: {},
    create: { key: 'portal', listingLifetimeDays: 90 },
  })

  const categoryCount = await prisma.listingCategory.count()
  if (!categoryCount) {
    for (const category of defaultCategories) {
      await prisma.listingCategory.create({ data: category })
    }
  }

  const existingCategories = await prisma.listing.findMany({
    select: { category: true },
    distinct: ['category'],
  })
  for (const { category } of existingCategories) {
    if (!category || !/^[A-Z0-9_]{1,60}$/.test(category)) continue
    const name = defaultCategories.find((item) => item.key === category)?.name
      ?? category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    await prisma.listingCategory.upsert({
      where: { key: category },
      update: {},
      create: { key: category, name },
    })
  }

  const existingListings = await prisma.listing.findMany({
    select: { location: true },
    distinct: ['location'],
  })
  const locationNames = new Set(existingListings.map(({ location }) => location.trim()).filter(Boolean))
  if (!(await prisma.campusLocation.count())) {
    defaultLocations.forEach((name) => locationNames.add(name))
  }
  for (const name of locationNames) {
    await prisma.campusLocation.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const listingsWithoutExpiry = await prisma.listing.findMany({
    where: { expiresAt: null },
    select: { id: true, createdAt: true },
  })
  for (const listing of listingsWithoutExpiry) {
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        expiresAt: new Date(listing.createdAt.getTime() + settings.listingLifetimeDays * 86400000),
      },
    })
  }

  console.log('Initialized admin tools and preserved existing listings and accounts.')
}

main()
  .catch((error) => {
    console.error('Unable to migrate admin tools:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
