export { ApiError, isApiError } from "./error"
export {
  getApiBaseUrl,
  request,
  requestRaw,
  get,
  post,
  postForm,
  type RequestOptions,
} from "./client"
export {
  parseSSEStream,
  streamSSE,
  subscribeSSE,
  type SSEMessage,
  type StreamSSEOptions,
} from "./sse"

export * from "./types"
export * as appConfigApi from "./app-config"
export * as fileApi from "./file"
export * as sessionApi from "./session"

// 便于按需具名导入常用方法
export {
  getLLMConfig,
  updateLLMConfig,
  getAgentConfig,
  updateAgentConfig,
  getMCPServers,
  createMCPServers,
  deleteMCPServer,
  setMCPServerEnabled,
  getA2AServers,
  createA2AServer,
  deleteA2AServer,
  setA2AServerEnabled,
} from "./app-config"

export {
  uploadFile,
  getFileInfo,
  downloadFile,
  downloadFileBlob,
  downloadFileToDisk,
  getFileDownloadUrl,
} from "./file"

export {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  stopSession,
  clearUnreadMessageCount,
  getSessionFiles,
  readSessionFile,
  readSessionShell,
  getSessionVncWsUrl,
  streamSessions,
  subscribeSessionsStream,
  chatStream,
  subscribeChatStream,
} from "./session"
