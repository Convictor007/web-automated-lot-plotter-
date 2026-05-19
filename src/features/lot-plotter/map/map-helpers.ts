import { getGoogleMapsApiKey } from '@/config/env'

export type BasemapStyle = 'satellite' | 'hybrid' | 'street' | 'terrain' | 'dark' | 'light'

export const BASEMAP_LAYER_SEQUENCE: BasemapStyle[] = [
  'satellite',
  'hybrid',
  'street',
  'terrain',
  'dark',
  'light',
]

export function googleMapTypeIdForBasemap(b: BasemapStyle): string {
  switch (b) {
    case 'satellite':
      return 'SATELLITE'
    case 'hybrid':
      return 'HYBRID'
    case 'terrain':
      return 'TERRAIN'
    case 'street':
    case 'dark':
    case 'light':
    default:
      return 'ROADMAP'
  }
}

export function nextBasemapInSequence(current: BasemapStyle): BasemapStyle {
  const i = BASEMAP_LAYER_SEQUENCE.indexOf(current)
  const idx = i >= 0 ? i : 0
  return BASEMAP_LAYER_SEQUENCE[(idx + 1) % BASEMAP_LAYER_SEQUENCE.length]
}

export function buildBasemapPreviewUri(
  basemap: BasemapStyle,
  center: { lat: number; lng: number }
): string {
  const key = getGoogleMapsApiKey()
  if (!key) return ''
  const maptype =
    basemap === 'satellite'
      ? 'satellite'
      : basemap === 'hybrid'
        ? 'hybrid'
        : basemap === 'terrain'
          ? 'terrain'
          : 'roadmap'
  return `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=11&size=160x100&scale=2&maptype=${maptype}&key=${encodeURIComponent(key)}`
}

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
