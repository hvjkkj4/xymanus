/** 统一 API 响应信封（与后端 Response[T] 对齐） */
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

/** 会话状态 */
export type SessionStatus = "pending" | "running" | "waiting" | "completed"

/** 规划/步骤执行状态 */
export type ExecutionStatus = "pending" | "running" | "completed" | "failed"

/** 工具调用状态 */
export type ToolEventStatus = "calling" | "called"

/** MCP 传输协议 */
export type MCPTransport = "stdio" | "sse" | "streamable_http"

/** 消息角色 */
export type MessageRole = "user" | "assistant"

/** 文件信息 */
export interface FileInfo {
  id: string
  filename: string
  filepath: string
  key: string
  extension: string
  mime_type: string
  size: number
}

// ---------------------------------------------------------------------------
// 配置模块
// ---------------------------------------------------------------------------

export interface LLMConfig {
  base_url: string
  /** GET 时不返回；POST 时为空字符串表示不更新 */
  api_key?: string
  model_name: string
  temperature: number
  max_tokens: number
}

export interface AgentConfig {
  max_iterations: number
  max_retries: number
  max_search_results: number
}

export interface MCPServerConfig {
  transport?: MCPTransport
  enabled?: boolean
  description?: string | null
  env?: Record<string, unknown> | null
  command?: string | null
  args?: string[] | null
  url?: string | null
  headers?: Record<string, unknown> | null
}

/** 新增 MCP 配置请求体（字段名与后端一致，使用 camelCase） */
export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

export interface ListMCPServerItem {
  server_name: string
  enabled: boolean
  transport: MCPTransport
  tools: string[]
}

export interface ListMCPServerResponse {
  mcp_servers: ListMCPServerItem[]
}

export interface ListA2AServerItem {
  id: string
  name: string
  description: string
  input_modes: string[]
  output_modes: string[]
  streaming: boolean
  push_notifications: boolean
  enabled: boolean
}

export interface ListA2AServerResponse {
  a2a_servers: ListA2AServerItem[]
}

export interface SetEnabledRequest {
  enabled: boolean
}

export interface CreateA2AServerRequest {
  base_url: string
}

// ---------------------------------------------------------------------------
// 会话模块
// ---------------------------------------------------------------------------

export interface CreateSessionResponse {
  session_id: string
}

export interface ListSessionItem {
  session_id: string
  title: string
  latest_message: string
  /** ISO 8601 字符串或 null */
  latest_message_at: string | null
  /** 会话创建时间；无最新消息时用于展示/排序 */
  created_at: string
  status: SessionStatus
  unread_message_count: number
}

export interface ListSessionResponse {
  sessions: ListSessionItem[]
}

export interface ChatRequest {
  message?: string | null
  /** 附件文件 id 列表 */
  attachments?: string[]
  /** 最新事件 id，用于断点续传 */
  event_id?: string | null
  /** Unix 时间戳（秒） */
  timestamp?: number | null
}

export interface GetSessionResponse {
  session_id: string
  title?: string | null
  status: SessionStatus
  events: AgentSSEEvent[]
}

export interface GetSessionFilesResponse {
  files: FileInfo[]
}

export interface FileReadRequest {
  filepath: string
}

export interface FileReadResponse {
  filepath: string
  content: string
}

export interface ShellReadRequest {
  /** Shell 会话 id（非任务会话 id） */
  session_id: string
}

export interface ConsoleRecord {
  ps1: string
  command: string
  output: string
}

export interface ShellReadResponse {
  session_id: string
  output: string
  console_records: ConsoleRecord[]
}

// ---------------------------------------------------------------------------
// SSE 事件
// ---------------------------------------------------------------------------

/** 流式事件公共字段 */
export interface BaseEventData {
  event_id?: string | null
  /** Unix 时间戳（秒） */
  created_at: number
}

export interface MessageEventData extends BaseEventData {
  role: MessageRole
  message: string
  attachments: FileInfo[]
}

export interface TitleEventData extends BaseEventData {
  title: string
}

export interface StepEventData extends BaseEventData {
  id: string
  status: ExecutionStatus
  description: string
}

export interface PlanEventData extends BaseEventData {
  steps: StepEventData[]
}

export interface ToolEventData extends BaseEventData {
  tool_call_id: string
  name: string
  status: ToolEventStatus
  function: string
  args: Record<string, unknown>
  content?: unknown
}

export interface ErrorEventData extends BaseEventData {
  error: string
}

export type AgentSSEEventType =
  | "message"
  | "title"
  | "step"
  | "plan"
  | "tool"
  | "done"
  | "wait"
  | "error"

export interface MessageSSEEvent {
  event: "message"
  data: MessageEventData
}

export interface TitleSSEEvent {
  event: "title"
  data: TitleEventData
}

export interface StepSSEEvent {
  event: "step"
  data: StepEventData
}

export interface PlanSSEEvent {
  event: "plan"
  data: PlanEventData
}

export interface ToolSSEEvent {
  event: "tool"
  data: ToolEventData
}

export interface DoneSSEEvent {
  event: "done"
  data: BaseEventData
}

export interface WaitSSEEvent {
  event: "wait"
  data: BaseEventData
}

export interface ErrorSSEEvent {
  event: "error"
  data: ErrorEventData
}

/** 未识别事件回退类型 */
export interface CommonSSEEvent {
  event: string
  data: BaseEventData & Record<string, unknown>
}

export type AgentSSEEvent =
  | MessageSSEEvent
  | TitleSSEEvent
  | StepSSEEvent
  | PlanSSEEvent
  | ToolSSEEvent
  | DoneSSEEvent
  | WaitSSEEvent
  | ErrorSSEEvent
  | CommonSSEEvent

/** 会话列表流式推送事件 */
export interface SessionsStreamEvent {
  event: "sessions"
  data: ListSessionResponse
}
