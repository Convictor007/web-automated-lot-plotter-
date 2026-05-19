export type NotificationKind = 'success' | 'error' | 'info'

export type NotificationState = {
  message: string
  kind: NotificationKind
} | null
