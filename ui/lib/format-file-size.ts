const UNITS = ["B", "KB", "MB", "GB", "TB"] as const

/**
 * 将字节数格式化为可读大小（如 `2.9 MB`）。
 * 非法或负数按 `0 B` 处理。
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"

  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${UNITS[unitIndex]}`
}

/** 从文件名提取扩展名（小写、不含点）；无扩展名时返回空字符串 */
export function getFileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return ""
  return base.slice(dot + 1).toLowerCase()
}
