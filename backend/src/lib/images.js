import { unlink } from 'node:fs/promises'
import path from 'node:path'

const uploadsDirectory = path.resolve('uploads')

export async function removeImage(imagePath) {
  if (!imagePath) return
  const filename = path.basename(imagePath)
  try {
    await unlink(path.join(uploadsDirectory, filename))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
