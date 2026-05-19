import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMapSettings,
  setPolygonColor,
  toggleAreaLabel,
  toggleDistanceLabels,
  type MapSettings,
} from './map-settings'

export interface UseMapSettingsOptions {
  /** Sync polygon color when parent polygon color changes */
  polygonColorFromProp?: string | null
  /** Reset to defaults when map modal opens */
  resetWhenVisible?: boolean
  visible?: boolean
}

export function useMapSettings(options: UseMapSettingsOptions = {}) {
  const { polygonColorFromProp, resetWhenVisible = true, visible = true } = options

  const [settings, setSettings] = useState<MapSettings>(() =>
    createMapSettings({ polygonColorFromProp })
  )

  const wasVisibleRef = useRef(false)
  useEffect(() => {
    if (!resetWhenVisible) return
    if (visible && !wasVisibleRef.current) {
      setSettings(createMapSettings({ polygonColorFromProp }))
    }
    wasVisibleRef.current = visible
  }, [visible, resetWhenVisible, polygonColorFromProp])

  const setShowAreaLabel = useCallback((showAreaLabel: boolean) => {
    setSettings((prev) => ({ ...prev, showAreaLabel }))
  }, [])

  const setShowDistanceLabels = useCallback((showDistanceLabels: boolean) => {
    setSettings((prev) => ({ ...prev, showDistanceLabels }))
  }, [])

  const onToggleAreaLabel = useCallback(() => {
    setSettings(toggleAreaLabel)
  }, [])

  const onToggleDistanceLabels = useCallback(() => {
    setSettings(toggleDistanceLabels)
  }, [])

  const onPolygonColorChange = useCallback((color: string) => {
    setSettings((prev) => setPolygonColor(prev, color))
  }, [])

  return {
    settings,
    showAreaLabel: settings.showAreaLabel,
    showDistanceLabels: settings.showDistanceLabels,
    polygonColor: settings.polygonColor,
    setShowAreaLabel,
    setShowDistanceLabels,
    onToggleAreaLabel,
    onToggleDistanceLabels,
    onPolygonColorChange,
  }
}
