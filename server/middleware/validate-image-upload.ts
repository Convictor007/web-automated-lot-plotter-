import { fileTypeFromBuffer } from 'file-type'
import type { RequestHandler } from 'express'
import { ALLOWED_IMAGE_MIME_TYPES, getMaxUploadBytes } from '../config/security.js'

function hasJpegMagic(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function hasPngMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
}

function hasWebpMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
}

function hasGifMagic(buffer: Buffer): boolean {
  return buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')
}

function detectImageMime(buffer: Buffer): string | null {
  if (hasJpegMagic(buffer)) return 'image/jpeg'
  if (hasPngMagic(buffer)) return 'image/png'
  if (hasWebpMagic(buffer)) return 'image/webp'
  if (hasGifMagic(buffer)) return 'image/gif'
  return null
}

async function resolveAllowedMime(buffer: Buffer): Promise<string | null> {
  const fromLib = await fileTypeFromBuffer(buffer)
  if (fromLib?.mime && ALLOWED_IMAGE_MIME_TYPES.has(fromLib.mime)) {
    return fromLib.mime
  }
  const fromMagic = detectImageMime(buffer)
  if (fromMagic && ALLOWED_IMAGE_MIME_TYPES.has(fromMagic)) {
    return fromMagic
  }
  return null
}

/** Run after multer; rejects non-images and oversize buffers. */
export const validateImageUpload: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file?.buffer?.length) {
      res.status(400).json({ success: false, message: 'No image uploaded' })
      return
    }

    const maxBytes = getMaxUploadBytes()
    const maxMb = Math.round(maxBytes / (1024 * 1024))
    if (req.file.size > maxBytes || req.file.buffer.length > maxBytes) {
      res.status(413).json({ success: false, message: `Image is too large (max ${maxMb} MB).` })
      return
    }

    const mime = await resolveAllowedMime(req.file.buffer)
    if (!mime) {
      res.status(415).json({
        success: false,
        message: 'Only JPEG, PNG, WebP, or GIF images are allowed.',
      })
      return
    }

    req.file.mimetype = mime
    next()
  } catch (error) {
    next(error)
  }
}
