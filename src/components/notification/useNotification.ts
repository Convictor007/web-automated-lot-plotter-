import { useCallback, useState } from 'react'
import type { NotificationKind, NotificationState } from './notification-types'

export function useNotification() {
  const [notification, setNotification] = useState<NotificationState>(null)

  const show = useCallback((message: string, kind: NotificationKind = 'info') => {
    setNotification({ message, kind })
  }, [])

  const dismiss = useCallback(() => {
    setNotification(null)
  }, [])

  return { notification, show, dismiss }
}
