import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

const prisma = new PrismaClient()
const demoEmail = 'demo.student@campus.example'

async function main() {
  const settings = await prisma.portalSettings.upsert({
    where: { key: 'portal' },
    update: {},
    create: { key: 'portal', listingLifetimeDays: 90 },
  })
  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      name: 'Jordan Lee',
      email: demoEmail,
      passwordHash,
      role: 'STUDENT',
      approvalStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
    },
  })

  const examples = [
    {
      title: 'Blue campus ID card',
      description: 'Found near the north entrance of the library. The card has a blue lanyard attached.',
      status: 'FOUND',
      category: 'ID_CARD',
      approximateDate: new Date('2026-11-16T12:00:00.000Z'),
      location: 'North Library entrance',
    },
    {
      title: 'Calculus textbook',
      description: 'Lost a well-used calculus textbook with handwritten notes inside. Last seen after class.',
      status: 'LOST',
      category: 'BOOKS',
      approximateDate: new Date('2026-11-15T12:00:00.000Z'),
      location: 'Science Building, Room 204',
    },
    {
      title: 'Set of silver keys',
      description: 'Found three silver keys on a small green key ring beside the student center benches.',
      status: 'FOUND',
      category: 'KEYS',
      approximateDate: new Date('2026-11-14T12:00:00.000Z'),
      location: 'Student Center',
    },
  ]

  for (const example of examples) {
    const existing = await prisma.listing.findFirst({ where: { title: example.title, ownerId: user.id } })
    const data = {
      ...example,
      expiresAt: new Date(Date.now() + settings.listingLifetimeDays * 86400000),
      ownerId: user.id,
    }
    if (existing) {
      await prisma.listing.update({ where: { id: existing.id }, data })
    } else {
      await prisma.listing.create({ data })
    }
  }
  console.log('Seeded demo listings.')
}

main()
  .catch((error) => {
    console.error('Unable to seed demo data:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
