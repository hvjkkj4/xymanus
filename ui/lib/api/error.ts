import type { ApiResponse } from "./types"

/**
 * API 业务/网络错误。
 * - `code`：业务码（信封内）或 HTTP 状态码
 * - `status`：HTTP 状态码（若可得）
 */
export class ApiError extends Error {
  readonly code: number
  readonly status?: number
  readonly data?: unknown

  constructor(
    message: string,
    options: { code: number; status?: number; data?: unknown } = { code: -1 },
  ) {
    super(message)
    this.name = "ApiError"
    this.code = options.code
    this.status = options.status
    this.data = options.data
  }

  static fromResponse(payload: ApiResponse, status?: number): ApiError {
    return new ApiError(payload.msg || "请求失败", {
      code: payload.code,
      status,
      data: payload.data,
    })
  }

  static fromHttp(status: number, statusText: string, body?: unknown): ApiError {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "msg" in body &&
      typeof (body as { msg: unknown }).msg === "string"
        ? (body as { msg: string }).msg
        : statusText || `HTTP ${status}`

    const code =
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof (body as { code: unknown }).code === "number"
        ? (body as { code: number }).code
        : status

    const data =
      typeof body === "object" && body !== null && "data" in body
        ? (body as { data: unknown }).data
        : body

    return new ApiError(msg, { code, status, data })
  }

  static network(cause?: unknown): ApiError {
    const message =
      cause instanceof Error ? cause.message : "网络异常，请检查连接后重试"
    return new ApiError(message, { code: 0 })
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
