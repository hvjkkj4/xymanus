import { get, getApiBaseUrl, getWebSocketBaseUrl, post } from "./client";
import type { RequestOptions } from "./client";
import { streamSSE, subscribeSSE } from "./sse";
import type {
  AgentSSEEvent,
  ChatRequest,
  CreateSessionResponse,
  FileReadRequest,
  FileReadResponse,
  GetSessionFilesResponse,
  GetSessionResponse,
  ListSessionResponse,
  ShellReadRequest,
  ShellReadResponse,
} from "./types";

const PREFIX = "/sessions";

/** 创建空白任务会话 */
export function createSession(
  options?: RequestOptions,
): Promise<CreateSessionResponse> {
  return post<CreateSessionResponse>(PREFIX, null, options);
}

/** 获取会话列表基础信息 */
export function listSessions(
  options?: RequestOptions,
): Promise<ListSessionResponse> {
  return get<ListSessionResponse>(PREFIX, options);
}

/** 获取指定会话详情（含历史事件） */
export function getSession(
  sessionId: string,
  options?: RequestOptions,
): Promise<GetSessionResponse> {
  return get<GetSessionResponse>(
    `${PREFIX}/${encodeURIComponent(sessionId)}`,
    options,
  );
}

/** 删除指定任务会话 */
export function deleteSession(
  sessionId: string,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(
    `${PREFIX}/${encodeURIComponent(sessionId)}/delete`,
    null,
    options,
  );
}

/** 停止指定任务会话 */
export function stopSession(
  sessionId: string,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(`${PREFIX}/${encodeURIComponent(sessionId)}/stop`, null, options);
}

/** 清除未读消息数 */
export function clearUnreadMessageCount(
  sessionId: string,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(
    `${PREFIX}/${encodeURIComponent(sessionId)}/clear-unread-message-count`,
    null,
    options,
  );
}

/** 获取会话关联文件列表 */
export function getSessionFiles(
  sessionId: string,
  options?: RequestOptions,
): Promise<GetSessionFilesResponse> {
  return get<GetSessionFilesResponse>(
    `${PREFIX}/${encodeURIComponent(sessionId)}/files`,
    options,
  );
}

/** 读取沙箱中指定文件内容 */
export function readSessionFile(
  sessionId: string,
  payload: FileReadRequest,
  options?: RequestOptions,
): Promise<FileReadResponse> {
  return post<FileReadResponse>(
    `${PREFIX}/${encodeURIComponent(sessionId)}/file`,
    payload,
    options,
  );
}

/** 读取沙箱 Shell 输出 */
export function readSessionShell(
  sessionId: string,
  payload: ShellReadRequest,
  options?: RequestOptions,
): Promise<ShellReadResponse> {
  return post<ShellReadResponse>(
    `${PREFIX}/${encodeURIComponent(sessionId)}/shell`,
    payload,
    options,
  );
}

/** 将会话 VNC WebSocket URL（浏览器侧 noVNC 使用） */
export function getSessionVncWsUrl(sessionId: string): string {
  // noVNC 已经托管在后端 /api/sessions/{id}/vnc 路由上。
  // 通过环境变量或默认 host 生成，避免 Docker/本机环境下写死 localhost。
  return `${getWebSocketBaseUrl()}/sessions/${encodeURIComponent(sessionId)}/vnc`;
}

/**
 * 流式拉取会话列表（后端每隔约 5s 推送 `sessions` 事件）。
 *
 * @example
 * ```ts
 * const ac = new AbortController()
 * for await (const evt of streamSessions({ signal: ac.signal })) {
 *   console.log(evt.data.sessions)
 * }
 * ```
 */
export async function* streamSessions(
  options?: RequestOptions,
): AsyncGenerator<
  { event: "sessions"; data: ListSessionResponse },
  void,
  undefined
> {
  for await (const item of streamSSE<ListSessionResponse>(`${PREFIX}/stream`, {
    method: "POST",
    signal: options?.signal,
    headers: options?.headers,
  })) {
    if (item.event === "sessions") {
      yield { event: "sessions", data: item.data };
    }
  }
}

/**
 * 订阅会话列表流（回调风格，适合 React useEffect）。
 */
export function subscribeSessionsStream(
  handlers: {
    onSessions: (data: ListSessionResponse) => void;
    onError?: (error: unknown) => void;
    onDone?: () => void;
  },
  options?: RequestOptions,
): { abort: () => void; done: Promise<void> } {
  return subscribeSSE<ListSessionResponse>(
    `${PREFIX}/stream`,
    {
      onEvent: (event, data) => {
        if (event === "sessions") handlers.onSessions(data);
      },
      onError: handlers.onError,
      onDone: handlers.onDone,
    },
    {
      method: "POST",
      signal: options?.signal,
      headers: options?.headers,
    },
  );
}

/**
 * 向指定会话发起聊天，产出 Agent SSE 事件流。
 *
 * 事件类型：`message` | `title` | `step` | `plan` | `tool` | `done` | `wait` | `error`
 */
export async function* chatStream(
  sessionId: string,
  payload: ChatRequest = {},
  options?: RequestOptions,
): AsyncGenerator<AgentSSEEvent, void, undefined> {
  const body: ChatRequest = {
    message: payload.message ?? null,
    attachments: payload.attachments ?? [],
    event_id: payload.event_id ?? null,
    timestamp: payload.timestamp ?? Math.floor(Date.now() / 1000),
  };

  for await (const item of streamSSE<AgentSSEEvent["data"]>(
    `${PREFIX}/${encodeURIComponent(sessionId)}/chat`,
    {
      method: "POST",
      json: body,
      signal: options?.signal,
      headers: options?.headers,
    },
  )) {
    yield normalizeAgentSSEEvent(item.event, item.data);
  }
}

/**
 * 订阅聊天事件流（回调风格）。
 */
export function subscribeChatStream(
  sessionId: string,
  payload: ChatRequest,
  handlers: {
    onEvent: (event: AgentSSEEvent) => void;
    onError?: (error: unknown) => void;
    onDone?: () => void;
  },
  options?: RequestOptions,
): { abort: () => void; done: Promise<void> } {
  const body: ChatRequest = {
    message: payload.message ?? null,
    attachments: payload.attachments ?? [],
    event_id: payload.event_id ?? null,
    timestamp: payload.timestamp ?? Math.floor(Date.now() / 1000),
  };

  return subscribeSSE<AgentSSEEvent["data"]>(
    `${PREFIX}/${encodeURIComponent(sessionId)}/chat`,
    {
      onEvent: (event, data) => {
        handlers.onEvent(normalizeAgentSSEEvent(event, data));
      },
      onError: handlers.onError,
      onDone: handlers.onDone,
    },
    {
      method: "POST",
      json: body,
      signal: options?.signal,
      headers: options?.headers,
    },
  );
}

function normalizeAgentSSEEvent(
  event: string,
  data: AgentSSEEvent["data"],
): AgentSSEEvent {
  switch (event) {
    case "message":
      return {
        event: "message",
        data: data as Extract<AgentSSEEvent, { event: "message" }>["data"],
      };
    case "title":
      return {
        event: "title",
        data: data as Extract<AgentSSEEvent, { event: "title" }>["data"],
      };
    case "step":
      return {
        event: "step",
        data: data as Extract<AgentSSEEvent, { event: "step" }>["data"],
      };
    case "plan":
      return {
        event: "plan",
        data: data as Extract<AgentSSEEvent, { event: "plan" }>["data"],
      };
    case "tool":
      return {
        event: "tool",
        data: data as Extract<AgentSSEEvent, { event: "tool" }>["data"],
      };
    case "done":
      return {
        event: "done",
        data: data as Extract<AgentSSEEvent, { event: "done" }>["data"],
      };
    case "wait":
      return {
        event: "wait",
        data: data as Extract<AgentSSEEvent, { event: "wait" }>["data"],
      };
    case "error":
      return {
        event: "error",
        data: data as Extract<AgentSSEEvent, { event: "error" }>["data"],
      };
    default:
      return {
        event,
        data: data as Extract<AgentSSEEvent, { event: string }>["data"] &
          Record<string, unknown>,
      };
  }
}
