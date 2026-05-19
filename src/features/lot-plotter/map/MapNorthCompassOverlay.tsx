import './MapNorthCompassOverlay.css'

export const MAP_COMPASS_CONTROL_TOP = 20

type Props = {
  bearingDeg: number
  onResetNorth?: () => void
}

export function MapNorthCompassOverlay({ bearingDeg, onResetNorth }: Props) {
  const h = Number.isFinite(bearingDeg) ? bearingDeg : 0
  return (
    <button
      type="button"
      className="map-compass-fab"
      onClick={() => onResetNorth?.()}
      aria-label="Compass. Tap to face north."
      title="Reset map to north"
    >
      <div className="map-compass-needle" style={{ transform: `rotate(${-h}deg)` }}>
        <div className="map-compass-needle-north" />
        <div className="map-compass-needle-south" />
      </div>
    </button>
  )
}
