/** GIS Lot Plotter — web port. CSV format: NS | Deg | Min | EW | Distance */

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Crop,
  FileText,
  Grid3x3,
  Images,
  Maximize2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import MapModal from '@/features/lot-plotter/components/MapModal'
import type { MapCenterLabel, MapSegmentEdge } from '@/features/lot-plotter/map/GoogleMapView'
import { ScanReviewModal } from '@/features/lot-plotter/components/ScanReviewModal'
import { LoadingOverlay } from '@/components/loading'
import { Notification, useNotification } from '@/components/notification'
import tiepointsService, {
  findBestTiePointMatch,
  loadTiePointsCatalog,
  type TiePoint,
} from '@/services/tiepoints.service'
import { parseLotCsvFile } from '@/lib/import/csv-utils'
import gisUtils, { DEFAULT_PLOT_TRAVERSE_GRID, formatTraverseGridLabel } from '@/lib/gis/gis-utils'
import {
  isLotExportable,
  shareLotCsv,
  shareLotPdf,
  type LotCornerRow,
  type LotPolygonExport,
  type LotTieContext,
} from '@/lib/export/lot-export'
import { prepareScanImageFile } from '@/lib/ocr/prepare-scan-image'
import { scanLandTitleImage, type ScanReviewMeta, type ScannedLot } from '@/lib/ocr/ocr-utils'
import { formatSurveyLegSheetLabel } from '@/lib/survey/survey-leg-label'
import { useTheme } from '@/theme/ThemeProvider'

import './LotPlotterPage.css'

const DEFAULT_PROVINCE = 'CAMARINES SUR'
const DEFAULT_MUNICIPALITY = 'BALATAN'
const GIS_POLYGON_YELLOW = '#facc15'

interface Corner {
  id: string
  line: number
  sheetLineLabel?: string
  segmentType?: 'line' | 'curve'
  curveRadius?: string
  curveDelta?: string
  curveChord?: string
  curveDirection?: 'L' | 'R'
  ns: string
  deg: string
  min: string
  sec?: string
  ew: string
  distance: string
}

interface ImportedLotSlot {
  id: string
  lotNo: string | null
  claimant: string | null
  corners: Corner[]
}

interface PolygonState {
  coordinates: [number, number][]
  area: number
  perimeter: number
  isValid: boolean
  closureError: number
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800))
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

export default function LotPlotterPage() {
  const { colors, isDarkMode } = useTheme()
  const viewportWidth = useViewportWidth()

  const csvInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [tiePoints, setTiePoints] = useState<TiePoint[]>([])
  const [selectedProvince, setSelectedProvince] = useState(DEFAULT_PROVINCE)
  const [selectedMunicipality, setSelectedMunicipality] = useState(DEFAULT_MUNICIPALITY)
  const [provinces, setProvinces] = useState<string[]>([])
  const [municipalities, setMunicipalities] = useState<string[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [selectedTiePoint, setSelectedTiePoint] = useState<TiePoint | null>(null)
  const [pickerMode, setPickerMode] = useState<'province' | 'municipality' | 'tiepoint' | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [csvFile, setCsvFile] = useState<string | null>(null)
  const [csvSectionExpanded, setCsvSectionExpanded] = useState(true)
  const [scanModalVisible, setScanModalVisible] = useState(false)
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportLoadingMessage, setExportLoadingMessage] = useState('Exporting…')
  const [scanReviewVisible, setScanReviewVisible] = useState(false)
  const [reviewLots, setReviewLots] = useState<ScannedLot[]>([])
  const [reviewMeta, setReviewMeta] = useState<ScanReviewMeta | null>(null)
  const [importedLots, setImportedLots] = useState<ImportedLotSlot[] | null>(null)
  const [activeImportedLotIndex, setActiveImportedLotIndex] = useState(0)
  const [pendingScanLabel, setPendingScanLabel] = useState<string | null>(null)
  const [isOcrProcessing, setIsOcrProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatusHint, setOcrStatusHint] = useState<string | null>(null)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null)
  const [pendingImageSource, setPendingImageSource] = useState<'camera' | 'gallery' | null>(null)
  const [documentTieFromScan, setDocumentTieFromScan] = useState<string | null>(null)
  const [autoTieMatchHint, setAutoTieMatchHint] = useState<string | null>(null)
  const [reviewCatalogMatch, setReviewCatalogMatch] = useState<TiePoint | null>(null)
  const ocrAbortRef = useRef<AbortController | null>(null)
  const ocrProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [corners, setCorners] = useState<Corner[]>([])
  const [bearingCorrection, setBearingCorrection] = useState('0')
  const [polygon, setPolygon] = useState<PolygonState | null>(null)
  const [center, setCenter] = useState({ lat: 13.3155, lng: 123.2328 })
  const [showMap, setShowMap] = useState(false)
  const [showAllMap, setShowAllMap] = useState(false)
  const { notification, show, dismiss: dismissNotification } = useNotification()

  const refreshTiePointsForLocation = useCallback((province: string, municipality: string) => {
    const tps = tiepointsService.getTiePointsByLocation(province, municipality)
    setTiePoints(tps)
    if (tps.length > 0) {
      setSelectedTiePoint(tps[0])
      setCenter({ lat: tps[0].lat, lng: tps[0].lon })
    } else {
      setSelectedTiePoint(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    loadTiePointsCatalog()
      .then(() => {
        if (cancelled) return
        const provList = tiepointsService.getProvinces()
        setProvinces(provList)
        const province = provList.includes(DEFAULT_PROVINCE) ? DEFAULT_PROVINCE : provList[0] || DEFAULT_PROVINCE
        setSelectedProvince(province)
        const munList = tiepointsService.getMunicipalities(province)
        setMunicipalities(munList)
        const municipality = munList.includes(DEFAULT_MUNICIPALITY) ? DEFAULT_MUNICIPALITY : munList[0] || DEFAULT_MUNICIPALITY
        setSelectedMunicipality(municipality)
        refreshTiePointsForLocation(province, municipality)
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshTiePointsForLocation])

  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    }
  }, [pendingImagePreviewUrl])

  const handleProvinceSelect = (province: string) => {
    setSelectedProvince(province)
    setPickerMode(null)
    setPickerSearch('')
    const munList = tiepointsService.getMunicipalities(province)
    setMunicipalities(munList)
    const municipality = munList[0] || ''
    setSelectedMunicipality(municipality)
    if (municipality) refreshTiePointsForLocation(province, municipality)
    else {
      setTiePoints([])
      setSelectedTiePoint(null)
    }
  }

  const handleMunicipalitySelect = (municipality: string) => {
    setSelectedMunicipality(municipality)
    setPickerMode(null)
    setPickerSearch('')
    refreshTiePointsForLocation(selectedProvince, municipality)
  }

  const handleTiePointSelect = (tiePoint: TiePoint) => {
    setSelectedTiePoint(tiePoint)
    setPickerMode(null)
    setPickerSearch('')
    setCenter({ lat: tiePoint.lat, lng: tiePoint.lon })
  }

  const openProvincePicker = () => {
    setPickerSearch('')
    setPickerMode('province')
  }

  const openMunicipalityPicker = () => {
    setPickerSearch('')
    setPickerMode('municipality')
  }

  const openTiePointPicker = () => {
    setPickerSearch('')
    setPickerMode('tiepoint')
  }

  const closePicker = () => {
    setPickerMode(null)
    setPickerSearch('')
  }

  const filteredProvinces = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return provinces
    return provinces.filter((p) => p.toLowerCase().includes(q))
  }, [provinces, pickerSearch])

  const filteredMunicipalities = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return municipalities
    return municipalities.filter((m) => m.toLowerCase().includes(q))
  }, [municipalities, pickerSearch])

  const filteredTiePoints = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return tiePoints
    return tiePoints.filter(
      (tp) =>
        tp.name.toLowerCase().includes(q) ||
        String(tp.zone).includes(q) ||
        String(tp.x).includes(q) ||
        String(tp.y).includes(q)
    )
  }, [tiePoints, pickerSearch])

  const formatBearing = (ns: string, deg: string, min: string, ew: string, sec?: string): string => {
    const d = deg.padStart(2, '0')
    const m = min.padStart(2, '0')
    const s = (sec || '').trim()
    if (s) return `${ns} ${d}° ${m}' ${s}" ${ew}`
    return `${ns} ${d}° ${m}' ${ew}`
  }

  const generatePolygon = (cornerPoints: Corner[], tieForComputation?: TiePoint | null) => {
    if (cornerPoints.length < 3) {
      setPolygon(null)
      return
    }

    const tp = tieForComputation ?? selectedTiePoint
    const originLat = tp != null ? tp.lat : center.lat
    const originLng = tp != null ? tp.lon : center.lng
    const correction = Number.isFinite(parseFloat(bearingCorrection)) ? parseFloat(bearingCorrection) : 0

    try {
      const boundaries = cornerPoints.map((corner) => ({
        id: corner.id,
        bearing: formatBearing(corner.ns, corner.deg, corner.min, corner.ew, corner.sec),
        distance: parseFloat(corner.distance) || 0,
        segmentType: corner.segmentType ?? 'line',
        curveRadius: parseFloat(corner.curveRadius || '') || undefined,
        curveDelta: parseFloat(corner.curveDelta || '') || undefined,
        curveChord: parseFloat(corner.curveChord || '') || undefined,
        curveDirection: corner.curveDirection,
        isTiePoint: corner.line === 1,
      }))

      const coordinates = gisUtils.generateLotPolygonFromTraverse(
        originLat,
        originLng,
        boundaries,
        tp?.x,
        tp?.y,
        tp?.zone,
        correction
      ) as [number, number][]

      const { area, perimeter } = gisUtils.calculateLotAreaAndPerimeterWithBearingOffset(boundaries, correction)
      const closureCheck = gisUtils.checkClosureError(
        boundaries,
        originLat,
        originLng,
        tp?.x,
        tp?.y,
        tp?.zone,
        correction
      )

      setPolygon({
        coordinates,
        area,
        perimeter,
        isValid: closureCheck.isAcceptable,
        closureError: closureCheck.error,
      })
    } catch (error) {
      console.error('Error generating polygon:', error)
    }
  }

  const renumberCorners = (rows: Corner[]): Corner[] =>
    rows.map((c, idx) => ({
      ...c,
      line: idx + 1,
    }))

  const addCorner = () => {
    const newCorner: Corner = {
      id: `corner-${Date.now()}`,
      line: corners.length + 1,
      ns: 'N',
      deg: '',
      min: '',
      ew: 'E',
      distance: '',
    }
    const updatedCorners = [...corners, newCorner]
    setCorners(updatedCorners)
    generatePolygon(updatedCorners)
  }

  const addSubcornerAfter = (id: string) => {
    setCorners((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      if (idx < 0) return prev
      const anchor = prev[idx]
      const frozen = prev.map((c) => ({
        ...c,
        sheetLineLabel: c.sheetLineLabel ?? formatSurveyLegSheetLabel(c.line),
      }))
      const inserted: Corner = {
        id: `subcorner-${Date.now()}`,
        line: anchor.line + 1,
        sheetLineLabel: anchor.sheetLineLabel ?? formatSurveyLegSheetLabel(anchor.line),
        segmentType: anchor.segmentType ?? 'line',
        curveRadius: anchor.curveRadius,
        curveDelta: anchor.curveDelta,
        curveChord: anchor.curveChord,
        curveDirection: anchor.curveDirection,
        ns: anchor.ns,
        deg: anchor.deg,
        min: anchor.min,
        sec: anchor.sec,
        ew: anchor.ew,
        distance: anchor.distance,
      }
      const next = renumberCorners([...frozen.slice(0, idx + 1), inserted, ...frozen.slice(idx + 1)])
      generatePolygon(next)
      return next
    })
  }

  const deleteCorner = (id: string) => {
    const updated = renumberCorners(corners.filter((c) => c.id !== id))
    setCorners(updated)
    generatePolygon(updated)
  }

  const updateCorner = (
    id: string,
    patch: Partial<Pick<Corner, 'sheetLineLabel' | 'ns' | 'deg' | 'min' | 'sec' | 'ew' | 'distance'>>
  ) => {
    setCorners((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      generatePolygon(next)
      return next
    })
  }

  const clearImportedData = () => {
    setCsvFile(null)
    setCorners([])
    setPolygon(null)
    setImportedLots(null)
    setActiveImportedLotIndex(0)
    setDocumentTieFromScan(null)
    setAutoTieMatchHint(null)
  }

  const handleCsvInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanModalVisible(false)
    try {
      const parsed = await parseLotCsvFile(file)
      if (parsed.length > 0) {
        setImportedLots(null)
        setActiveImportedLotIndex(0)
        setDocumentTieFromScan(null)
        setAutoTieMatchHint(null)
        setCsvFile(file.name)
        const newCorners = parsed.map((p, idx) => ({
          id: `csv-${Date.now()}-${idx}`,
          line: idx + 1,
          segmentType: p.segmentType ?? 'line',
          curveRadius: p.curveRadius,
          curveDelta: p.curveDelta,
          curveChord: p.curveChord,
          curveDirection: p.curveDirection,
          ns: p.ns,
          deg: p.deg,
          min: p.min,
          sec: p.sec || '',
          ew: p.ew,
          distance: p.distance,
        }))
        setCorners(newCorners)
        generatePolygon(newCorners)
        show(`Imported ${parsed.length} corners from CSV.`, 'success')
      } else {
        show('Could not extract any valid corners from the CSV.', 'error')
      }
    } catch {
      show('Failed to parse the CSV file.', 'error')
    }
  }

  const slotsFromScannedLots = (scannedLots: ScannedLot[]): ImportedLotSlot[] => {
    const ts = Date.now()
    return scannedLots
      .filter((l) => l.corners.length > 0)
      .map((lot, i) => ({
        id: `imported-${ts}-${i}`,
        lotNo: lot.lotNo?.trim() ? lot.lotNo.trim() : null,
        claimant: lot.claimant?.trim() ? lot.claimant.trim() : null,
        corners: lot.corners.map((p, idx) => ({
          id: `ocr-${ts}-${i}-${idx}`,
          line: idx + 1,
          sheetLineLabel: p.sheetLineLabel,
          ns: p.ns,
          deg: p.deg,
          min: p.min,
          sec: p.sec || '',
          ew: p.ew,
          distance: p.distance,
        })),
      }))
  }

  const applyReviewedLots = (
    scannedLots: ScannedLot[],
    sourceFileLabel: string | null,
    tieFromDocument?: string | null
  ) => {
    const slots = slotsFromScannedLots(scannedLots)
    if (slots.length === 0) return

    const t = tieFromDocument?.trim()
    setDocumentTieFromScan(t && t.length > 0 ? t : null)

    const matched = t ? findBestTiePointMatch(t) : null
    if (matched) {
      setSelectedProvince(matched.province)
      setSelectedMunicipality(matched.municipality)
      const munList = tiepointsService.getMunicipalities(matched.province)
      setMunicipalities(munList)
      const tps = tiepointsService.getTiePointsByLocation(matched.province, matched.municipality)
      setTiePoints(tps)
      const tp = tps.find((x) => x.id === matched.id) ?? tps[0] ?? null
      if (tp) {
        setSelectedTiePoint(tp)
        setCenter({ lat: tp.lat, lng: tp.lon })
      }
      setAutoTieMatchHint(`Catalog tie applied: ${matched.name}\n${matched.province} · ${matched.municipality}`)
    } else if (t) {
      setAutoTieMatchHint('No catalog match for the document tie — choose a Tie Point manually.')
    } else {
      setAutoTieMatchHint(
        slots.length > 1
          ? `${slots.length} lots loaded — pick a lot below. Row 1 = MON→C1; sheet LINE 1-2 starts at row 2.`
          : null
      )
    }

    setImportedLots(slots)
    setActiveImportedLotIndex(0)
    setCorners(slots[0].corners)
    generatePolygon(slots[0].corners, matched ?? undefined)
    if (sourceFileLabel) setCsvFile(sourceFileLabel)
  }

  const switchImportedLot = (index: number) => {
    if (!importedLots || index < 0 || index >= importedLots.length || index === activeImportedLotIndex) return
    const updated = importedLots.map((s, i) =>
      i === activeImportedLotIndex ? { ...s, corners: corners.map((c) => ({ ...c })) } : s
    )
    setImportedLots(updated)
    setActiveImportedLotIndex(index)
    setCorners(updated[index].corners.map((c) => ({ ...c })))
    generatePolygon(updated[index].corners)
  }

  const importedLotChipLabel = (slot: ImportedLotSlot, index: number) => {
    if (slot.lotNo) return `Lot ${slot.lotNo}`
    return `Lot ${index + 1}`
  }

  const processOcrImage = async (file: File) => {
    if (ocrProgressTimerRef.current) {
      clearInterval(ocrProgressTimerRef.current)
      ocrProgressTimerRef.current = null
    }
    if (ocrAbortRef.current) {
      ocrAbortRef.current.abort()
      ocrAbortRef.current = null
    }
    const controller = new AbortController()
    ocrAbortRef.current = controller
    setIsOcrProcessing(true)
    setOcrProgress(5)
    setOcrStatusHint('Preparing image…')
    ocrProgressTimerRef.current = setInterval(() => {
      setOcrProgress((p) => {
        if (p >= 96) return p
        const next = p + (p < 40 ? 7 : p < 75 ? 4 : p < 90 ? 2 : 1)
        if (next >= 85) {
          setOcrStatusHint('Analyzing image with AI…')
        }
        return Math.min(96, next)
      })
    }, 550)
    try {
      const prepared = await prepareScanImageFile(file)
      setOcrStatusHint('Uploading and analyzing…')
      const { lots: extractedLots, meta } = await scanLandTitleImage(prepared, controller.signal)
      const nonEmpty = extractedLots.filter((l) => l.corners.length > 0)
      if (nonEmpty.length > 0) {
        setPendingScanLabel(`OCR_Result_${file.name}`)
        setReviewLots(nonEmpty)
        setReviewMeta(meta)
        const docTie = meta.tiePointReference?.trim()
        setReviewCatalogMatch(docTie ? findBestTiePointMatch(docTie) : null)
        setScanReviewVisible(true)
        setOcrProgress(100)
      } else {
        show('Could not detect any survey lines in the image. Please try a clearer image or add manually.', 'error')
      }
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string }
      const isAborted =
        err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted')
      if (!isAborted) {
        show(err.message || 'Failed to process the image.', 'error')
      }
    } finally {
      if (ocrProgressTimerRef.current) {
        clearInterval(ocrProgressTimerRef.current)
        ocrProgressTimerRef.current = null
      }
      if (ocrAbortRef.current === controller) ocrAbortRef.current = null
      setIsOcrProcessing(false)
      setOcrProgress(0)
      setOcrStatusHint(null)
    }
  }

  const handleCancelOcr = () => {
    if (ocrAbortRef.current) {
      ocrAbortRef.current.abort()
      ocrAbortRef.current = null
    }
    if (ocrProgressTimerRef.current) {
      clearInterval(ocrProgressTimerRef.current)
      ocrProgressTimerRef.current = null
    }
    setIsOcrProcessing(false)
    setOcrProgress(0)
    setOcrStatusHint(null)
  }

  const setPendingImage = (file: File, source: 'camera' | 'gallery') => {
    if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    setPendingImageFile(file)
    setPendingImagePreviewUrl(URL.createObjectURL(file))
    setPendingImageSource(source)
  }

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>, source: 'camera' | 'gallery') => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanModalVisible(false)
    setPendingImage(file, source)
  }

  const clearPendingImage = () => {
    if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl)
    setPendingImageFile(null)
    setPendingImagePreviewUrl(null)
    setPendingImageSource(null)
  }

  const handleRetakeOrReselect = () => {
    if (pendingImageSource === 'camera') cameraInputRef.current?.click()
    else galleryInputRef.current?.click()
  }

  const handleConfirmAnalyzeImage = async () => {
    if (!pendingImageFile) return
    const file = pendingImageFile
    clearPendingImage()
    await processOcrImage(file)
  }

  const handleDone = () => {
    if (corners.length < 3) {
      show('Add at least 3 survey lines (MON→C1 plus lot lines).', 'error')
      return
    }
    generatePolygon(corners)
  }

  useEffect(() => {
    if (corners.length >= 3) generatePolygon(corners)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when bearing correction changes
  }, [bearingCorrection])

  const exportCornerRows: LotCornerRow[] = useMemo(
    () =>
      corners.map((c) => ({
        line: c.line,
        sheetLineLabel: c.sheetLineLabel,
        ns: c.ns,
        deg: c.deg,
        min: c.min,
        sec: c.sec,
        ew: c.ew,
        distance: c.distance,
      })),
    [corners]
  )

  const lotPolygonForExport: LotPolygonExport | null = useMemo(() => {
    if (!polygon?.coordinates?.length) return null
    return {
      coordinates: polygon.coordinates,
      area: polygon.area,
      perimeter: polygon.perimeter,
      isValid: polygon.isValid,
      closureError: polygon.closureError,
    }
  }, [polygon])

  const canExportLot = useMemo(
    () => isLotExportable(exportCornerRows, lotPolygonForExport),
    [exportCornerRows, lotPolygonForExport]
  )

  const tieForExport: LotTieContext = useMemo(() => {
    if (!selectedTiePoint) return null
    return {
      name: selectedTiePoint.name,
      province: selectedTiePoint.province,
      municipality: selectedTiePoint.municipality,
      lat: selectedTiePoint.lat,
      lon: selectedTiePoint.lon,
      zone: selectedTiePoint.zone,
      x: selectedTiePoint.x,
      y: selectedTiePoint.y,
      traverseGridLabel: formatTraverseGridLabel(DEFAULT_PLOT_TRAVERSE_GRID),
    }
  }, [selectedTiePoint])

  const closeExportModal = () => setExportModalVisible(false)

  const handleExport = () => {
    if (!canExportLot || !lotPolygonForExport) {
      show(
        'Enter bearings (deg/min, N/S, E/W) and a positive distance (meters) for every survey line, with at least three lines, so the lot boundary can be computed.',
        'error'
      )
      return
    }
    setExportModalVisible(true)
  }

  const runExportPdf = () => {
    const poly = lotPolygonForExport
    if (!poly) return
    closeExportModal()
    setExportLoadingMessage('Generating PDF report…')
    setIsExporting(true)
    void shareLotPdf(exportCornerRows, poly, tieForExport, documentTieFromScan)
      .then(() => show('PDF downloaded.', 'success'))
      .catch((err: unknown) => {
        show(err instanceof Error ? err.message : String(err), 'error')
      })
      .finally(() => setIsExporting(false))
  }

  const runExportCsv = () => {
    closeExportModal()
    setExportLoadingMessage('Exporting CSV…')
    setIsExporting(true)
    void Promise.resolve()
      .then(() => shareLotCsv(exportCornerRows))
      .then(() => show('CSV downloaded.', 'success'))
      .catch((err: unknown) => {
        show(err instanceof Error ? err.message : String(err), 'error')
      })
      .finally(() => setIsExporting(false))
  }

  const handleNew = () => {
    setCorners([])
    setPolygon(null)
    setCsvFile(null)
    setImportedLots(null)
    setActiveImportedLotIndex(0)
    setDocumentTieFromScan(null)
    setAutoTieMatchHint(null)
    setReviewCatalogMatch(null)
    setShowMap(false)
    setShowAllMap(false)
  }

  const buildSegmentEdgesFromCorners = (cornerPoints: Corner[]): MapSegmentEdge[] =>
    cornerPoints.map((corner) => ({
      lineId: corner.sheetLineLabel ?? formatSurveyLegSheetLabel(corner.line),
      bearing: formatBearing(corner.ns, corner.deg, corner.min, corner.ew, corner.sec),
      distanceM: parseFloat(corner.distance) || 0,
    }))

  const activeImportedSlot =
    importedLots && importedLots.length > 0 ? importedLots[activeImportedLotIndex] : null

  const mapPolygon = polygon
    ? {
        coordinates: polygon.coordinates,
        color: GIS_POLYGON_YELLOW,
        fillColor: GIS_POLYGON_YELLOW,
        segmentEdges: buildSegmentEdgesFromCorners(corners),
        centerLabel: {
          areaSqm: polygon.area,
          lotNo: activeImportedSlot?.lotNo ?? null,
          claimant: activeImportedSlot?.claimant ?? null,
        } satisfies MapCenterLabel,
      }
    : null

  const mapPolygons = useMemo(() => {
    if (!importedLots || importedLots.length < 2 || !selectedTiePoint) return null
    const correction = Number.isFinite(parseFloat(bearingCorrection)) ? parseFloat(bearingCorrection) : 0
    const out: Array<{
      coordinates: [number, number][]
      color: string
      fillColor: string
      segmentEdges: MapSegmentEdge[]
      centerLabel: MapCenterLabel
    }> = []
    importedLots.forEach((slot) => {
      if (!slot?.corners?.length || slot.corners.length < 3) return
      try {
        const boundaries = slot.corners.map((corner) => ({
          id: corner.id,
          bearing: formatBearing(corner.ns, corner.deg, corner.min, corner.ew, corner.sec),
          distance: parseFloat(corner.distance) || 0,
          segmentType: corner.segmentType ?? 'line',
          curveRadius: parseFloat(corner.curveRadius || '') || undefined,
          curveDelta: parseFloat(corner.curveDelta || '') || undefined,
          curveChord: parseFloat(corner.curveChord || '') || undefined,
          curveDirection: corner.curveDirection,
          isTiePoint: corner.line === 1,
        }))
        const coordinates = gisUtils.generateLotPolygonFromTraverse(
          selectedTiePoint.lat,
          selectedTiePoint.lon,
          boundaries,
          selectedTiePoint.x,
          selectedTiePoint.y,
          selectedTiePoint.zone,
          correction
        ) as [number, number][]
        if (coordinates.length >= 4) {
          const { area } = gisUtils.calculateLotAreaAndPerimeterWithBearingOffset(
            boundaries,
            correction
          )
          out.push({
            coordinates,
            color: GIS_POLYGON_YELLOW,
            fillColor: GIS_POLYGON_YELLOW,
            segmentEdges: slot.corners.map((corner) => ({
              lineId: corner.sheetLineLabel ?? formatSurveyLegSheetLabel(corner.line),
              bearing: formatBearing(corner.ns, corner.deg, corner.min, corner.ew, corner.sec),
              distanceM: parseFloat(corner.distance) || 0,
            })),
            centerLabel: {
              areaSqm: area,
              lotNo: slot.lotNo,
              claimant: slot.claimant,
            },
          })
        }
      } catch (error) {
        console.warn('Failed to build polygon for imported lot', slot.id, error)
      }
    })
    return out.length ? out : null
  }, [importedLots, selectedTiePoint, bearingCorrection])

  const liveSketch = useMemo(() => {
    const pts = polygon?.coordinates
    if (!pts || pts.length < 2) return null
    const unique =
      pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
        ? pts.slice(0, -1)
        : pts
    if (unique.length < 2) return null

    const xs = unique.map((p) => p[0])
    const ys = unique.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(maxX - minX, 1e-9)
    const spanY = Math.max(maxY - minY, 1e-9)
    const pad = 14
    const canvasW = 280
    const canvasH = 170
    const scale = Math.min((canvasW - pad * 2) / spanX, (canvasH - pad * 2) / spanY)
    const plotW = spanX * scale
    const plotH = spanY * scale
    const offsetX = (canvasW - plotW) / 2
    const offsetY = (canvasH - plotH) / 2

    const projected = unique.map(([x, y]) => ({
      x: offsetX + (x - minX) * scale,
      y: canvasH - (offsetY + (y - minY) * scale),
    }))

    const edges: Array<{
      id: string
      left: number
      top: number
      length: number
      angle: number
      label: string
      labelLeft: number
      labelTop: number
      labelWidth: number
      labelAngle: number
    }> = []
    const isPoly = projected.length >= 3
    for (let i = 0; i < projected.length; i++) {
      const next = i < projected.length - 1 ? projected[i + 1] : isPoly ? projected[0] : null
      if (!next) continue
      const p1 = projected[i]
      const p2 = next
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const length = Math.hypot(dx, dy)
      const midpointX = (p1.x + p2.x) / 2
      const midpointY = (p1.y + p2.y) / 2
      const rawAngle = Math.atan2(dy, dx)
      const readableAngle = rawAngle > Math.PI / 2 || rawAngle < -Math.PI / 2 ? rawAngle + Math.PI : rawAngle
      const sourceCorner = corners[i]
      const legLabel =
        sourceCorner && sourceCorner.distance
          ? `${formatBearing(sourceCorner.ns, sourceCorner.deg, sourceCorner.min, sourceCorner.ew, sourceCorner.sec)}  ${sourceCorner.distance} m`
          : ''
      const labelWidth = Math.min(Math.max(length - 10, 52), 150)
      edges.push({
        id: `${i}`,
        left: midpointX - length / 2,
        top: midpointY - 1,
        length,
        angle: rawAngle,
        label: legLabel,
        labelLeft: midpointX - labelWidth / 2,
        labelTop: midpointY - 12,
        labelWidth,
        labelAngle: readableAngle,
      })
    }
    return { points: projected, edges, isPolygon: isPoly }
  }, [polygon?.coordinates, corners])

  const edgeColor = isDarkMode ? '#f78a8a' : '#cf2323'
  const nodeFill = isDarkMode ? '#F7C94A' : '#f5bf2f'
  const nodeBorder = isDarkMode ? '#B58A11' : '#b58a11'
  const labelBg = isDarkMode ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.78)'

  return (
    <div className="lot-plotter-page" style={{ backgroundColor: colors.contentBg }}>
      <Notification notification={notification} onDismiss={dismissNotification} />
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="lot-plotter-page__hidden-input"
        onChange={handleCsvInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="lot-plotter-page__hidden-input"
        onChange={(e) => handleImageInputChange(e, 'gallery')}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="lot-plotter-page__hidden-input"
        onChange={(e) => handleImageInputChange(e, 'camera')}
      />

      <div className="lot-plotter-page__content">
        <div className="lot-plotter-page__content-container">
          {/* Tie Point */}
          <section className="lot-plotter-page__section" style={{ backgroundColor: colors.cardBg, borderColor: colors.border }}>
            <div
              className="lot-plotter-page__section-header-gray"
              style={{ backgroundColor: colors.contentBg, borderBottomColor: colors.border }}
            >
              <h2 className="lot-plotter-page__tie-point-section-title" style={{ color: colors.text, margin: 0 }}>
                Tie Point
              </h2>
            </div>

            <div className="lot-plotter-page__tie-point-row">
              <div className="lot-plotter-page__tie-point-col">
                <button
                  type="button"
                  className={`lot-plotter-page__select-row-full lot-plotter-page__select-row-tie-point${catalogLoading || !provinces.length ? ' lot-plotter-page__disabled' : ''}`}
                  style={{ backgroundColor: colors.contentBg, borderColor: colors.border, color: colors.text }}
                  onClick={() => provinces.length && openProvincePicker()}
                  disabled={catalogLoading || !provinces.length}
                >
                  <span className="lot-plotter-page__tie-point-field-text">
                    {catalogLoading ? 'Loading provinces…' : selectedProvince || 'Select Province'}
                  </span>
                  <Maximize2 size={24} color="#3b5998" className="lot-plotter-page__tie-point-expand-icon" />
                </button>
                <p className="lot-plotter-page__tie-point-caption" style={{ color: colors.textMuted }}>
                  Province
                </p>
              </div>
              <div className="lot-plotter-page__tie-point-col">
                <button
                  type="button"
                  className={`lot-plotter-page__select-row-full lot-plotter-page__select-row-tie-point${catalogLoading || !municipalities.length ? ' lot-plotter-page__disabled' : ''}`}
                  style={{ backgroundColor: colors.contentBg, borderColor: colors.border, color: colors.text }}
                  onClick={() => municipalities.length && openMunicipalityPicker()}
                  disabled={catalogLoading || !municipalities.length}
                >
                  <span className="lot-plotter-page__tie-point-field-text">
                    {catalogLoading ? 'Loading…' : selectedMunicipality || 'Select Municipality'}
                  </span>
                  <Maximize2 size={24} color="#3b5998" className="lot-plotter-page__tie-point-expand-icon" />
                </button>
                <p className="lot-plotter-page__tie-point-caption" style={{ color: colors.textMuted }}>
                  Municipality
                </p>
              </div>
            </div>

            <div className="lot-plotter-page__tie-point-name-row">
              <div className="lot-plotter-page__tie-point-name-col">
                <button
                  type="button"
                  className={`lot-plotter-page__select-row-full lot-plotter-page__select-row-tie-point${!tiePoints.length ? ' lot-plotter-page__disabled' : ''}`}
                  style={{ backgroundColor: colors.contentBg, borderColor: colors.border, color: colors.text }}
                  onClick={() => tiePoints.length && openTiePointPicker()}
                  disabled={!tiePoints.length}
                >
                  <span className="lot-plotter-page__tie-point-name-text-wrap">
                    <span className="lot-plotter-page__tie-point-name-text">
                      {selectedTiePoint ? selectedTiePoint.name : 'Select Tie Point'}
                    </span>
                  </span>
                  <Maximize2 size={24} color="#3b5998" className="lot-plotter-page__tie-point-expand-icon" />
                </button>
                <p className="lot-plotter-page__tie-point-caption" style={{ color: colors.textMuted }}>
                  Tie Point Name
                </p>
              </div>
            </div>

            {selectedTiePoint ? (
              <div
                className={`lot-plotter-page__tie-meta-preview-wrap${viewportWidth >= 980 ? ' lot-plotter-page__tie-meta-preview-wrap--wide' : ''}`}
              >
                <div
                  className={`lot-plotter-page__tp-details-container${viewportWidth >= 980 ? ' lot-plotter-page__tp-details-container--wide' : ''}`}
                  style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
                >
                  <div className="lot-plotter-page__tp-grid-row" style={{ borderBottomColor: colors.border }}>
                    <span className="lot-plotter-page__tp-grid-lbl" style={{ color: colors.textMuted }}>
                      Lat
                    </span>
                    <span className="lot-plotter-page__tp-grid-val" style={{ color: colors.text }}>
                      {selectedTiePoint.lat.toFixed(6)}
                    </span>
                    <span className="lot-plotter-page__tp-grid-lbl" style={{ color: colors.textMuted }}>
                      Lon
                    </span>
                    <span className="lot-plotter-page__tp-grid-val" style={{ color: colors.text }}>
                      {selectedTiePoint.lon.toFixed(6)}
                    </span>
                  </div>
                  <div className="lot-plotter-page__tp-grid-row" style={{ borderBottomColor: colors.border }}>
                    <span className="lot-plotter-page__tp-grid-lbl" style={{ color: colors.textMuted }}>
                      Zone
                    </span>
                    <span className="lot-plotter-page__tp-grid-val" style={{ color: colors.text }}>
                      {String(selectedTiePoint.zone)}
                    </span>
                    <span className="lot-plotter-page__tp-grid-lbl" style={{ color: colors.textMuted }}>
                      —
                    </span>
                    <span className="lot-plotter-page__tp-grid-val" style={{ color: colors.textMuted }}>
                      —
                    </span>
                  </div>
                  <div className="lot-plotter-page__tp-grid-row">
                    <span className="lot-plotter-page__tp-grid-lbl" style={{ color: colors.textMuted }}>
                      E
                    </span>
                    <span className="lot-plotter-page__tp-grid-val" style={{ color: colors.text }}>
                      {selectedTiePoint.x}
                    </span>
                    <span className="lot-plotter-page__tp-grid-lbl" style={{ color: colors.textMuted }}>
                      N
                    </span>
                    <span className="lot-plotter-page__tp-grid-val" style={{ color: colors.text }}>
                      {selectedTiePoint.y}
                    </span>
                  </div>
                </div>

                <div
                  className={`lot-plotter-page__live-sketch-card${viewportWidth >= 980 ? ' lot-plotter-page__live-sketch-card--wide' : ''}`}
                  style={{ borderColor: colors.border, backgroundColor: colors.contentBg }}
                >
                  <p className="lot-plotter-page__live-sketch-title" style={{ color: colors.text }}>
                    Live lot preview
                  </p>
                  <div
                    className="lot-plotter-page__live-sketch-canvas"
                    style={{ borderColor: colors.border, backgroundColor: colors.cardBg }}
                  >
                    {liveSketch ? (
                      <>
                        {liveSketch.edges.map((edge) => (
                          <div
                            key={edge.id}
                            className="lot-plotter-page__live-sketch-edge"
                            style={{
                              left: edge.left,
                              top: edge.top,
                              width: edge.length,
                              transform: `rotate(${edge.angle}rad)`,
                              backgroundColor: edgeColor,
                            }}
                          />
                        ))}
                        {liveSketch.edges.map(
                          (edge) =>
                            !!edge.label && (
                              <span
                                key={`lbl-${edge.id}`}
                                className="lot-plotter-page__live-sketch-edge-label"
                                style={{
                                  left: edge.labelLeft,
                                  top: edge.labelTop,
                                  width: edge.labelWidth,
                                  color: colors.text,
                                  backgroundColor: labelBg,
                                  transform: `rotate(${edge.labelAngle}rad)`,
                                }}
                              >
                                {edge.label}
                              </span>
                            )
                        )}
                        {liveSketch.points.map((pt, idx) => (
                          <div
                            key={`pt-${idx}`}
                            className="lot-plotter-page__live-sketch-node"
                            style={{
                              left: pt.x - 3.5,
                              top: pt.y - 3.5,
                              backgroundColor: nodeFill,
                              borderColor: nodeBorder,
                            }}
                          />
                        ))}
                      </>
                    ) : (
                      <p className="lot-plotter-page__live-sketch-empty" style={{ color: colors.textMuted }}>
                        Preview appears after you add at least two legs.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {documentTieFromScan ? (
              <div
                className="lot-plotter-page__doc-tie-banner"
                style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
              >
                <p className="lot-plotter-page__doc-tie-banner-label" style={{ color: colors.textMuted }}>
                  Tie from scanned document
                </p>
                <p className="lot-plotter-page__doc-tie-banner-text" style={{ color: colors.text }}>
                  {documentTieFromScan}
                </p>
                <p className="lot-plotter-page__doc-tie-banner-hint" style={{ color: colors.textMuted }}>
                  Match this to the map tie point above when possible. Table row 1 = sheet column MON. TO CORNER 1. Row 2 =
                  first bearing in LINE 1-2 (sheet “line 1-2” is not app row 1).
                </p>
              </div>
            ) : null}

            {autoTieMatchHint ? (
              <div
                className="lot-plotter-page__auto-tie-hint-banner"
                style={{
                  backgroundColor: colors.contentBg,
                  borderColor: autoTieMatchHint.startsWith('Catalog') ? colors.success : colors.warning,
                }}
              >
                {autoTieMatchHint.startsWith('Catalog') ? (
                  <CheckCircle2 size={20} color={colors.success} style={{ flexShrink: 0 }} />
                ) : (
                  <AlertCircle size={20} color={colors.warning} style={{ flexShrink: 0 }} />
                )}
                <p className="lot-plotter-page__auto-tie-hint-text" style={{ color: colors.text, whiteSpace: 'pre-line' }}>
                  {autoTieMatchHint}
                </p>
              </div>
            ) : null}

          </section>

          {/* Upload / Scan */}
          <section className="lot-plotter-page__section" style={{ backgroundColor: colors.cardBg, borderColor: colors.border }}>
            <button
              type="button"
              className="lot-plotter-page__section-header-maroon"
              onClick={() => setCsvSectionExpanded(!csvSectionExpanded)}
            >
              <div className="lot-plotter-page__csv-dropdown-header">
                <span className="lot-plotter-page__section-title-on-maroon">Upload / Scan Land Title</span>
                <span className="lot-plotter-page__view-format-text-on-maroon">(CSV or Image)</span>
              </div>
              {csvSectionExpanded ? <ChevronUp size={20} color="#fff" /> : <ChevronDown size={20} color="#fff" />}
            </button>

            {csvSectionExpanded ? (
              <div className="lot-plotter-page__upload-row">
                {!isOcrProcessing ? (
                  <button
                    type="button"
                    className="lot-plotter-page__choose-file-btn"
                    style={{ backgroundColor: colors.cardBg }}
                    onClick={() => setScanModalVisible(true)}
                  >
                    <Upload size={14} color="#3b5998" style={{ marginRight: 4 }} />
                    Upload File
                  </button>
                ) : (
                  <button
                    type="button"
                    className="lot-plotter-page__choose-file-btn lot-plotter-page__cancel-ocr-btn"
                    style={{ backgroundColor: colors.cardBg }}
                    onClick={handleCancelOcr}
                  >
                    <XCircle size={14} style={{ marginRight: 4 }} />
                    Cancel
                  </button>
                )}

                {csvFile && !isOcrProcessing ? (
                  <div className="lot-plotter-page__file-name-container">
                    <span className="lot-plotter-page__file-name" style={{ color: colors.text }}>
                      {csvFile}
                    </span>
                    <button type="button" className="lot-plotter-page__clear-file-btn" onClick={clearImportedData}>
                      <XCircle size={18} color="#dc3545" />
                    </button>
                  </div>
                ) : (
                  <div className="lot-plotter-page__progress-wrap">
                    <span className="lot-plotter-page__file-name" style={{ color: colors.text }}>
                      {isOcrProcessing
                        ? `Analyzing… ${ocrProgress}%${ocrStatusHint ? ` — ${ocrStatusHint}` : ''}`
                        : 'No file chosen'}
                    </span>
                    {isOcrProcessing ? (
                      <div className="lot-plotter-page__progress-bar-track" style={{ backgroundColor: colors.border }}>
                        <div
                          className="lot-plotter-page__progress-bar-fill"
                          style={{ width: `${ocrProgress}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* Data Table */}
          <section className="lot-plotter-page__section" style={{ backgroundColor: colors.cardBg, borderColor: colors.border }}>
            <div
              className="lot-plotter-page__data-table-section-header"
              style={{ backgroundColor: colors.contentBg, borderBottomColor: colors.border }}
            >
              <div className="lot-plotter-page__bearing-adjust-row">
                <span className="lot-plotter-page__bearing-adjust-label" style={{ color: colors.textMuted }}>
                  Bearing correction (deg)
                </span>
                <input
                  className="lot-plotter-page__bearing-adjust-input"
                  style={{ backgroundColor: colors.contentBg, color: colors.text, borderColor: colors.border }}
                  value={bearingCorrection}
                  onChange={(e) => setBearingCorrection(e.target.value.replace(/[^0-9.\-]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
            </div>

            {importedLots && importedLots.length > 1 ? (
              <div className="lot-plotter-page__imported-lot-chip-scroll">
                <div className="lot-plotter-page__imported-lot-chip-row">
                  {importedLots.map((slot, i) => (
                    <button
                      key={slot.id}
                      type="button"
                      className="lot-plotter-page__imported-lot-chip"
                      style={{
                        borderColor: activeImportedLotIndex === i ? colors.primary : colors.border,
                        borderWidth: activeImportedLotIndex === i ? 2 : 1,
                        backgroundColor: colors.contentBg,
                      }}
                      onClick={() => switchImportedLot(i)}
                    >
                      <span
                        className={`lot-plotter-page__imported-lot-chip-text${activeImportedLotIndex === i ? ' lot-plotter-page__imported-lot-chip-text--active' : ''}`}
                        style={{ color: activeImportedLotIndex === i ? colors.primary : colors.text }}
                      >
                        {importedLotChipLabel(slot, i)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="lot-plotter-page__data-table-scroll">
              <div className="lot-plotter-page__data-table-min-width">
                <div
                  className="lot-plotter-page__data-table-header"
                  style={{ backgroundColor: colors.contentBg, borderBottomColor: colors.border }}
                >
                  <div className="lot-plotter-page__col-line">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      LEG/CURVE
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-dir">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      NS
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-deg-min">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      Deg
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-deg-min">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      Min
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-deg-min">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      Sec
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-dir">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      EW
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-dist">
                    <span className="lot-plotter-page__data-table-header-text" style={{ color: colors.text }}>
                      Distance
                    </span>
                  </div>
                  <div className="lot-plotter-page__col-del">
                    <span className="lot-plotter-page__data-table-header-text">+/-</span>
                  </div>
                </div>

                {corners.map((corner) => (
                  <div
                    key={corner.id}
                    className="lot-plotter-page__data-table-row"
                    style={{ borderBottomColor: colors.border }}
                  >
                    <div className="lot-plotter-page__col-line">
                      <span className="lot-plotter-page__line-label-text" style={{ color: colors.text }}>
                        {corner.sheetLineLabel ?? formatSurveyLegSheetLabel(corner.line)}
                      </span>
                    </div>
                    <div className="lot-plotter-page__col-dir">
                      <div className="lot-plotter-page__direction-toggle" style={{ backgroundColor: colors.contentBg }}>
                        <button
                          type="button"
                          className={`lot-plotter-page__dir-btn${corner.ns === 'N' ? ' lot-plotter-page__dir-btn--active' : ''}`}
                          onClick={() => updateCorner(corner.id, { ns: 'N' })}
                        >
                          <span
                            className={`lot-plotter-page__dir-btn-text${corner.ns === 'N' ? ' lot-plotter-page__dir-btn-text--active' : ''}`}
                          >
                            N
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`lot-plotter-page__dir-btn${corner.ns === 'S' ? ' lot-plotter-page__dir-btn--active' : ''}`}
                          onClick={() => updateCorner(corner.id, { ns: 'S' })}
                        >
                          <span
                            className={`lot-plotter-page__dir-btn-text${corner.ns === 'S' ? ' lot-plotter-page__dir-btn-text--active' : ''}`}
                          >
                            S
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="lot-plotter-page__col-deg-min">
                      <input
                        className="lot-plotter-page__table-input"
                        style={{ backgroundColor: colors.contentBg, color: colors.text, borderColor: colors.border }}
                        placeholder="0"
                        value={corner.deg}
                        onChange={(e) => updateCorner(corner.id, { deg: e.target.value.replace(/[^0-9]/g, '') })}
                        inputMode="numeric"
                        maxLength={3}
                      />
                    </div>
                    <div className="lot-plotter-page__col-deg-min">
                      <input
                        className="lot-plotter-page__table-input"
                        style={{ backgroundColor: colors.contentBg, color: colors.text, borderColor: colors.border }}
                        placeholder="0"
                        value={corner.min}
                        onChange={(e) => updateCorner(corner.id, { min: e.target.value.replace(/[^0-9]/g, '') })}
                        inputMode="numeric"
                        maxLength={2}
                      />
                    </div>
                    <div className="lot-plotter-page__col-deg-min">
                      <input
                        className="lot-plotter-page__table-input"
                        style={{ backgroundColor: colors.contentBg, color: colors.text, borderColor: colors.border }}
                        placeholder="0"
                        value={corner.sec || ''}
                        onChange={(e) => updateCorner(corner.id, { sec: e.target.value.replace(/[^0-9]/g, '') })}
                        inputMode="numeric"
                        maxLength={2}
                      />
                    </div>
                    <div className="lot-plotter-page__col-dir">
                      <div className="lot-plotter-page__direction-toggle" style={{ backgroundColor: colors.contentBg }}>
                        <button
                          type="button"
                          className={`lot-plotter-page__dir-btn${corner.ew === 'E' ? ' lot-plotter-page__dir-btn--active' : ''}`}
                          onClick={() => updateCorner(corner.id, { ew: 'E' })}
                        >
                          <span
                            className={`lot-plotter-page__dir-btn-text${corner.ew === 'E' ? ' lot-plotter-page__dir-btn-text--active' : ''}`}
                          >
                            E
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`lot-plotter-page__dir-btn${corner.ew === 'W' ? ' lot-plotter-page__dir-btn--active' : ''}`}
                          onClick={() => updateCorner(corner.id, { ew: 'W' })}
                        >
                          <span
                            className={`lot-plotter-page__dir-btn-text${corner.ew === 'W' ? ' lot-plotter-page__dir-btn-text--active' : ''}`}
                          >
                            W
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="lot-plotter-page__col-dist">
                      <input
                        className="lot-plotter-page__table-input"
                        style={{ backgroundColor: colors.contentBg, color: colors.text, borderColor: colors.border }}
                        placeholder="0.00"
                        value={corner.distance}
                        onChange={(e) => updateCorner(corner.id, { distance: e.target.value.replace(/[^0-9.]/g, '') })}
                        inputMode="decimal"
                      />
                    </div>
                    <div className="lot-plotter-page__col-del">
                      <div className="lot-plotter-page__row-actions-col">
                        <button
                          type="button"
                          className="lot-plotter-page__add-subcorner-plus"
                          onClick={() => addSubcornerAfter(corner.id)}
                          aria-label="Add subcorner after this row"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="lot-plotter-page__remove-minus"
                          onClick={() => deleteCorner(corner.id)}
                          aria-label="Delete row"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="lot-plotter-page__bottom-buttons">
            <div className="lot-plotter-page__action-button-group">
              <button
                type="button"
                className="lot-plotter-page__yellow-btn"
                onClick={addCorner}
              >
                <span className="lot-plotter-page__yellow-btn-text">Add Corner</span>
              </button>
              <button
                type="button"
                className={`lot-plotter-page__yellow-btn${corners.length < 3 ? ' lot-plotter-page__btn-disabled' : ''}`}
                onClick={() => {
                  handleDone()
                  setShowMap(true)
                }}
                disabled={corners.length < 3}
              >
                <span className="lot-plotter-page__yellow-btn-text">View Map</span>
              </button>
              {mapPolygons && mapPolygons.length > 1 ? (
                <button type="button" className="lot-plotter-page__yellow-btn" onClick={() => setShowAllMap(true)}>
                  <span className="lot-plotter-page__yellow-btn-text">View All</span>
                </button>
              ) : null}
            </div>
            <div className="lot-plotter-page__action-button-group">
              <button
                type="button"
                className={`lot-plotter-page__yellow-btn${!canExportLot ? ' lot-plotter-page__btn-disabled' : ''}`}
                onClick={handleExport}
                disabled={!canExportLot}
              >
                <span className="lot-plotter-page__yellow-btn-text">Export</span>
              </button>
              <button
                type="button"
                className="lot-plotter-page__new-btn"
                onClick={handleNew}
              >
                <span className="lot-plotter-page__new-btn-text">New</span>
              </button>
            </div>
          </div>

          <div className="lot-plotter-page__spacer" />
        </div>
      </div>

      {pickerMode ? (
        <div className="lot-plotter-page__picker-modal-root" style={{ backgroundColor: colors.contentBg }}>
          <header
            className="lot-plotter-page__picker-header"
            style={{ backgroundColor: colors.cardBg, borderBottomColor: colors.border }}
          >
            <h2 className="lot-plotter-page__picker-title" style={{ color: colors.text, margin: 0 }}>
              {pickerMode === 'province'
                ? 'Select Province'
                : pickerMode === 'municipality'
                  ? 'Select Municipality'
                  : 'Select Tie Point'}
            </h2>
            <button type="button" className="lot-plotter-page__picker-close-btn" onClick={closePicker} aria-label="Close">
              <X size={28} color={colors.text} />
            </button>
          </header>
          <input
            className="lot-plotter-page__picker-search"
            style={{ backgroundColor: colors.cardBg, color: colors.text, borderColor: colors.border }}
            placeholder="Search…"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <div className="lot-plotter-page__picker-list">
            <div className="lot-plotter-page__picker-list-content">
              {pickerMode === 'province' ? (
                filteredProvinces.length === 0 ? (
                  <p className="lot-plotter-page__picker-empty">No provinces match your search.</p>
                ) : (
                  filteredProvinces.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`lot-plotter-page__picker-row-tie${selectedProvince === item ? ' lot-plotter-page__picker-row-selected' : ''}`}
                      style={{ backgroundColor: colors.cardBg, borderBottomColor: colors.border }}
                      onClick={() => handleProvinceSelect(item)}
                    >
                      <span
                        className={`lot-plotter-page__picker-row-text-tie${selectedProvince === item ? ' lot-plotter-page__picker-row-text-selected' : ''}`}
                        style={{ color: colors.text }}
                      >
                        {item}
                      </span>
                      {selectedProvince === item ? <CheckCircle2 size={22} color="#3b5998" /> : null}
                    </button>
                  ))
                )
              ) : pickerMode === 'municipality' ? (
                filteredMunicipalities.length === 0 ? (
                  <p className="lot-plotter-page__picker-empty">No municipalities match your search.</p>
                ) : (
                  filteredMunicipalities.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`lot-plotter-page__picker-row-tie${selectedMunicipality === item ? ' lot-plotter-page__picker-row-selected' : ''}`}
                      style={{ backgroundColor: colors.cardBg, borderBottomColor: colors.border }}
                      onClick={() => handleMunicipalitySelect(item)}
                    >
                      <span
                        className={`lot-plotter-page__picker-row-text-tie${selectedMunicipality === item ? ' lot-plotter-page__picker-row-text-selected' : ''}`}
                        style={{ color: colors.text }}
                      >
                        {item}
                      </span>
                      {selectedMunicipality === item ? <CheckCircle2 size={22} color="#3b5998" /> : null}
                    </button>
                  ))
                )
              ) : filteredTiePoints.length === 0 ? (
                <p className="lot-plotter-page__picker-empty">No tie points match your search.</p>
              ) : (
                filteredTiePoints.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`lot-plotter-page__picker-row-tie${selectedTiePoint?.id === item.id ? ' lot-plotter-page__picker-row-selected' : ''}`}
                    style={{ backgroundColor: colors.cardBg, borderBottomColor: colors.border }}
                    onClick={() => handleTiePointSelect(item)}
                  >
                    <div className="lot-plotter-page__picker-tie-text-block">
                      <span
                        className={`lot-plotter-page__picker-row-text-tie${selectedTiePoint?.id === item.id ? ' lot-plotter-page__picker-row-text-selected' : ''}`}
                        style={{ color: colors.text }}
                      >
                        {item.name}
                      </span>
                      <p className="lot-plotter-page__picker-tie-sub">
                        Lat {item.lat.toFixed(6)} · Lon {item.lon.toFixed(6)} · Zone {item.zone} · X {item.x} · Y{' '}
                        {item.y}
                      </p>
                    </div>
                    {selectedTiePoint?.id === item.id ? <CheckCircle2 size={22} color="#3b5998" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <MapModal
        visible={showMap && !!polygon}
        onClose={() => setShowMap(false)}
        center={center}
        zoom={17}
        polygon={mapPolygon}
        area={polygon?.area}
      />

      <MapModal
        visible={showAllMap && !!mapPolygons && mapPolygons.length > 1}
        onClose={() => setShowAllMap(false)}
        center={center}
        zoom={17}
        polygons={mapPolygons}
      />

      <ScanReviewModal
        visible={scanReviewVisible}
        lots={reviewLots}
        meta={reviewMeta}
        catalogMatch={reviewCatalogMatch}
        onDismiss={() => {
          setScanReviewVisible(false)
          setReviewLots([])
          setReviewMeta(null)
          setReviewCatalogMatch(null)
          setPendingScanLabel(null)
        }}
        onApply={(finalLots) => {
          applyReviewedLots(finalLots, pendingScanLabel, reviewMeta?.tiePointReference)
          setScanReviewVisible(false)
          setReviewLots([])
          setReviewMeta(null)
          setReviewCatalogMatch(null)
          setPendingScanLabel(null)
        }}
      />

      {exportModalVisible ? (
        <div className="lot-plotter-page__scan-modal-overlay" role="dialog" aria-modal="true">
          <div
            className="lot-plotter-page__scan-modal-content"
            style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}` }}
          >
            <div className="lot-plotter-page__scan-modal-header">
              <h3 className="lot-plotter-page__scan-modal-title" style={{ color: colors.text, margin: 0 }}>
                Export lot
              </h3>
              <button type="button" className="lot-plotter-page__modal-close-btn" onClick={closeExportModal}>
                <X size={24} color={colors.text} />
              </button>
            </div>
            <p className="lot-plotter-page__export-modal-desc" style={{ color: colors.textMuted }}>
              Choose a file format. PDF includes a map image (when a Maps API key is configured), tie details, and the
              traverse table. On the web, the PDF downloads directly (html2canvas + jsPDF), so the file does not include
              browser URL or date headers. Do not use the browser Print dialog for export if you want a clean PDF.
            </p>
            <button
              type="button"
              className="lot-plotter-page__export-format-row"
              style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
              onClick={runExportPdf}
            >
              <FileText size={26} color="#3b5998" />
              <div className="lot-plotter-page__export-format-text-col">
                <p className="lot-plotter-page__export-format-title" style={{ color: colors.text, margin: 0 }}>
                  PDF report
                </p>
                <p className="lot-plotter-page__export-format-sub" style={{ color: colors.textMuted, margin: 0 }}>
                  Download PDF (map + table)
                </p>
              </div>
              <ChevronRight size={20} color={colors.textMuted} />
            </button>
            <button
              type="button"
              className="lot-plotter-page__export-format-row"
              style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
              onClick={runExportCsv}
            >
              <Grid3x3 size={26} color="#3b5998" />
              <div className="lot-plotter-page__export-format-text-col">
                <p className="lot-plotter-page__export-format-title" style={{ color: colors.text, margin: 0 }}>
                  CSV (traverse)
                </p>
                <p className="lot-plotter-page__export-format-sub" style={{ color: colors.textMuted, margin: 0 }}>
                  Line, N/S, deg, min, E/W, distance (m)
                </p>
              </div>
              <ChevronRight size={20} color={colors.textMuted} />
            </button>
            <div className="lot-plotter-page__export-modal-cancel-wrap">
              <button
                type="button"
                className="lot-plotter-page__export-modal-cancel-text"
                style={{ color: colors.textMuted }}
                onClick={closeExportModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scanModalVisible ? (
        <div className="lot-plotter-page__scan-modal-overlay" role="dialog" aria-modal="true">
          <div className="lot-plotter-page__scan-modal-content" style={{ backgroundColor: colors.cardBg }}>
            <div className="lot-plotter-page__scan-modal-header">
              <h3 className="lot-plotter-page__scan-modal-title" style={{ color: colors.text, margin: 0 }}>
                Upload Data
              </h3>
              <button type="button" className="lot-plotter-page__modal-close-btn" onClick={() => setScanModalVisible(false)}>
                <X size={24} color={colors.text} />
              </button>
            </div>
            <p className="lot-plotter-page__scan-modal-desc">Select a method to upload or scan land title coordinates.</p>
            <div className="lot-plotter-page__scan-modal-actions">
              <button
                type="button"
                className="lot-plotter-page__scan-action-btn"
                style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
                onClick={() => {
                  setScanModalVisible(false)
                  cameraInputRef.current?.click()
                }}
              >
                <Camera size={32} color="#3b5998" />
                <span className="lot-plotter-page__scan-action-text" style={{ color: colors.text }}>
                  Camera
                </span>
              </button>
              <button
                type="button"
                className="lot-plotter-page__scan-action-btn"
                style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
                onClick={() => {
                  setScanModalVisible(false)
                  galleryInputRef.current?.click()
                }}
              >
                <Images size={32} color="#3b5998" />
                <span className="lot-plotter-page__scan-action-text" style={{ color: colors.text }}>
                  Gallery
                </span>
              </button>
              <button
                type="button"
                className="lot-plotter-page__scan-action-btn"
                style={{ backgroundColor: colors.contentBg, borderColor: colors.border }}
                onClick={() => {
                  setScanModalVisible(false)
                  csvInputRef.current?.click()
                }}
              >
                <FileText size={32} color="#3b5998" />
                <span className="lot-plotter-page__scan-action-text" style={{ color: colors.text }}>
                  Upload CSV
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingImagePreviewUrl ? (
        <div className="lot-plotter-page__scan-modal-overlay" role="dialog" aria-modal="true">
          <div
            className="lot-plotter-page__scan-modal-content lot-plotter-page__scan-modal-content--wide"
            style={{ backgroundColor: colors.cardBg }}
          >
            <div className="lot-plotter-page__scan-modal-header">
              <h3 className="lot-plotter-page__scan-modal-title" style={{ color: colors.text, margin: 0 }}>
                Review Image
              </h3>
              <button type="button" className="lot-plotter-page__modal-close-btn" onClick={clearPendingImage}>
                <X size={24} color={colors.text} />
              </button>
            </div>
            <p className="lot-plotter-page__scan-modal-desc">
              Crop/adjust your photo first, then tap OK to proceed with image analysis.
            </p>
            <img src={pendingImagePreviewUrl} alt="Selected land title" className="lot-plotter-page__preview-image" />
            <div className="lot-plotter-page__preview-action-row">
              <button
                type="button"
                className="lot-plotter-page__choose-file-btn"
                style={{ backgroundColor: colors.contentBg }}
                onClick={handleRetakeOrReselect}
              >
                <Crop size={16} color="#3b5998" style={{ marginRight: 6 }} />
                Crop / Change
              </button>
              <button type="button" className="lot-plotter-page__yellow-btn" onClick={handleConfirmAnalyzeImage}>
                <span className="lot-plotter-page__yellow-btn-text">OK Analyze</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LoadingOverlay
        visible={isExporting}
        message={exportLoadingMessage}
        submessage={
          exportLoadingMessage.includes('PDF')
            ? 'Fetching map image and building your report. This may take a few seconds.'
            : undefined
        }
      />
    </div>
  )
}