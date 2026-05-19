/** Cadastral-style map labels (along edges + centered area block). */

export interface MapSegmentEdge {
  /** Survey line id e.g. "1-2" */
  lineId?: string
  /** e.g. "S 66° 50' E" */
  bearing: string
  distanceM: number
}

export interface MapCenterLabel {
  areaSqm: number
  lotNo?: string | null
  claimant?: string | null
}

export function formatDistanceLine(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return '0.00 m.'
  return `${distanceM.toFixed(2)} m.`
}

export function formatAreaCadastral(areaSqm: number): string {
  if (!Number.isFinite(areaSqm)) return 'A=0 Sq.m.'
  const rounded = areaSqm >= 100 ? areaSqm.toFixed(1) : areaSqm.toFixed(3)
  return `A=${rounded} Sq.m.`
}

export function buildCenterLabelLines(center: MapCenterLabel, includeArea: boolean): string[] {
  const lines: string[] = []
  const lot = center.lotNo?.trim()
  if (lot) lines.push(lot.startsWith('LOT') ? lot : `LOT ${lot}`)
  if (includeArea) lines.push(formatAreaCadastral(center.areaSqm))
  const claimant = center.claimant?.trim()
  if (claimant) lines.push(claimant.toUpperCase())
  return lines
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildCenterLabelHtml(
  center: MapCenterLabel,
  labelColor: string,
  includeArea: boolean
): string {
  const lines = buildCenterLabelLines(center, includeArea)
  if (!lines.length) return ''
  const body = lines
    .map(
      (line) =>
        `<div style="display:block;font-size:${line.startsWith('A=') ? '12px' : '10px'};font-weight:700">${escapeHtml(line)}</div>`
    )
    .join('')
  return `<div style="text-align:center;color:${labelColor};font-family:system-ui,sans-serif;line-height:1.35;padding:4px 6px;background:rgba(0,0,0,0.55);border-radius:4px">${body}</div>`
}
