/**
 * Google Maps lot view — same-origin iframe (/lot-map-frame.html) so API key referrers match and tiles load.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Layers, ScanLine } from 'lucide-react'
import { getGoogleMapsApiKey } from '@/config/env'
import { MapNorthCompassOverlay, MAP_COMPASS_CONTROL_TOP } from './MapNorthCompassOverlay'
import {
  type BasemapStyle,
  buildBasemapPreviewUri,
  googleMapTypeIdForBasemap,
  nextBasemapInSequence,
} from './map-helpers'
import {
  buildLotMapUiPayload,
  resolveMapSettings,
  type MapSettings,
} from './map-settings'
import { type MapCenterLabel, type MapSegmentEdge } from './map-label-utils'
import './GoogleMapView.css'

export type { MapCenterLabel, MapSegmentEdge }

export interface GoogleMapViewProps {
  center: { lat: number; lng: number }
  zoom?: number
  polygon?: {
    coordinates: [number, number][]
    color?: string
    fillColor?: string
    segmentEdges?: MapSegmentEdge[]
    centerLabel?: MapCenterLabel
    /** @deprecated use segmentEdges */
    segmentLabels?: string[]
  } | null
  polygons?: Array<{
    coordinates: [number, number][]
    color?: string
    fillColor?: string
    segmentEdges?: MapSegmentEdge[]
    centerLabel?: MapCenterLabel
    segmentLabels?: string[]
  }> | null
  basemap?: BasemapStyle
  /** Map Settings from modal — controls labels and polygon stroke */
  mapSettings?: MapSettings
  showControls?: boolean
  area?: number
  fitPolygonToken?: string
  active?: boolean
  className?: string
  onRegionChange?: (center: { lat: number; lng: number }, zoom: number) => void
}

type IframeMapWindow = Window & {
  lotPlotterApplyBasemap?: (typeKey: string) => void
}

const LOT_MAP_FRAME_URL = `${import.meta.env.BASE_URL}lot-map-frame.html`

function buildMapInitConfig(
  apiKey: string,
  center: { lat: number; lng: number },
  zoom: number,
  basemap: BasemapStyle,
  polygon: GoogleMapViewProps['polygon'],
  polygons: GoogleMapViewProps['polygons'],
  settings: MapSettings,
  area: number | undefined
) {
  const lotInitialUi = buildLotMapUiPayload({
    settings,
    segmentEdges: polygon?.segmentEdges,
    centerLabel: polygon?.centerLabel,
    area,
  })
  return {
    apiKey,
    center,
    zoom,
    basemapKey: googleMapTypeIdForBasemap(basemap),
    polygonData: polygon || null,
    polygonsData: polygons || null,
    lotInitialUi,
  }
}

function polygonCoordsKey(polygon: GoogleMapViewProps['polygon']): string {
  return JSON.stringify(polygon?.coordinates ?? null)
}

function polygonsCoordsKey(polygons: GoogleMapViewProps['polygons']): string {
  return JSON.stringify((polygons || []).map((p) => p.coordinates))
}

export default function GoogleMapView({
  center,
  zoom = 16,
  polygon,
  polygons,
  basemap: basemapProp = 'satellite',
  mapSettings: mapSettingsProp,
  showControls = true,
  area,
  fitPolygonToken = '0|0',
  active = true,
  className = '',
  onRegionChange,
}: GoogleMapViewProps) {
  const [basemap, setBasemap] = useState<BasemapStyle>(basemapProp)
  const [mapHeading, setMapHeading] = useState(0)
  const [mapCenter, setMapCenter] = useState(center)
  const [fitBump, setFitBump] = useState(0)
  const [mapReady, setMapReady] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onRegionChangeRef = useRef(onRegionChange)
  onRegionChangeRef.current = onRegionChange

  const apiKey = getGoogleMapsApiKey()
  const polyCoordsKey = useMemo(() => polygonCoordsKey(polygon), [polygon?.coordinates])
  const multiPolyCoordsKey = useMemo(() => polygonsCoordsKey(polygons), [polygons])

  const mapSettings = useMemo(
    () =>
      resolveMapSettings(mapSettingsProp, {
        polygonColor: polygon?.color ?? polygon?.fillColor,
      }),
    [mapSettingsProp, polygon?.color, polygon?.fillColor]
  )

  const mapInitConfig = useMemo(() => {
    if (!apiKey) return null
    return buildMapInitConfig(apiKey, center, zoom, basemapProp, polygon, polygons, mapSettings, area)
  }, [
    apiKey,
    center.lat,
    center.lng,
    zoom,
    basemapProp,
    polyCoordsKey,
    multiPolyCoordsKey,
    mapSettings,
    area,
  ])

  const mapInitConfigRef = useRef(mapInitConfig)
  mapInitConfigRef.current = mapInitConfig

  const postToFrame = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }, [])

  const sendInitToFrame = useCallback(() => {
    const config = mapInitConfigRef.current
    if (!config) return
    postToFrame({ type: 'INIT_MAP', config })
  }, [postToFrame])

  const lotUiPayload = useMemo(
    () =>
      buildLotMapUiPayload({
        settings: mapSettings,
        segmentEdges: polygon?.segmentEdges,
        centerLabel: polygon?.centerLabel,
        area,
      }),
    [
      mapSettings,
      polygon?.segmentEdges,
      polygon?.centerLabel,
      area,
    ]
  )

  const lotUiPayloadRef = useRef(lotUiPayload)
  lotUiPayloadRef.current = lotUiPayload

  const sendBasemapToIframe = useCallback(
    (style: BasemapStyle) => {
      const typeKey = googleMapTypeIdForBasemap(style)
      const win = iframeRef.current?.contentWindow as IframeMapWindow | null
      if (!win) return
      try {
        win.lotPlotterApplyBasemap?.(typeKey)
      } catch {
        // ignore cross-origin until ready
      }
      win.postMessage({ type: 'SET_BASEMAP', mapTypeKey: typeKey }, '*')
    },
    []
  )

  useEffect(() => {
    setBasemap(basemapProp)
  }, [basemapProp])

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data.type === 'MAP_FRAME_READY') {
          sendInitToFrame()
        }
        if (data.type === 'MAP_READY') {
          setMapReady(true)
          sendBasemapToIframe(basemap)
          postToFrame({ type: 'MAP_RESIZE' })
        }
        if (data.type === 'REGION_CHANGE') {
          if (typeof data.heading === 'number' && !Number.isNaN(data.heading)) setMapHeading(data.heading)
          setMapCenter(data.center)
          onRegionChangeRef.current?.(data.center, data.zoom)
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [basemap, sendBasemapToIframe, sendInitToFrame, postToFrame])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (mapReady) postToFrame({ type: 'MAP_RESIZE' })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapReady, postToFrame])

  useEffect(() => {
    if (!mapReady) return
    sendBasemapToIframe(basemap)
    const t1 = window.setTimeout(() => sendBasemapToIframe(basemap), 200)
    const t2 = window.setTimeout(() => sendBasemapToIframe(basemap), 600)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [basemap, mapReady, sendBasemapToIframe])

  useLayoutEffect(() => {
    if (!mapReady) return
    postToFrame({ type: 'APPLY_LOT_UI', payload: lotUiPayload })
  }, [lotUiPayload, mapReady, postToFrame])

  useEffect(() => {
    if (!mapReady || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({ type: 'FIT_POLYGON' }, '*')
  }, [fitPolygonToken, fitBump, mapReady])

  const hasPolygon = Boolean(polygon?.coordinates?.length || polygons?.length)
  const previewUri = buildBasemapPreviewUri(basemap, mapCenter)
  const nextBasemap = nextBasemapInSequence(basemap)

  if (!apiKey) {
    return (
      <div className={`google-map-view google-map-view--empty ${className}`}>
        <p>Set VITE_GOOGLE_MAPS_API_KEY in .env</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={`google-map-view ${className}`}>
      {active && apiKey ? (
        <iframe
          ref={iframeRef}
          key={`${polyCoordsKey}-${multiPolyCoordsKey}`}
          src={LOT_MAP_FRAME_URL}
          title="Lot GIS map"
          className="google-map-view__iframe"
          onLoad={() => setMapReady(false)}
        />
      ) : null}
      <div className="google-map-view__compass" style={{ top: MAP_COMPASS_CONTROL_TOP }}>
        <MapNorthCompassOverlay
          bearingDeg={mapHeading}
          onResetNorth={() => {
            iframeRef.current?.contentWindow?.postMessage({ type: 'RESET_NORTH' }, '*')
          }}
        />
      </div>
      {showControls ? (
        <div className="google-map-view__controls">
          {hasPolygon ? (
            <button
              type="button"
              className="google-map-view__fit-btn"
              onClick={() => setFitBump((n) => n + 1)}
              aria-label="Fit map to lot polygon"
            >
              <ScanLine size={20} />
            </button>
          ) : null}
          <button
            type="button"
            className="google-map-view__basemap-btn"
            onClick={() => setBasemap(nextBasemapInSequence(basemap))}
            aria-label={`Basemap ${basemap}. Tap to switch to ${nextBasemap}.`}
          >
            {previewUri ? (
              <img src={previewUri} alt="" className="google-map-view__basemap-preview" />
            ) : (
              <Layers size={24} color="#8e1616" />
            )}
            <span className="google-map-view__basemap-caption">
              {basemap.charAt(0).toUpperCase() + basemap.slice(1)}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
