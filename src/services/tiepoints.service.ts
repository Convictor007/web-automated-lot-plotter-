/**
 * Tie Points Service — loads province-wide catalog from public/data/tiepoints-2025.json.
 */

export interface TiePoint {
  id: string
  name: string
  province: string
  municipality: string
  lat: number
  lon: number
  zone: number
  /** Easting (m), PRS92 / TM grid — from source field `X`. */
  x: number
  /** Northing (m), PRS92 / TM grid — from source field `Y`. */
  y: number
}

interface TiePointRow {
  Province: string
  Municipality: string
  'Tie Point': string
  Lat: number
  Lon: number
  Zone: number
  X: number
  Y: number
  Barangay?: string
}

function toTiePoint(row: TiePointRow, idx: number): TiePoint {
  return {
    id: `tp-${idx}-${row['Tie Point'].replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40)}`,
    name: row['Tie Point'],
    province: row.Province,
    municipality: row.Municipality,
    lat: row.Lat,
    lon: row.Lon,
    zone: row.Zone,
    x: row.X,
    y: row.Y,
  }
}

let cachedTiePoints: TiePoint[] | null = null
let cachedProvinces: string[] | null = null
let cachedMunicipalities: Map<string, string[]> | null = null
let cachedTiePointsByLocation: Map<string, TiePoint[]> | null = null
let loadPromise: Promise<TiePoint[]> | null = null

/** Fetch and cache the full tie-point catalog (~21 MB JSON, once per session). */
export function loadTiePointsCatalog(): Promise<TiePoint[]> {
  if (cachedTiePoints) return Promise.resolve(cachedTiePoints)
  if (loadPromise) return loadPromise

  loadPromise = fetch('/data/tiepoints-2025.json')
    .then((res) => {
      if (!res.ok) throw new Error(`tiepoints-2025.json HTTP ${res.status}`)
      return res.json() as Promise<TiePointRow[]>
    })
    .then((rows) => {
      cachedTiePoints = rows.map((row, idx) => toTiePoint(row, idx))
      cachedProvinces = null
      cachedMunicipalities = null
      cachedTiePointsByLocation = null
      return cachedTiePoints
    })
    .catch((err) => {
      console.warn('Failed to load tiepoints-2025.json:', err)
      cachedTiePoints = []
      return cachedTiePoints
    })

  return loadPromise
}

export function isTiePointsCatalogLoaded(): boolean {
  return cachedTiePoints !== null
}

const getTiePoints = (): TiePoint[] => cachedTiePoints ?? []

export const getProvinces = (): string[] => {
  if (cachedProvinces) return cachedProvinces

  const tiePoints = getTiePoints()
  const provinces = [...new Set(tiePoints.map((tp) => tp.province))].sort()
  cachedProvinces = provinces
  return provinces
}

export const getMunicipalities = (province: string): string[] => {
  const key = province.toUpperCase()
  if (cachedMunicipalities?.has(key)) return cachedMunicipalities.get(key)!

  if (!cachedMunicipalities) cachedMunicipalities = new Map()

  const tiePoints = getTiePoints()
  const municipalities = [
    ...new Set(tiePoints.filter((tp) => tp.province === key).map((tp) => tp.municipality)),
  ].sort()

  cachedMunicipalities.set(key, municipalities)
  return municipalities
}

export const getTiePointsByLocation = (province: string, municipality: string): TiePoint[] => {
  const key = `${province.toUpperCase()}-${municipality.toUpperCase()}`

  if (cachedTiePointsByLocation?.has(key)) return cachedTiePointsByLocation.get(key)!

  if (!cachedTiePointsByLocation) cachedTiePointsByLocation = new Map()

  const tiePoints = getTiePoints()
  const filtered = tiePoints.filter(
    (tp) => tp.province === province.toUpperCase() && tp.municipality === municipality.toUpperCase()
  )

  filtered.sort((a, b) => {
    const aIsBllm1 = /^BLLM\s*(NO\.?)?\s*1\b/i.test(a.name)
    const bIsBllm1 = /^BLLM\s*(NO\.?)?\s*1\b/i.test(b.name)
    if (aIsBllm1 && !bIsBllm1) return -1
    if (!aIsBllm1 && bIsBllm1) return 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  cachedTiePointsByLocation.set(key, filtered)
  return filtered
}

export const searchTiePoints = (query: string): TiePoint[] => {
  const tiePoints = getTiePoints()
  const searchTerm = query.toLowerCase()

  return tiePoints.filter(
    (tp) =>
      tp.name.toLowerCase().includes(searchTerm) ||
      tp.municipality.toLowerCase().includes(searchTerm) ||
      tp.province.toLowerCase().includes(searchTerm)
  )
}

const MONUMENT_NUM_RE = /\b(?:BLLM|BBM|BLBM|BLIM)\s*NO\.?\s*(\d+)\b/i

const DOC_TOKEN_STOP = new Set([
  'the',
  'and',
  'from',
  'for',
  'not',
  'are',
  'cad',
  'being',
  'point',
  'marked',
  'plan',
  'more',
  'less',
])

function tokenizeDocForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !DOC_TOKEN_STOP.has(w))
}

export function findBestTiePointMatch(documentTieText: string | null | undefined): TiePoint | null {
  if (!documentTieText?.trim()) return null

  const raw = documentTieText.trim()
  const lower = raw.toLowerCase()
  const numMatch = raw.match(MONUMENT_NUM_RE)
  const monumentNum = numMatch ? numMatch[1] : null
  const tiePoints = getTiePoints()

  let best: TiePoint | null = null
  let bestScore = -1

  for (const tp of tiePoints) {
    const nameLower = tp.name.toLowerCase()
    const munLower = tp.municipality.toLowerCase()
    const provLower = tp.province.toLowerCase()
    const haystack = `${nameLower} ${munLower} ${provLower}`
    let score = 0

    if (monumentNum) {
      const monumentRe = new RegExp(`(?:bllm|bbm|blbm|blim)\\s*no\\.?\\s*${monumentNum}\\b`, 'i')
      if (monumentRe.test(tp.name)) score += 85
      else if (/(?:bllm|bbm|blbm|blim)\s*no\.?\s*\d+/i.test(tp.name)) score -= 45
    }

    if (lower.includes(munLower) || raw.toUpperCase().includes(tp.municipality)) score += 35
    if (lower.includes(provLower) || raw.toUpperCase().includes(tp.province)) score += 18

    const tokens = tokenizeDocForMatch(raw)
    let tokenHits = 0
    for (const t of tokens) {
      if (haystack.includes(t)) tokenHits += 1
    }
    score += Math.min(tokenHits * 6, 24)

    if (score > bestScore) {
      bestScore = score
      best = tp
    }
  }

  if (!best || bestScore < 42) return null
  return best
}

export const getTiePointById = (id: string): TiePoint | undefined => {
  return getTiePoints().find((tp) => tp.id === id)
}

export const getNearestTiePoint = (
  lat: number,
  lon: number,
  province?: string,
  municipality?: string
): TiePoint | null => {
  let tiePoints = getTiePoints()

  if (province && municipality) {
    tiePoints = tiePoints.filter(
      (tp) => tp.province === province.toUpperCase() && tp.municipality === municipality.toUpperCase()
    )
  } else if (province) {
    tiePoints = tiePoints.filter((tp) => tp.province === province.toUpperCase())
  }

  if (tiePoints.length === 0) return null

  let nearest = tiePoints[0]
  let minDistance = calculateDistance(lat, lon, nearest.lat, nearest.lon)

  for (const tp of tiePoints) {
    const distance = calculateDistance(lat, lon, tp.lat, tp.lon)
    if (distance < minDistance) {
      minDistance = distance
      nearest = tp
    }
  }

  return nearest
}

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default {
  loadTiePointsCatalog,
  isTiePointsCatalogLoaded,
  getProvinces,
  getMunicipalities,
  getTiePointsByLocation,
  searchTiePoints,
  getTiePointById,
  getNearestTiePoint,
  findBestTiePointMatch,
}
