export interface BoundaryPoint {
  id: string
  bearing: string
  distance: number
  segmentType?: 'line' | 'curve'
  curveRadius?: number
  curveDelta?: number
  curveChord?: number
  curveDirection?: 'L' | 'R'
  latitude?: number
  longitude?: number
  isTiePoint: boolean
}

export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}
