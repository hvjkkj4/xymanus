import { ApiError } from "./error"
import { requestRaw } from "./client"

export interface SSEMessage {
  event: string
  data: string
  id?: string
  retry?: number
}

export interface StreamSSEOptions {
  method?: "GET" | "POST"
  /** JSON 请求体；与 body 互斥，优先使用 json */
  json?: unknown
  body?: BodyInit | null
  headers?: HeadersInit
  signal?: AbortSignal
  /** 收到 SSE 注释行（以 `:` 开头）时回调，可用于心跳 */
  onComment?: (comment: string) => void
}

/**
 * 解析 SSE 文本流（兼容 POST + text/event-stream）。
 * 原生 EventSource 仅支持 GET，聊天等接口需走 fetch + 本解析器。
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  options?: { signal?: AbortSignal; onComment?: (comment: string) => void },
): AsyncGenerator<SSEMessage, void, undefined> {
  const reader = stream.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""

  let eventName = "message"
  let dataLines: string[] = []
  let eventId: string | undefined
  let retry: number | undefined

  const reset = () => {
    eventName = "message"
    dataLines = []
    eventId = undefined
    retry = undefined
  }

  const flush = (): SSEMessage | null => {
    if (dataLines.length === 0 && eventName === "message" && !eventId) {
      reset()
      return null
    }
    const message: SSEMessage = {
      event: eventName || "message",
      data: dataLines.join("\n"),
    }
    if (eventId !== undefined) message.id = eventId
    if (retry !== undefined) message.retry = retry
    reset()
    return message
  }

  try {
    while (true) {
      if (options?.signal?.aborted) {
        break
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      // SSE 事件以空行分隔；兼容 \r\n
      const parts = buffer.split(/\r?\n/)
      buffer = parts.pop() ?? ""

      for (const rawLine of parts) {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine

        if (line === "") {
          const message = flush()
          if (message) yield message
          continue
        }

        if (line.startsWith(":")) {
          options?.onComment?.(line.slice(1).trimStart())
          continue
        }

        const colonIndex = line.indexOf(":")
        const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
        let valuePart = colonIndex === -1 ? "" : line.slice(colonIndex + 1)
        if (valuePart.startsWith(" ")) valuePart = valuePart.slice(1)

        switch (field) {
          case "event":
            eventName = valuePart
            break
          case "data":
            dataLines.push(valuePart)
            break
          case "id":
            eventId = valuePart
            break
          case "retry": {
            const parsed = Number.parseInt(valuePart, 10)
            if (!Number.isNaN(parsed)) retry = parsed
            break
          }
          default:
            break
        }
      }
    }

    // 流结束时若仍有缓冲行，尝试 flush 最后一块
    if (buffer.length > 0) {
      const line = buffer
      if (line.startsWith(":")) {
        options?.onComment?.(line.slice(1).trimStart())
      } else if (line.length > 0) {
        const colonIndex = line.indexOf(":")
        const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
        let valuePart = colonIndex === -1 ? "" : line.slice(colonIndex + 1)
        if (valuePart.startsWith(" ")) valuePart = valuePart.slice(1)
        if (field === "event") eventName = valuePart
        else if (field === "data") dataLines.push(valuePart)
        else if (field === "id") eventId = valuePart
      }
    }

    const trailing = flush()
    if (trailing) yield trailing
  } finally {
    reader.releaseLock()
  }
}

function parseJSONData<T>(data: string): T {
  if (!data) {
    return {} as T
  }
  try {
    return JSON.parse(data) as T
  } catch (cause) {
    throw new ApiError("SSE 数据 JSON 解析失败", {
      code: -1,
      data: { raw: data, cause },
    })
  }
}

/**
 * 发起 SSE 请求并产出解析后的事件（data 已 JSON.parse）。
 */
export async function* streamSSE<TData = unknown>(
  path: string,
  options: StreamSSEOptions = {},
): AsyncGenerator<{ event: string; data: TData; id?: string }, void, undefined> {
  const { method = "GET", json, body, headers, signal, onComment } = options

  const requestHeaders = new Headers(headers)
  let requestBody: BodyInit | null | undefined = body

  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json")
    requestBody = JSON.stringify(json)
  }

  requestHeaders.set("Accept", "text/event-stream")

  const response = await requestRaw(path, {
    method,
    headers: requestHeaders,
    body: requestBody,
    signal,
  })

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("text/event-stream") && !response.body) {
    throw new ApiError("服务器未返回事件流", {
      code: response.status,
      status: response.status,
    })
  }

  if (!response.body) {
    throw new ApiError("响应体为空，无法读取事件流", {
      code: response.status,
      status: response.status,
    })
  }

  for await (const message of parseSSEStream(response.body, { signal, onComment })) {
    yield {
      event: message.event,
      data: parseJSONData<TData>(message.data),
      id: message.id,
    }
  }
}

/**
 * 将 AsyncGenerator 转为可取消的订阅式回调（便于在 React 中使用）。
 */
function mergeAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal {
  const controller = new AbortController()
  const onAbort = () => {
    controller.abort()
    cleanup()
  }
  const cleanups: Array<() => void> = []
  const cleanup = () => {
    for (const fn of cleanups) fn()
    cleanups.length = 0
  }

  for (const signal of signals) {
    if (!signal) continue
    if (signal.aborted) {
      controller.abort()
      cleanup()
      return controller.signal
    }
    signal.addEventListener("abort", onAbort, { once: true })
    cleanups.push(() => signal.removeEventListener("abort", onAbort))
  }

  return controller.signal
}

/**
 * 将 AsyncGenerator 转为可取消的订阅式回调（便于在 React 中使用）。
 */
export function subscribeSSE<TData = unknown>(
  path: string,
  handlers: {
    onEvent: (event: string, data: TData) => void
    onError?: (error: unknown) => void
    onDone?: () => void
  },
  options?: StreamSSEOptions,
): { abort: () => void; done: Promise<void> } {
  const localController = new AbortController()
  const signal = mergeAbortSignals(options?.signal, localController.signal)

  const done = (async () => {
    try {
      for await (const item of streamSSE<TData>(path, { ...options, signal })) {
        handlers.onEvent(item.event, item.data)
      }
      handlers.onDone?.()
    } catch (error) {
      if (signal.aborted) {
        handlers.onDone?.()
        return
      }
      handlers.onError?.(error)
    }
  })()

  return {
    abort: () => localController.abort(),
    done,
  }
}
