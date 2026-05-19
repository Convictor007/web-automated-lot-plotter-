import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { NotificationState } from './notification-types'
import './Notification.css'

export type NotificationProps = {
  notification: NotificationState
  onDismiss: () => void
  autoDismissMs?: number
}

export function Notification({
  notification,
  onDismiss,
  autoDismissMs = 4500,
}: NotificationProps) {
  useEffect(() => {
    if (!notification) return
    const t = window.setTimeout(onDismiss, autoDismissMs)
    return () => window.clearTimeout(t)
  }, [notification, onDismiss, autoDismissMs])

  if (!notification) return null

  const Icon =
    notification.kind === 'success'
      ? CheckCircle2
      : notification.kind === 'error'
        ? AlertCircle
        : Info

  return (
    <div className={`app-notification app-notification--${notification.kind}`} role="status">
      <Icon size={20} className="app-notification__icon" aria-hidden />
      <span className="app-notification__text">{notification.message}</span>
      <button
        type="button"
        className="app-notification__close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X size={18} />
      </button>
    </div>
  )
}
