import { prisma } from './prisma.js'

export async function recordAdminActivity(req, action, targetType, targetId, summary, client = prisma) {
  const admin = await client.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true },
  })
  if (!admin) throw new Error('Administrator account could not be found while recording activity.')

  return client.adminActivity.create({
    data: {
      adminId: admin.id,
      adminName: admin.name,
      action,
      targetType,
      ...(targetId ? { targetId } : {}),
      summary,
    },
  })
}
