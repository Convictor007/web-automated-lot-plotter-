import { buildCenterLabelHtml, type MapCenterLabel, type MapSegmentEdge } from './map-label-utils'

/** User-facing map display options (Map Settings panel). */
export interface MapSettings {
  showAreaLabel: boolean
  showDistanceLabels: boolean
  polygonColor: string
}

export const DEFAULT_POLYGON_COLOR = '#facc15'

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  showAreaLabel: false,
  showDistanceLabels: false,
  polygonColor: DEFAULT_POLYGON_COLOR,
}

/** Payload sent to map iframe via APPLY_LOT_UI. */
export interface LotMapUiPayload {
  strokeColor: string
  fillColor: string
  labelColor: string
  segmentEdges: MapSegmentEdge[]
  centerLabelHtml: string
  showArea: boolean
  showDistance: boolean
  area: number | null
}

/** ArcGIS compare map uses line array instead of HTML for center labels. */
export interface CompareLotMapUiPayload {
  strokeColor: string
  labelColor: string
  segmentEdges: MapSegmentEdge[]
  centerLines: string[]
  showArea: boolean
  showDistance: boolean
  area: number | null
}

/** Resolve settings from modal hook or legacy boolean props. */
export function resolveMapSettings(
  mapSettings?: MapSettings,
  legacy?: { showAreaLabel?: boolean; showDistanceLabel?: boolean; polygonColor?: string }
): MapSettings {
  if (mapSettings) return mapSettings
  return createMapSettings({
    showAreaLabel: legacy?.showAreaLabel,
    showDistanceLabels: legacy?.showDistanceLabel,
    polygonColor: legacy?.polygonColor,
  })
}

export function createMapSettings(
  overrides?: Partial<MapSettings> & { polygonColorFromProp?: string | null }
): MapSettings {
  return {
    showAreaLabel: overrides?.showAreaLabel ?? DEFAULT_MAP_SETTINGS.showAreaLabel,
    showDistanceLabels: overrides?.showDistanceLabels ?? DEFAULT_MAP_SETTINGS.showDistanceLabels,
    polygonColor:
      overrides?.polygonColor ??
      overrides?.polygonColorFromProp ??
      DEFAULT_MAP_SETTINGS.polygonColor,
  }
}

export function toggleAreaLabel(settings: MapSettings): MapSettings {
  return { ...settings, showAreaLabel: !settings.showAreaLabel }
}

export function toggleDistanceLabels(settings: MapSettings): MapSettings {
  return { ...settings, showDistanceLabels: !settings.showDistanceLabels }
}

export function setPolygonColor(settings: MapSettings, polygonColor: string): MapSettings {
  return { ...settings, polygonColor }
}

export function buildLotMapUiPayload(input: {
  settings: MapSettings
  segmentEdges?: MapSegmentEdge[]
  centerLabel?: MapCenterLabel | null
  area?: number
}): LotMapUiPayload {
  const { settings, segmentEdges = [], centerLabel, area } = input
  const centerLabelHtml =
    settings.showAreaLabel && centerLabel
      ? buildCenterLabelHtml(centerLabel, '#ffffff', true)
      : ''

  return {
    strokeColor: settings.polygonColor,
    fillColor: settings.polygonColor,
    labelColor: '#ffffff',
    segmentEdges,
    centerLabelHtml,
    showArea: settings.showAreaLabel,
    showDistance: settings.showDistanceLabels,
    area: area !== undefined && area !== null ? area : null,
  }
}

export function buildCompareLotMapUiPayload(input: {
  settings: MapSettings
  segmentEdges?: MapSegmentEdge[]
  centerLines: string[]
  area?: number
}): CompareLotMapUiPayload {
  const { settings, segmentEdges = [], centerLines, area } = input
  return {
    strokeColor: settings.polygonColor,
    labelColor: '#ffffff',
    segmentEdges,
    centerLines: settings.showAreaLabel ? centerLines : [],
    showArea: settings.showAreaLabel,
    showDistance: settings.showDistanceLabels,
    area: area !== undefined && area !== null ? area : null,
  }
}
