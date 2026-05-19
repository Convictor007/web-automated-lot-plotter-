/** Resize large photos before upload (faster OCR, fits Vercel 4 MB limit). */
const MAX_EDGE_PX = 2400
const JPEG_QUALITY = 0.88

export async function prepareScanImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const maxEdge = Math.max(bitmap.width, bitmap.height)
    if (maxEdge <= MAX_EDGE_PX && file.size <= 3 * 1024 * 1024) {
      bitmap.close()
      return file
    }

    const scale = Math.min(1, MAX_EDGE_PX / maxEdge)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
    })
    if (!blob) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'scan'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
