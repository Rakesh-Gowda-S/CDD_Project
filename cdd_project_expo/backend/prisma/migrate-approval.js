import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

const prisma = new PrismaClient()

async function main() {
  await prisma.$runCommandRaw({
    update: 'User',
    updates: [{
      q: { approvalStatus: { $exists: false } },
      u: { $set: { approvalStatus: 'APPROVED' } },
      multi: true,
    }],
  })
  console.log('Marked existing users without an approval status as APPROVED.')
}

main()
  .catch((error) => {
    console.error('Unable to migrate account approval status:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
