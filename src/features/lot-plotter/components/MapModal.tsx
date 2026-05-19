import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, X, ArrowLeftRight, Map as MapIcon } from 'lucide-react'
import GoogleMapView, { type MapCenterLabel, type MapSegmentEdge } from '../map/GoogleMapView'
import CompareBasemapMap from '../map/CompareBasemapMap'
import { DEFAULT_POLYGON_COLOR } from '../map/map-settings'
import { useMapSettings } from '../map/useMapSettings'
import './MapModal.css'

const COLORS = {
  accent: '#3b5998',
  text: '#ffffff',
  background: '#2c2c2c',
}

const POLYGON_COLORS = [
  '#facc15',
  '#3b5998',
  '#2563eb',
  '#16a34a',
  '#ef4444',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0d9488',
  '#ca8a04',
  '#4f46e5',
  '#db2777',
]

interface MapModalProps {
  visible: boolean
  onClose: () => void
  center: { lat: number; lng: number }
  zoom?: number
  polygon?: {
    coordinates: [number, number][]
    color?: string
    fillColor?: string
    segmentEdges?: MapSegmentEdge[]
    centerLabel?: MapCenterLabel
  } | null
  polygons?: Array<{
    coordinates: [number, number][]
    color?: string
    fillColor?: string
    segmentEdges?: MapSegmentEdge[]
    centerLabel?: MapCenterLabel
  }> | null
  area?: number
}

export default function MapModal({
  visible,
  onClose,
  center,
  zoom = 17,
  polygon,
  polygons,
  area,
}: MapModalProps) {
  const {
    showAreaLabel,
    showDistanceLabels,
    polygonColor,
    onToggleAreaLabel,
    onToggleDistanceLabels,
    onPolygonColorChange,
  } = useMapSettings({
    visible,
    polygonColorFromProp: polygon?.color ?? DEFAULT_POLYGON_COLOR,
  })

  const [showSettings, setShowSettings] = useState(false)
  const [isCompareMode, setIsCompareMode] = useState(false)

  const latestCenterRef = useRef(center)
  const latestZoomRef = useRef(zoom)

  useEffect(() => {
    if (visible) {
      latestCenterRef.current = center
      latestZoomRef.current = zoom
    } else {
      setShowSettings(false)
      setIsCompareMode(false)
    }
  }, [visible, center, zoom])

  const mapPolygon = useMemo(
    () =>
      polygon
        ? {
            coordinates: polygon.coordinates,
            color: polygonColor,
            fillColor: polygonColor,
            segmentEdges: polygon.segmentEdges,
            centerLabel: polygon.centerLabel,
          }
        : null,
    [polygon, polygonColor]
  )

  const mapPolygons = useMemo(
    () =>
      polygons?.map((p) => ({
        coordinates: p.coordinates,
        color: p.color || polygonColor,
        fillColor: p.fillColor || p.color || polygonColor,
        segmentEdges: p.segmentEdges,
        centerLabel: p.centerLabel,
      })) || null,
    [polygons, polygonColor]
  )

  const hasMultiPolygons = Boolean(polygons && polygons.length > 0)

  const handleRegionChange = (c: { lat: number; lng: number }, z: number) => {
    latestCenterRef.current = c
    latestZoomRef.current = z
  }

  if (!visible) return null

  return (
    <div className="map-modal-overlay" role="dialog" aria-modal="true" aria-label="Lot Plot GIS Map">
      <div className="map-modal">
        <header className="map-modal__header">
          <div className="map-modal__header-left">
            <button type="button" className="map-modal__icon-btn" onClick={() => setShowSettings(!showSettings)}>
              <Menu size={24} color={COLORS.text} />
            </button>
            <span className="map-modal__title">Lot Plot - GIS Map</span>
            {!hasMultiPolygons ? (
              <button
                type="button"
                className="map-modal__compare-btn"
                onClick={() => setIsCompareMode(!isCompareMode)}
              >
                {isCompareMode ? <MapIcon size={18} /> : <ArrowLeftRight size={18} />}
                <span>{isCompareMode ? 'View Normal Map' : 'Historical Compare'}</span>
              </button>
            ) : null}
          </div>
          <button type="button" className="map-modal__icon-btn" onClick={onClose} aria-label="Close map">
            <X size={28} color={COLORS.text} />
          </button>
        </header>

        {showSettings ? (
          <div className="map-modal__settings">
            <h3 className="map-modal__settings-title">Map Settings</h3>
            <label className="map-modal__setting-row">
              <input type="checkbox" checked={showAreaLabel} onChange={onToggleAreaLabel} />
              <span>Display Area Label (sqm)</span>
            </label>
            <label className="map-modal__setting-row">
              <input type="checkbox" checked={showDistanceLabels} onChange={onToggleDistanceLabels} />
              <span>Display Distance Labels</span>
            </label>
            <p className="map-modal__setting-subtitle">Polygon color</p>
            <p className="map-modal__setting-hint">
              Polygon color applies to the lot boundary only. Distance and area labels are white.
            </p>
            <div className="map-modal__color-row">
              {POLYGON_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`map-modal__color-box${polygonColor.toLowerCase() === c.toLowerCase() ? ' map-modal__color-box--selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => onPolygonColorChange(c)}
                  aria-label={`Polygon color ${c}`}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="map-modal__map-wrap">
          <div className="map-modal__map-capture">
            {isCompareMode && !hasMultiPolygons ? (
              <CompareBasemapMap
                center={latestCenterRef.current}
                zoom={latestZoomRef.current}
                polygon={mapPolygon}
                area={area}
                mapSettings={{
                  showAreaLabel,
                  showDistanceLabels,
                  polygonColor,
                }}
                onRegionChange={handleRegionChange}
              />
            ) : (
              <GoogleMapView
                active={visible}
                center={latestCenterRef.current}
                zoom={latestZoomRef.current}
                polygon={mapPolygon}
                polygons={mapPolygons}
                basemap="satellite"
                mapSettings={{
                  showAreaLabel,
                  showDistanceLabels,
                  polygonColor,
                }}
                area={area}
                onRegionChange={handleRegionChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
