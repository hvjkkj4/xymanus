import { ApiError } from "./error";
import type { ApiResponse } from "./types";

const DEFAULT_BROWSER_BASE_URL = "/api";
const DEFAULT_SERVER_BASE_URL = "http://localhost:8000/api";

/** 解析 API 基址，去掉末尾斜杠 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const raw =
    configured ||
    (typeof window === "undefined"
      ? process.env.INTERNAL_API_BASE_URL?.trim() || DEFAULT_SERVER_BASE_URL
      : DEFAULT_BROWSER_BASE_URL);
  return raw.replace(/\/+$/, "");
}

export function getWebSocketBaseUrl(): string {
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/^http/, "ws");
}

export interface RequestOptions {
  /** 查询参数 */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 额外请求头 */
  headers?: HeadersInit;
  /** 取消信号 */
  signal?: AbortSignal;
  /**
   * 跳过信封解析（如下载流、原始响应）。
   * 为 true 时返回 Response 本体。
   */
  raw?: boolean;
}

type JsonBody = object | unknown[] | null;

type RequestInitWithOptions = Omit<RequestInit, "signal" | "headers"> &
  RequestOptions;

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = getApiBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const isRelativeBase = base.startsWith("/");
  const url = new URL(
    `${base}${normalized}`,
    isRelativeBase ? "http://localhost" : undefined,
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return isRelativeBase ? `${url.pathname}${url.search}` : url.toString();
}

function mergeHeaders(init?: HeadersInit, extras?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (extras) {
    new Headers(extras).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isApiEnvelope(value: unknown): value is ApiResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as ApiResponse).code === "number" &&
    "msg" in value &&
    typeof (value as ApiResponse).msg === "string"
  );
}

/**
 * 底层 fetch 封装：拼接基址、处理网络错误、解析 `{ code, msg, data }` 信封。
 * `code !== 200` 时抛出 {@link ApiError}。
 */
export async function request<T>(
  path: string,
  init?: RequestInitWithOptions,
): Promise<T> {
  const {
    query,
    headers: extraHeaders,
    raw,
    signal,
    ...fetchInit
  } = init ?? {};
  const url = buildUrl(path, query);
  const headers = mergeHeaders(extraHeaders);

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchInit,
      headers,
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) {
      throw cause;
    }
    throw ApiError.network(cause);
  }

  if (raw) {
    if (!response.ok) {
      const body = await parseJsonSafe(response);
      throw ApiError.fromHttp(response.status, response.statusText, body);
    }
    return response as unknown as T;
  }

  const body = await parseJsonSafe(response);

  if (!response.ok) {
    throw ApiError.fromHttp(response.status, response.statusText, body);
  }

  if (!isApiEnvelope(body)) {
    throw new ApiError("响应格式异常", {
      code: response.status,
      status: response.status,
      data: body,
    });
  }

  if (body.code !== 200) {
    throw ApiError.fromResponse(body, response.status);
  }

  return body.data as T;
}

/** JSON GET */
export function get<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: "GET" });
}

/** JSON POST */
export function post<T>(
  path: string,
  body?: JsonBody,
  options?: RequestOptions,
): Promise<T> {
  const headers = mergeHeaders(
    body !== undefined ? { "Content-Type": "application/json" } : undefined,
    options?.headers,
  );
  return request<T>(path, {
    ...options,
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** multipart/form-data POST（勿手动设置 Content-Type，由浏览器带 boundary） */
export function postForm<T>(
  path: string,
  formData: FormData,
  options?: RequestOptions,
): Promise<T> {
  return request<T>(path, {
    ...options,
    method: "POST",
    body: formData,
  });
}

/**
 * 发起可被 AbortSignal 取消的原始请求（用于 SSE / 文件流）。
 * 不解析业务信封；HTTP 非 2xx 时抛错。
 */
export async function requestRaw(
  path: string,
  init?: Omit<RequestInitWithOptions, "raw">,
): Promise<Response> {
  return request<Response>(path, { ...init, raw: true });
}
