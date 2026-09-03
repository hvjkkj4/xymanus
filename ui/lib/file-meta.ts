import { getFileExtension } from "@/lib/format-file-size"
import type { FileInfo } from "@/lib/api"

type FileMetaFallback = {
  filename?: string
  extension?: string
  size?: number
  mime_type?: string
  filepath?: string
  key?: string
}

/** 上传成功后缓存完整元信息，弥补接口/SSE 常返回空 filename、size=0 */
const uploadedFileMeta = new Map<string, FileInfo>()

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * 补齐文件展示字段：优先用接口值，缺失时用本地上传信息或从文件名推断扩展名。
 */
export function normalizeFileInfo(
  file: Partial<FileInfo> & { id: string },
  fallback?: FileMetaFallback,
): FileInfo {
  const filename =
    asTrimmed(file.filename) ||
    asTrimmed(fallback?.filename) ||
    asTrimmed(file.filepath) ||
    asTrimmed(fallback?.filepath)

  const extension = (
    asTrimmed(file.extension) ||
    asTrimmed(fallback?.extension) ||
    getFileExtension(filename)
  ).replace(/^\./, "")

  const rawSize = file.size ?? fallback?.size ?? 0
  const size =
    typeof rawSize === "number" && Number.isFinite(rawSize) && rawSize > 0
      ? rawSize
      : typeof fallback?.size === "number" &&
          Number.isFinite(fallback.size) &&
          fallback.size > 0
        ? fallback.size
        : typeof rawSize === "number" && Number.isFinite(rawSize)
          ? rawSize
          : 0

  return {
    id: file.id,
    filename,
    filepath: asTrimmed(file.filepath) || asTrimmed(fallback?.filepath),
    key: asTrimmed(file.key) || asTrimmed(fallback?.key),
    extension,
    mime_type: asTrimmed(file.mime_type) || asTrimmed(fallback?.mime_type),
    size,
  }
}

/** 用浏览器 File 对象补齐上传接口返回的元信息 */
export function enrichFileInfoFromBrowserFile(
  info: FileInfo,
  file: File,
): FileInfo {
  return normalizeFileInfo(info, {
    filename: file.name,
    extension: getFileExtension(file.name),
    size: file.size,
    mime_type: file.type,
  })
}

export function rememberUploadedFile(file: FileInfo): FileInfo {
  const normalized = normalizeFileInfo(file)
  if (normalized.id) {
    const prev = uploadedFileMeta.get(normalized.id)
    const merged = prev
      ? normalizeFileInfo(normalized, prev)
      : normalized
    uploadedFileMeta.set(merged.id, merged)
    return merged
  }
  return normalized
}

/** 展示 / 时间线：用上传缓存补齐空文件名与大小 */
export function resolveFileInfo(file: FileInfo): FileInfo {
  const cached = uploadedFileMeta.get(file.id)
  return cached ? normalizeFileInfo(file, cached) : normalizeFileInfo(file)
}

export function resolveFileInfoList(files: FileInfo[] | null | undefined): FileInfo[] {
  if (!files?.length) return []
  return files.map(resolveFileInfo)
}

/** 展示名：绝不回退成 UUID id */
export function getFileDisplayName(file: Pick<FileInfo, "filename" | "filepath">): string {
  return asTrimmed(file.filename) || asTrimmed(file.filepath) || "未命名文件"
}
