/**
 * 将 Unix 秒级时间戳格式化为相对时间文案（如「3分钟前」「2个月前」）。
 */
export function formatRelativeTime(
  unixSeconds: number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return ""

  const diffMs = Math.max(0, nowMs - unixSeconds * 1000)
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return "刚刚"

  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟前`

  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}小时前`

  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}天前`

  const month = Math.floor(day / 30)
  if (month < 12) return `${month}个月前`

  return `${Math.floor(month / 12)}年前`
}
