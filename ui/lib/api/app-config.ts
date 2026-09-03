import { get, post } from "./client"
import type {
  AgentConfig,
  CreateA2AServerRequest,
  ListA2AServerResponse,
  ListMCPServerResponse,
  LLMConfig,
  MCPConfig,
  SetEnabledRequest,
} from "./types"
import type { RequestOptions } from "./client"

const PREFIX = "/app-config"

/** 获取 LLM 配置（不含 api_key） */
export function getLLMConfig(options?: RequestOptions): Promise<LLMConfig> {
  return get<LLMConfig>(`${PREFIX}/llm`, options)
}

/**
 * 更新 LLM 配置。
 * `api_key` 为空字符串或不传时，后端不会覆盖已有密钥。
 */
export function updateLLMConfig(
  config: LLMConfig,
  options?: RequestOptions,
): Promise<LLMConfig> {
  return post<LLMConfig>(`${PREFIX}/llm`, config, options)
}

/** 获取 Agent 通用配置 */
export function getAgentConfig(options?: RequestOptions): Promise<AgentConfig> {
  return get<AgentConfig>(`${PREFIX}/agent`, options)
}

/** 更新 Agent 通用配置 */
export function updateAgentConfig(
  config: AgentConfig,
  options?: RequestOptions,
): Promise<AgentConfig> {
  return post<AgentConfig>(`${PREFIX}/agent`, config, options)
}

/** 获取 MCP 服务器列表 */
export function getMCPServers(
  options?: RequestOptions,
): Promise<ListMCPServerResponse> {
  return get<ListMCPServerResponse>(`${PREFIX}/mcp-servers`, options)
}

/** 新增 MCP 服务配置（可一次传多个） */
export function createMCPServers(
  config: MCPConfig,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(`${PREFIX}/mcp-servers`, config, options)
}

/** 删除指定 MCP 服务 */
export function deleteMCPServer(
  serverName: string,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(
    `${PREFIX}/mcp-servers/${encodeURIComponent(serverName)}/delete`,
    null,
    options,
  )
}

/** 启用/禁用 MCP 服务 */
export function setMCPServerEnabled(
  serverName: string,
  enabled: boolean,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  const body: SetEnabledRequest = { enabled }
  return post(
    `${PREFIX}/mcp-servers/${encodeURIComponent(serverName)}/enabled`,
    body,
    options,
  )
}

/** 获取 A2A 服务器列表 */
export function getA2AServers(
  options?: RequestOptions,
): Promise<ListA2AServerResponse> {
  return get<ListA2AServerResponse>(`${PREFIX}/a2a-servers`, options)
}

/** 新增 A2A 服务器 */
export function createA2AServer(
  payload: CreateA2AServerRequest,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(`${PREFIX}/a2a-servers`, payload, options)
}

/** 删除指定 A2A 服务器 */
export function deleteA2AServer(
  a2aId: string,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  return post(
    `${PREFIX}/a2a-servers/${encodeURIComponent(a2aId)}/delete`,
    null,
    options,
  )
}

/** 启用/禁用 A2A 服务器 */
export function setA2AServerEnabled(
  a2aId: string,
  enabled: boolean,
  options?: RequestOptions,
): Promise<Record<string, never>> {
  const body: SetEnabledRequest = { enabled }
  return post(
    `${PREFIX}/a2a-servers/${encodeURIComponent(a2aId)}/enabled`,
    body,
    options,
  )
}
