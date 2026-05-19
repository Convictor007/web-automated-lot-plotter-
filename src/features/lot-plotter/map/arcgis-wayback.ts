/** Esri World Imagery Wayback release IDs (ArcGIS tile service). */
export interface WaybackRelease {
  id: string
  date: string
}

/** Curated releases — same set as iAssess historical compare (newest first). */
export const WAYBACK_RELEASES: WaybackRelease[] = [
  { id: '27982', date: '2025-04-24' },
  { id: '12428', date: '2024-06-06' },
  { id: '47963', date: '2023-06-29' },
  { id: '45441', date: '2022-08-31' },
  { id: '13534', date: '2021-06-30' },
  { id: '11135', date: '2020-06-10' },
  { id: '645', date: '2019-06-26' },
  { id: '11334', date: '2018-06-27' },
  { id: '10', date: '2014-02-20' },
]

export const WAYBACK_TILE_URL =
  'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{releaseId}/{level}/{row}/{col}'

export function waybackTileUrl(releaseId: string): string {
  return WAYBACK_TILE_URL.replace('{releaseId}', releaseId)
}
