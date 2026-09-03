"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { isApiError, type FileInfo } from "@/lib/api"
import { launchTask } from "@/lib/launch-task"

export interface StartTaskPayload {
  message: string
  attachmentIds: string[]
  attachmentFiles?: FileInfo[]
}

interface UseStartTaskResult {
  /** 是否正在创建会话 / 发起首聊 */
  isStarting: boolean
  /** 创建任务、发起流式聊天并跳转到会话页 */
  startTask: (payload: StartTaskPayload) => Promise<void>
}

function toErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback
}

/**
 * 首页「发送」：创建新任务会话 → 流式投递消息/附件 → 跳转 `/sessions/{id}`。
 */
export function useStartTask(): UseStartTaskResult {
  const router = useRouter()
  const [isStarting, setIsStarting] = useState(false)
  const inFlightRef = useRef(false)

  const startTask = useCallback(
    async (payload: StartTaskPayload) => {
      const message = payload.message.trim()
      if (!message) {
        toast.error("请输入任务内容")
        return
      }
      if (inFlightRef.current) return

      inFlightRef.current = true
      setIsStarting(true)

      try {
        const sessionId = await launchTask({
          message,
          attachments: payload.attachmentIds,
          attachmentFiles: payload.attachmentFiles,
        })
        router.push(`/sessions/${encodeURIComponent(sessionId)}`)
      } catch (error) {
        inFlightRef.current = false
        setIsStarting(false)
        toast.error(toErrorMessage(error, "创建任务失败，请稍后重试"))
        throw error
      }
    },
    [router],
  )

  return { isStarting, startTask }
}
