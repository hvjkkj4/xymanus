import { get, getApiBaseUrl, postForm, requestRaw } from "./client"
import type { RequestOptions } from "./client"
import type { FileInfo } from "./types"
import {
  enrichFileInfoFromBrowserFile,
  rememberUploadedFile,
} from "@/lib/file-meta"

const PREFIX = "/files"

/**
 * 上传对话附件（multipart/form-data，字段名 `file`）。
 * 会显式带上原文件名，并用本地 File 元信息补齐接口可能返回的空字段。
 */
export function uploadFile(
  file: File | Blob,
  options?: RequestOptions & { filename?: string },
): Promise<FileInfo> {
  const formData = new FormData()
  if (file instanceof File) {
    const filename = options?.filename?.trim() || file.name || "file"
    formData.append("file", file, filename)
    return postForm<FileInfo>(PREFIX, formData, options).then((info) =>
      rememberUploadedFile(enrichFileInfoFromBrowserFile(info, file)),
    )
  }

  const filename = options?.filename?.trim() || "blob"
  formData.append("file", file, filename)
  return postForm<FileInfo>(PREFIX, formData, options).then((info) =>
    rememberUploadedFile({
      ...info,
      filename: info.filename?.trim() || filename,
    }),
  )
}

/** 获取文件元信息 */
export function getFileInfo(
  fileId: string,
  options?: RequestOptions,
): Promise<FileInfo> {
  return get<FileInfo>(`${PREFIX}/${encodeURIComponent(fileId)}`, options).then(
    rememberUploadedFile,
  )
}

/**
 * 下载文件，返回原始 Response（可用于 blob / stream）。
 * 该接口不走 `{ code, msg, data }` 信封。
 */
export function downloadFile(
  fileId: string,
  options?: RequestOptions,
): Promise<Response> {
  return requestRaw(`${PREFIX}/${encodeURIComponent(fileId)}/download`, {
    method: "GET",
    ...options,
  })
}

/** 下载文件并转为 Blob */
export async function downloadFileBlob(
  fileId: string,
  options?: RequestOptions,
): Promise<Blob> {
  const response = await downloadFile(fileId, options)
  return response.blob()
}

/**
 * 触发浏览器下载（客户端专用）。
 * 会创建临时 Object URL 并自动清理。
 */
export async function downloadFileToDisk(
  fileId: string,
  options?: RequestOptions & { filename?: string },
): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("downloadFileToDisk 仅可在浏览器环境调用")
  }

  const response = await downloadFile(fileId, options)
  const blob = await response.blob()

  const filename =
    options?.filename ??
    parseFilenameFromContentDisposition(
      response.headers.get("Content-Disposition"),
    ) ??
    fileId

  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = filename
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** 拼接文件下载直链（适合 `<a href>` / 新窗口打开） */
export function getFileDownloadUrl(fileId: string): string {
  return `${getApiBaseUrl()}${PREFIX}/${encodeURIComponent(fileId)}/download`
}

function parseFilenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) return null

  // filename*=utf-8''...
  const starred = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (starred?.[1]) {
    try {
      return decodeURIComponent(starred[1].trim().replace(/^"|"$/g, ""))
    } catch {
      return starred[1].trim().replace(/^"|"$/g, "")
    }
  }

  const plain = /filename\s*=\s*("?)([^";]+)\1/i.exec(header)
  return plain?.[2]?.trim() ?? null
}
