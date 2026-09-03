const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** 会话活跃时间：优先最新消息，否则回退创建时间 */
export function getSessionActivityAt(session: {
  latest_message_at?: string | null
  created_at?: string | null
}): string | null {
  return session.latest_message_at ?? session.created_at ?? null
}

/**
 * 将会话活跃时间格式化为侧栏展示文案。
 * - 今天 → 今天
 * - 昨天 → 昨天
 * - 近 7 天 → 周X
 * - 同年 → M/D
 * - 跨年 → YYYY/M/D
 */
export function formatSessionTime(
  activityAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!activityAt) return ""

  const date = new Date(activityAt)
  if (Number.isNaN(date.getTime())) return ""

  const today = startOfDay(now)
  const target = startOfDay(date)
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000),
  )

  if (diffDays === 0) return "今天"
  if (diffDays === 1) return "昨天"
  if (diffDays > 1 && diffDays < 7) return WEEKDAY_LABELS[date.getDay()]

  const month = date.getMonth() + 1
  const day = date.getDate()
  if (date.getFullYear() === now.getFullYear()) {
    return `${month}/${day}`
  }

  return `${date.getFullYear()}/${month}/${day}`
}
