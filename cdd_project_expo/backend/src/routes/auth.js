import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(100),
})
const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password.').max(100),
})

function createToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, { subject: userId, expiresIn: '7d' })
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role ?? 'STUDENT',
    approvalStatus: user.approvalStatus ?? 'APPROVED',
  }
}

router.post('/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your information and try again.' })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: 'STUDENT',
        approvalStatus: 'PENDING',
        accountStatus: 'ACTIVE',
      },
    })
    return res.status(201).json({
      message: 'Your account is waiting for admin approval.',
      user: publicUser(user),
    })
  } catch (error) {
    return next(error)
  }
})

router.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your information and try again.' })
  }
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    const matches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false
    if (!user || !matches || user.role === 'ADMIN' || user.accountStatus !== 'ACTIVE') {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    if (user.approvalStatus === 'PENDING') {
      return res.status(403).json({ error: 'Your account is waiting for admin approval.' })
    }
    if (user.approvalStatus !== 'APPROVED') {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    return res.json({ token: createToken(user.id), user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})

router.post('/admin/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter a valid email address and password.' })
  }
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    const matches = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false
    if (!user || !matches || user.role !== 'ADMIN' || user.approvalStatus !== 'APPROVED' || user.accountStatus !== 'ACTIVE') {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    return res.json({ token: createToken(user.id), user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, role: true, approvalStatus: true },
    })
    if (!user) {
      return res.status(401).json({ error: 'Your account could not be found. Please sign in again.' })
    }
    return res.json({ user })
  } catch (error) {
    return next(error)
  }
})

export default router
