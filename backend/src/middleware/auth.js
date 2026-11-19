import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'

export async function requireAuth(req, res, next) {
  const authorization = req.get('authorization')
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Please sign in to continue.' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' })
    }
    req.userId = payload.sub
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true, approvalStatus: true, accountStatus: true },
    })
    if (!user) {
      return res.status(401).json({ error: 'Your account could not be found. Please sign in again.' })
    }
    if (user.approvalStatus === 'PENDING') {
      return res.status(403).json({ error: 'Your account is waiting for admin approval.' })
    }
    if (user.approvalStatus !== 'APPROVED') {
      return res.status(403).json({ error: 'Your account is not approved.' })
    }
    if (user.accountStatus !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is unavailable. Please contact an administrator.' })
    }
    req.userRole = user.role
    return next()
  } catch (error) {
    return next(error)
  }
}

export function requireAdmin(req, res, next) {
  if (req.userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Administrator access is required.' })
  }
  return next()
}
