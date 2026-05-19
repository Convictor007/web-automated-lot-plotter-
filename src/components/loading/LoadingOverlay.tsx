import { Loader2 } from 'lucide-react'
import './LoadingOverlay.css'

export interface LoadingOverlayProps {
  /** When false, nothing is rendered. */
  visible: boolean
  message?: string
  submessage?: string
}

/**
 * Full-screen blocking overlay for long-running client tasks (export, etc.).
 */
export function LoadingOverlay({
  visible,
  message = 'Please wait…',
  submessage,
}: LoadingOverlayProps) {
  if (!visible) return null

  return (
    <div
      className="loading-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="loading-overlay__card">
        <Loader2 className="loading-overlay__spinner" size={40} aria-hidden />
        <p className="loading-overlay__message">{message}</p>
        {submessage ? <p className="loading-overlay__submessage">{submessage}</p> : null}
      </div>
    </div>
  )
}
