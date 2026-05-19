import {
  ArrowDownCircle,
  CheckCircle2,
  Eye,
  Hand,
  Layers,
  Pencil,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useTheme } from '@/theme/ThemeProvider'
import type { TiePoint } from '@/services/tiepoints.service'
import type { ParsedCorner, ScanReviewMeta, ScannedLot } from '@/lib/ocr/ocr-utils'
import { formatSurveyLegSheetLabel } from '@/lib/survey/survey-leg-label'

import './ScanReviewModal.css'

export type ScanReviewModalProps = {
  visible: boolean
  lots: ScannedLot[]
  meta: ScanReviewMeta | null
  catalogMatch?: TiePoint | null
  onDismiss: () => void
  onApply: (lots: ScannedLot[]) => void
}

type DraftRow = ParsedCorner & { key: string }

function useWindowWidth() {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800))
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

function formatBearing(c: ParsedCorner): string {
  const d = (c.deg || '').padStart(2, '0')
  const m = (c.min || '').padStart(2, '0')
  return `${c.ns} ${d}° ${m}' ${c.ew}`
}

function lotChipLabel(lot: ScannedLot, index: number): string {
  if (lot.lotNo?.trim()) return `Lot ${lot.lotNo.trim()}`
  return `Lot ${index + 1}`
}

function validateCornerRow(row: ParsedCorner): string | null {
  const ns = (row.ns || '').trim().toUpperCase()
  const ew = (row.ew || '').trim().toUpperCase()
  const degRaw = (row.deg || '').trim()
  const minRaw = (row.min || '').trim()
  const distRaw = (row.distance || '').trim()

  if (!['N', 'S'].includes(ns)) return 'NS must be N or S'
  if (!['E', 'W'].includes(ew)) return 'EW must be E or W'
  if (!/^\d+$/.test(degRaw)) return 'Degree is missing/invalid'
  if (!/^\d+$/.test(minRaw)) return 'Minute is missing/invalid'

  const deg = Number(degRaw)
  const min = Number(minRaw)
  if (deg < 0 || deg > 89) return 'Degree must be 0-89'
  if (min < 0 || min > 59) return 'Minute must be 0-59'

  if (!/^\d+(\.\d+)?$/.test(distRaw)) return 'Distance is missing/invalid'
  const dist = Number(distRaw)
  if (!Number.isFinite(dist) || dist <= 0) return 'Distance must be > 0'

  return null
}

export function ScanReviewModal({
  visible,
  lots,
  meta,
  catalogMatch = null,
  onDismiss,
  onApply,
}: ScanReviewModalProps) {
  const windowWidth = useWindowWidth()
  const { colors } = useTheme()
  const [drafts, setDrafts] = useState<DraftRow[][]>([])
  const [selectedLotIdx, setSelectedLotIdx] = useState(0)
  const [isEditing, setIsEditing] = useState(false)

  const compact = windowWidth < 400
  const maxContentWidth = Math.min(560, windowWidth)

  const draft = drafts[selectedLotIdx] ?? []
  const selectedLotRowErrors = useMemo(() => {
    const rows = drafts[selectedLotIdx] ?? []
    return rows.map((row) => validateCornerRow(row))
  }, [drafts, selectedLotIdx])

  const validationIssues = useMemo(() => {
    const issues: string[] = []
    drafts.forEach((rows, lotIdx) => {
      if (!rows || rows.length < 3) {
        issues.push(`${lotChipLabel(lots[lotIdx] || { corners: [] }, lotIdx)}: needs at least 3 lines.`)
        return
      }
      rows.forEach((row, rowIdx) => {
        const err = validateCornerRow(row)
        if (err) {
          issues.push(
            `${lotChipLabel(lots[lotIdx] || { corners: [] }, lotIdx)} · ${formatSurveyLegSheetLabel(
              rowIdx + 1,
              row.sheetLineLabel
            )}: ${err}.`
          )
        }
      })
    })
    return issues
  }, [drafts, lots])

  const firstInvalid = useMemo(() => {
    for (let lotIdx = 0; lotIdx < drafts.length; lotIdx++) {
      const rows = drafts[lotIdx] || []
      if (rows.length < 3) {
        return {
          lotIdx,
          rowIdx: 0,
          message: `${lotChipLabel(lots[lotIdx] || { corners: [] }, lotIdx)}: needs at least 3 lines.`,
        }
      }
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const err = validateCornerRow(rows[rowIdx])
        if (err) {
          return {
            lotIdx,
            rowIdx,
            message: `${lotChipLabel(lots[lotIdx] || { corners: [] }, lotIdx)} · ${formatSurveyLegSheetLabel(
              rowIdx + 1,
              rows[rowIdx]?.sheetLineLabel
            )}: ${err}.`,
          }
        }
      }
    }
    return null
  }, [drafts, lots])

  const canApply = validationIssues.length === 0

  useEffect(() => {
    if (visible && lots.length > 0) {
      setDrafts(
        lots.map((lot) =>
          lot.corners.map((c, i) => ({
            ...c,
            key: `scan-${i}-${c.ns}-${c.deg}-${c.min}-${c.ew}-${c.distance}`,
          }))
        )
      )
      setSelectedLotIdx(0)
      setIsEditing(false)
    }
  }, [visible, lots])

  const scanHint = useMemo(() => {
    if (!meta) return null
    if (meta.extractionPath === 'tesseract') return 'Classic OCR — verify against your document'
    return 'AI-assisted scan — verify against your document'
  }, [meta])

  const updateRow = (key: string, patch: Partial<ParsedCorner>) => {
    setDrafts((prev) => {
      if (!prev[selectedLotIdx]) return prev
      const next = [...prev]
      next[selectedLotIdx] = next[selectedLotIdx].map((r) => (r.key === key ? { ...r, ...patch } : r))
      return next
    })
  }

  const handleApply = () => {
    if (!canApply) return
    const out: ScannedLot[] = drafts.map((rows, i) => ({
      lotNo: lots[i]?.lotNo ?? null,
      claimant: lots[i]?.claimant ?? null,
      corners: rows.map(({ ns, deg, min, ew, distance, sheetLineLabel }) => ({
        ns,
        deg,
        min,
        ew,
        distance,
        sheetLineLabel,
      })),
    }))
    onApply(out)
    onDismiss()
  }

  const lineLabel = (idx: number) => formatSurveyLegSheetLabel(idx + 1, draft[idx]?.sheetLineLabel)

  if (!visible) return null

  const contentStyle = { maxWidth: maxContentWidth }
  const footerPad = { paddingBottom: 14 }

  return (
    <div className="scan-review-modal" role="dialog" aria-modal="true" aria-label="Review scan">
      <div className="scan-review-modal__root" style={{ backgroundColor: colors.contentBg }}>
        <header className="scan-review-modal__header" style={{ borderBottomColor: colors.border, backgroundColor: colors.cardBg }}>
          <div className="scan-review-modal__header-inner" style={contentStyle}>
            <div className="scan-review-modal__header-text-block">
              <h2 className="scan-review-modal__title" style={{ color: colors.text }}>
                Review scan
              </h2>
              {scanHint ? (
                <p className="scan-review-modal__sub-source" style={{ color: colors.textMuted }}>
                  {scanHint}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="scan-review-modal__icon-btn"
              onClick={onDismiss}
              aria-label="Close without applying"
            >
              <X size={28} color={colors.text} />
            </button>
          </div>
        </header>

        <div className="scan-review-modal__list">
          <div className="scan-review-modal__list-content" style={contentStyle}>
            {meta?.warnings && meta.warnings.length > 0 ? (
              <div
                className="scan-review-modal__warn-box"
                style={{ backgroundColor: colors.cardBg, borderColor: colors.border }}
              >
                {meta.warnings.map((w, i) => (
                  <div key={i} className="scan-review-modal__warn-bullet-row">
                    <span className="scan-review-modal__warn-bullet" style={{ color: colors.primary }}>
                      •
                    </span>
                    <span className="scan-review-modal__warn-text" style={{ color: colors.text }}>
                      {w}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {validationIssues.length > 0 ? (
              <div
                className="scan-review-modal__warn-box scan-review-modal__warn-box--validation"
                style={{ backgroundColor: colors.cardBg, borderColor: colors.warning }}
              >
                <div className="scan-review-modal__warn-bullet-row">
                  <span className="scan-review-modal__warn-bullet" style={{ color: colors.warning }}>
                    !
                  </span>
                  <span
                    className="scan-review-modal__warn-text scan-review-modal__warn-text--bold"
                    style={{ color: colors.text }}
                  >
                    Fix these issues before tapping OK.
                  </span>
                </div>
                {validationIssues.map((w, i) => (
                  <div key={`v-${i}`} className="scan-review-modal__warn-bullet-row">
                    <span className="scan-review-modal__warn-bullet" style={{ color: colors.warning }}>
                      •
                    </span>
                    <span className="scan-review-modal__warn-text" style={{ color: colors.text }}>
                      {w}
                    </span>
                  </div>
                ))}
                {firstInvalid ? (
                  <button
                    type="button"
                    className="scan-review-modal__jump-invalid-btn"
                    style={{ borderColor: colors.warning, backgroundColor: colors.contentBg, color: colors.text }}
                    onClick={() => {
                      setSelectedLotIdx(firstInvalid.lotIdx)
                      setIsEditing(true)
                    }}
                  >
                    <ArrowDownCircle size={18} color={colors.warning} />
                    <span className="scan-review-modal__jump-invalid-btn-text">
                      Jump to first invalid line ({lotChipLabel(lots[firstInvalid.lotIdx] || { corners: [] }, firstInvalid.lotIdx)} ·{' '}
                      {formatSurveyLegSheetLabel(
                        firstInvalid.rowIdx + 1,
                        drafts[firstInvalid.lotIdx]?.[firstInvalid.rowIdx]?.sheetLineLabel
                      )}
                      )
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {lots.length > 1 ? (
              <div
                className="scan-review-modal__multi-lot-banner"
                style={{ backgroundColor: colors.contentBg, borderColor: colors.primary }}
              >
                <Layers size={22} color={colors.primary} style={{ flexShrink: 0 }} />
                <p className="scan-review-modal__multi-lot-banner-text" style={{ color: colors.text }}>
                  {lots.length} lots in this image. Pick a tab below — row 1 is always{' '}
                  <strong>MON → corner 1</strong>; sheet LINE 1-2 starts at row 2.
                </p>
              </div>
            ) : null}

            {lots.length > 1 ? (
              <div className="scan-review-modal__lot-chip-scroll">
                <div className="scan-review-modal__lot-chip-row">
                  {lots.map((lot, i) => (
                    <button
                      key={`lot-tab-${i}-${lot.lotNo ?? ''}`}
                      type="button"
                      className="scan-review-modal__lot-chip"
                      style={{
                        borderColor: selectedLotIdx === i ? colors.primary : colors.border,
                        backgroundColor: selectedLotIdx === i ? colors.contentBg : colors.cardBg,
                      }}
                      onClick={() => setSelectedLotIdx(i)}
                    >
                      <span
                        className={`scan-review-modal__lot-chip-text${selectedLotIdx === i ? ' scan-review-modal__lot-chip-text--active' : ''}`}
                        style={{ color: selectedLotIdx === i ? colors.primary : colors.text }}
                      >
                        {lotChipLabel(lot, i)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {meta?.tiePointReference ? (
              <div
                className="scan-review-modal__tie-doc-box"
                style={{ backgroundColor: colors.cardBg, borderColor: colors.border }}
              >
                <p className="scan-review-modal__tie-doc-title" style={{ color: colors.textMuted }}>
                  Tie point (from document)
                </p>
                <p className="scan-review-modal__tie-doc-value" style={{ color: colors.text }}>
                  {meta.tiePointReference}
                </p>
                <p className="scan-review-modal__tie-doc-hint" style={{ color: colors.textMuted }}>
                  Row 1 = that monument to corner 1. Row 2 matches the first value under LINE 1-2 on the sheet (not “line 1”
                  there—the sheet’s LINE 1-2 starts after MON. TO CORNER 1).
                </p>
              </div>
            ) : null}

            {catalogMatch ? (
              <div
                className="scan-review-modal__catalog-match-box"
                style={{ backgroundColor: colors.cardBg, borderColor: colors.success }}
              >
                <CheckCircle2 size={26} color={colors.success} className="scan-review-modal__catalog-match-icon" />
                <div className="scan-review-modal__catalog-match-text-col">
                  <p className="scan-review-modal__catalog-match-title" style={{ color: colors.text }}>
                    Catalog tie found
                  </p>
                  <p className="scan-review-modal__catalog-match-name" style={{ color: colors.text }}>
                    {catalogMatch.name}
                  </p>
                  <p className="scan-review-modal__catalog-match-loc" style={{ color: colors.textMuted }}>
                    {catalogMatch.province} · {catalogMatch.municipality}
                  </p>
                  <p className="scan-review-modal__catalog-match-hint" style={{ color: colors.textMuted }}>
                    Province, municipality, and this tie point will be set when you tap OK.
                  </p>
                </div>
              </div>
            ) : meta?.tiePointReference ? (
              <div
                className="scan-review-modal__catalog-miss-box"
                style={{ backgroundColor: colors.cardBg, borderColor: colors.warning }}
              >
                <Hand size={22} color={colors.warning} className="scan-review-modal__catalog-match-icon" />
                <div className="scan-review-modal__catalog-match-text-col">
                  <p className="scan-review-modal__catalog-match-title" style={{ color: colors.text }}>
                    No automatic map tie
                  </p>
                  <p className="scan-review-modal__catalog-match-hint" style={{ color: colors.textMuted }}>
                    The document tie did not match a row in the catalog. After OK, choose Province / Municipality / Tie Point
                    manually.
                  </p>
                </div>
              </div>
            ) : null}

            {isEditing ? (
              <div
                className="scan-review-modal__edit-mode-banner"
                style={{ backgroundColor: colors.contentBg, borderColor: colors.primary }}
              >
                <SlidersHorizontal size={20} color={colors.primary} style={{ flexShrink: 0 }} />
                <div className="scan-review-modal__edit-mode-banner-text">
                  <p className="scan-review-modal__edit-mode-banner-title" style={{ color: colors.text }}>
                    Editing traverse lines
                  </p>
                  <p className="scan-review-modal__edit-mode-banner-sub" style={{ color: colors.textMuted }}>
                    Fields shrink on narrow screens. LOT DESCRIPTIONS: row 1 is MON→C1 only; LINE 1-2 begins at row 2.
                  </p>
                </div>
              </div>
            ) : null}

            {draft.map((row, idx) => (
              <div
                key={row.key}
                className={`scan-review-modal__row-card${isEditing ? ' scan-review-modal__row-card--editing' : ''}${selectedLotRowErrors[idx] ? ' scan-review-modal__row-card--invalid' : ''}`}
                style={{
                  backgroundColor: colors.cardBg,
                  borderColor: selectedLotRowErrors[idx] ? colors.warning : colors.border,
                  borderLeftColor: isEditing ? colors.primary : undefined,
                }}
              >
                <p className="scan-review-modal__line-badge" style={{ color: colors.textMuted }}>
                  {lineLabel(idx)}
                </p>
                {selectedLotRowErrors[idx] ? (
                  <p className="scan-review-modal__inline-error-text" style={{ color: colors.warning }}>
                    {selectedLotRowErrors[idx]}
                  </p>
                ) : null}

                {!isEditing ? (
                  <div className="scan-review-modal__preview-row">
                    <span className="scan-review-modal__bearing-preview" style={{ color: colors.text }}>
                      {formatBearing(row)}
                    </span>
                    <div
                      className="scan-review-modal__dist-pill"
                      style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
                    >
                      <span className="scan-review-modal__dist-pill-label" style={{ color: colors.textMuted }}>
                        m
                      </span>
                      <span className="scan-review-modal__dist-pill-value" style={{ color: colors.text }}>
                        {row.distance}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`scan-review-modal__edit-wrap${compact ? ' scan-review-modal__edit-wrap--stack' : ''}`}>
                    <div className="scan-review-modal__edit-cluster scan-review-modal__edit-cluster--ns-ew">
                      <span className="scan-review-modal__micro-label" style={{ color: colors.textMuted }}>
                        NS
                      </span>
                      <div className="scan-review-modal__toggle" style={{ backgroundColor: colors.contentBg }}>
                        {(['N', 'S'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="scan-review-modal__toggle-btn"
                            style={{
                              borderColor: row.ns === v ? colors.primary : colors.border,
                              backgroundColor: row.ns === v ? colors.primary : 'transparent',
                            }}
                            onClick={() => updateRow(row.key, { ns: v })}
                          >
                            <span
                              className={`scan-review-modal__toggle-txt${row.ns === v ? ' scan-review-modal__toggle-txt--active' : ''}`}
                              style={{ color: row.ns === v ? '#fff' : colors.text }}
                            >
                              {v}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="scan-review-modal__edit-cluster">
                      <span className="scan-review-modal__micro-label" style={{ color: colors.textMuted }}>
                        °
                      </span>
                      <input
                        className="scan-review-modal__input-shrink"
                        style={{
                          backgroundColor: colors.contentBg,
                          color: colors.text,
                          borderColor: colors.border,
                        }}
                        value={row.deg}
                        onChange={(e) => updateRow(row.key, { deg: e.target.value.replace(/[^0-9]/g, '') })}
                        inputMode="numeric"
                        maxLength={3}
                        placeholder="0"
                      />
                    </div>

                    <div className="scan-review-modal__edit-cluster">
                      <span className="scan-review-modal__micro-label" style={{ color: colors.textMuted }}>
                        ′
                      </span>
                      <input
                        className="scan-review-modal__input-shrink"
                        style={{
                          backgroundColor: colors.contentBg,
                          color: colors.text,
                          borderColor: colors.border,
                        }}
                        value={row.min}
                        onChange={(e) => updateRow(row.key, { min: e.target.value.replace(/[^0-9]/g, '') })}
                        inputMode="numeric"
                        maxLength={2}
                        placeholder="0"
                      />
                    </div>

                    <div className="scan-review-modal__edit-cluster scan-review-modal__edit-cluster--ns-ew">
                      <span className="scan-review-modal__micro-label" style={{ color: colors.textMuted }}>
                        EW
                      </span>
                      <div className="scan-review-modal__toggle" style={{ backgroundColor: colors.contentBg }}>
                        {(['E', 'W'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="scan-review-modal__toggle-btn"
                            style={{
                              borderColor: row.ew === v ? colors.primary : colors.border,
                              backgroundColor: row.ew === v ? colors.primary : 'transparent',
                            }}
                            onClick={() => updateRow(row.key, { ew: v })}
                          >
                            <span
                              className={`scan-review-modal__toggle-txt${row.ew === v ? ' scan-review-modal__toggle-txt--active' : ''}`}
                              style={{ color: row.ew === v ? '#fff' : colors.text }}
                            >
                              {v}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="scan-review-modal__edit-cluster scan-review-modal__edit-cluster--grow">
                      <span className="scan-review-modal__micro-label" style={{ color: colors.textMuted }}>
                        Distance (m)
                      </span>
                      <input
                        className="scan-review-modal__input-grow"
                        style={{
                          backgroundColor: colors.contentBg,
                          color: colors.text,
                          borderColor: colors.border,
                        }}
                        value={row.distance}
                        onChange={(e) => updateRow(row.key, { distance: e.target.value.replace(/[^0-9.]/g, '') })}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <footer
          className="scan-review-modal__footer"
          style={{ borderTopColor: colors.border, backgroundColor: colors.cardBg, ...footerPad }}
        >
          <div
            className={`scan-review-modal__footer-row${compact ? ' scan-review-modal__footer-row--stack' : ''}`}
            style={contentStyle}
          >
            <div className={`scan-review-modal__footer-actions-row${compact ? ' scan-review-modal__footer-actions-row--stack' : ''}`}>
              <button
                type="button"
                className="scan-review-modal__btn-secondary"
                style={{ borderColor: colors.border, backgroundColor: colors.contentBg, color: colors.text }}
                onClick={onDismiss}
              >
                Cancel
              </button>
              <button
                type="button"
                className="scan-review-modal__btn-secondary"
                style={{ borderColor: colors.border, backgroundColor: colors.contentBg, color: colors.text }}
                onClick={() => setIsEditing((e) => !e)}
              >
                {isEditing ? <Eye size={18} /> : <Pencil size={18} />}
                <span style={{ marginLeft: 6 }}>{isEditing ? 'Preview' : 'Edit'}</span>
              </button>
            </div>
            <button
              type="button"
              className={`scan-review-modal__btn-primary${compact ? ' scan-review-modal__btn-primary--full' : ''}${!canApply ? ' scan-review-modal__btn-disabled' : ''}`}
              style={{ backgroundColor: colors.primary }}
              onClick={handleApply}
              disabled={!canApply}
            >
              OK — use values
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
