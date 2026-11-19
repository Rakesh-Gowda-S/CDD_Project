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
      q: { role: { $exists: false } },
      u: { $set: { role: 'STUDENT' } },
      multi: true,
    }],
  })
  console.log('Assigned STUDENT role to existing users without a role.')
}

main()
  .catch((error) => {
    console.error('Unable to migrate user roles:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
