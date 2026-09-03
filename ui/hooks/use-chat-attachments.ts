"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { isApiError, uploadFile, type FileInfo } from "@/lib/api"
import { getFileExtension } from "@/lib/format-file-size"

export interface PendingAttachment {
  localId: string
  filename: string
  extension: string
  size: number
}

interface UseChatAttachmentsResult {
  /** 已成功上传的附件 */
  attachments: FileInfo[]
  /** 上传中的本地占位项 */
  pending: PendingAttachment[]
  /** 是否有进行中的上传 */
  isUploading: boolean
  /** 选择本地文件后上传；支持多选 */
  uploadFiles: (files: FileList | File[]) => Promise<void>
  /** 从列表移除已上传附件（仅本地状态，不调用删除 API） */
  removeAttachment: (fileId: string) => void
  /** 清空全部附件与上传中占位 */
  clearAttachments: () => void
}

function toErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback
}

function toFileArray(files: FileList | File[]): File[] {
  return Array.isArray(files) ? files : Array.from(files)
}

/**
 * 首页 / 对话输入区附件上传状态。
 * 调用 `POST /files`，成功后将 {@link FileInfo} 追加到列表。
 */
export function useChatAttachments(): UseChatAttachmentsResult {
  const [attachments, setAttachments] = useState<FileInfo[]>([])
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const abortControllersRef = useRef(new Map<string, AbortController>())

  useEffect(() => {
    return () => {
      for (const controller of abortControllersRef.current.values()) {
        controller.abort()
      }
      abortControllersRef.current.clear()
    }
  }, [])

  const removePending = useCallback((localId: string) => {
    setPending((prev) => prev.filter((item) => item.localId !== localId))
    abortControllersRef.current.delete(localId)
  }, [])

  const uploadFiles = useCallback(
    async (input: FileList | File[]) => {
      const files = toFileArray(input)
      if (files.length === 0) return

      await Promise.all(
        files.map(async (file) => {
          const localId = crypto.randomUUID()
          const controller = new AbortController()
          abortControllersRef.current.set(localId, controller)

          setPending((prev) => [
            ...prev,
            {
              localId,
              filename: file.name,
              extension: getFileExtension(file.name),
              size: file.size,
            },
          ])

          try {
            const info = await uploadFile(file, {
              signal: controller.signal,
              filename: file.name,
            })
            if (controller.signal.aborted) return
            setAttachments((prev) => {
              if (prev.some((item) => item.id === info.id)) return prev
              return [...prev, info]
            })
            toast.success(`「${info.filename || file.name}」上传成功`)
          } catch (error) {
            if (controller.signal.aborted) return
            toast.error(toErrorMessage(error, `「${file.name}」上传失败`))
          } finally {
            removePending(localId)
          }
        }),
      )
    },
    [removePending],
  )

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== fileId))
  }, [])

  const clearAttachments = useCallback(() => {
    for (const controller of abortControllersRef.current.values()) {
      controller.abort()
    }
    abortControllersRef.current.clear()
    setPending([])
    setAttachments([])
  }, [])

  return {
    attachments,
    pending,
    isUploading: pending.length > 0,
    uploadFiles,
    removeAttachment,
    clearAttachments,
  }
}
