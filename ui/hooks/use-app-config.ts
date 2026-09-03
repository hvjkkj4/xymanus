"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  createA2AServer,
  createMCPServers,
  deleteA2AServer,
  deleteMCPServer,
  getA2AServers,
  getAgentConfig,
  getLLMConfig,
  getMCPServers,
  isApiError,
  setA2AServerEnabled,
  setMCPServerEnabled,
  updateAgentConfig,
  updateLLMConfig,
  type AgentConfig,
  type ListA2AServerItem,
  type ListMCPServerItem,
  type LLMConfig,
  type MCPConfig,
  type MCPServerConfig,
} from "@/lib/api"

function toErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  max_iterations: 100,
  max_retries: 3,
  max_search_results: 10,
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  base_url: "https://api.deepseek.com",
  api_key: "",
  model_name: "",
  temperature: 0.7,
  max_tokens: 8192,
}

/** 将 Claude Desktop 等常见 `disabled` 字段归一为后端 `enabled` */
function normalizeMCPConfig(raw: MCPConfig): MCPConfig {
  const mcpServers: Record<string, MCPServerConfig> = {}

  for (const [name, server] of Object.entries(raw.mcpServers ?? {})) {
    const legacy = server as MCPServerConfig & { disabled?: boolean }
    const { disabled, ...rest } = legacy
    mcpServers[name] = {
      ...rest,
      enabled:
        typeof rest.enabled === "boolean"
          ? rest.enabled
          : typeof disabled === "boolean"
            ? !disabled
            : true,
    }
  }

  return { mcpServers }
}

export function parseMCPConfigJson(text: string): MCPConfig {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error("请粘贴 MCP 服务器配置 JSON")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error("JSON 格式不正确，请检查后重试")
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("mcpServers" in parsed) ||
    typeof (parsed as MCPConfig).mcpServers !== "object" ||
    (parsed as MCPConfig).mcpServers === null
  ) {
    throw new Error('配置需包含 "mcpServers" 对象')
  }

  const mcpServers = (parsed as MCPConfig).mcpServers
  if (Object.keys(mcpServers).length === 0) {
    throw new Error("mcpServers 不能为空")
  }

  return normalizeMCPConfig({ mcpServers })
}

interface UseLoadOptions {
  /** 为 true 时拉取数据（弹窗打开且切到对应 Tab） */
  enabled: boolean
}

/** 表单编辑中允许数字框暂时为空，便于清空后重新输入 */
export type NumberDraft = number | ""

export type AgentConfigDraft = {
  max_iterations: NumberDraft
  max_retries: NumberDraft
  max_search_results: NumberDraft
}

export type LLMConfigDraft = {
  base_url: string
  api_key?: string
  model_name: string
  temperature: NumberDraft
  max_tokens: NumberDraft
}

function normalizeAgentConfig(
  data: Partial<AgentConfig> | null | undefined,
): AgentConfigDraft {
  return {
    max_iterations:
      typeof data?.max_iterations === "number"
        ? data.max_iterations
        : DEFAULT_AGENT_CONFIG.max_iterations,
    max_retries:
      typeof data?.max_retries === "number"
        ? data.max_retries
        : DEFAULT_AGENT_CONFIG.max_retries,
    max_search_results:
      typeof data?.max_search_results === "number"
        ? data.max_search_results
        : DEFAULT_AGENT_CONFIG.max_search_results,
  }
}

function normalizeLLMConfig(
  data: Partial<LLMConfig> | null | undefined,
): LLMConfigDraft {
  return {
    base_url:
      typeof data?.base_url === "string" && data.base_url
        ? data.base_url
        : DEFAULT_LLM_CONFIG.base_url,
    // GET 可能不返回或返回空；本地空字符串表示保存时「不覆盖」
    api_key: "",
    model_name:
      typeof data?.model_name === "string"
        ? data.model_name
        : DEFAULT_LLM_CONFIG.model_name,
    temperature:
      typeof data?.temperature === "number"
        ? data.temperature
        : DEFAULT_LLM_CONFIG.temperature,
    max_tokens:
      typeof data?.max_tokens === "number"
        ? data.max_tokens
        : DEFAULT_LLM_CONFIG.max_tokens,
  }
}

function requireNumber(value: NumberDraft, label: string): number {
  if (value === "" || !Number.isFinite(value)) {
    throw new Error(`请填写有效的${label}`)
  }
  return value
}

function toAgentConfigPayload(form: AgentConfigDraft): AgentConfig {
  return {
    max_iterations: requireNumber(form.max_iterations, "最大迭代次数"),
    max_retries: requireNumber(form.max_retries, "最大重试次数"),
    max_search_results: requireNumber(form.max_search_results, "最大搜索结果"),
  }
}

function toLLMConfigPayload(form: LLMConfigDraft): LLMConfig {
  return {
    base_url: form.base_url,
    model_name: form.model_name,
    temperature: requireNumber(form.temperature, "温度"),
    max_tokens: requireNumber(form.max_tokens, "最大输出token数"),
    // 空字符串表示不更新已有密钥
    api_key: form.api_key?.trim() ? form.api_key : "",
  }
}

export function useAgentConfigForm({ enabled }: UseLoadOptions) {
  const [form, setForm] = useState<AgentConfigDraft>(DEFAULT_AGENT_CONFIG)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const data = await getAgentConfig()
      if (requestId !== requestIdRef.current) return
      setForm(normalizeAgentConfig(data))
      setHasLoaded(true)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      const message = toErrorMessage(err, "加载通用配置失败")
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load().catch(() => {
      // 错误已写入 error，由 UI / toast 展示
    })
  }, [enabled, load])

  const updateField = useCallback(
    <K extends keyof AgentConfigDraft>(key: K, value: AgentConfigDraft[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const save = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      const payload = toAgentConfigPayload(form)
      const data = await updateAgentConfig(payload)
      setForm(normalizeAgentConfig(data))
      setHasLoaded(true)
      return data
    } catch (err) {
      const message = toErrorMessage(err, "保存通用配置失败")
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setIsSaving(false)
    }
  }, [form])

  return {
    form,
    updateField,
    isLoading,
    isSaving,
    error,
    hasLoaded,
    save,
    reload: load,
  }
}

export function useLLMConfigForm({ enabled }: UseLoadOptions) {
  const [form, setForm] = useState<LLMConfigDraft>(DEFAULT_LLM_CONFIG)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const data = await getLLMConfig()
      if (requestId !== requestIdRef.current) return
      setForm(normalizeLLMConfig(data))
      setHasLoaded(true)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      const message = toErrorMessage(err, "加载模型配置失败")
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load().catch(() => {
      // 错误已写入 error，由 UI / toast 展示
    })
  }, [enabled, load])

  const updateField = useCallback(
    <K extends keyof LLMConfigDraft>(key: K, value: LLMConfigDraft[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const save = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      const payload = toLLMConfigPayload(form)
      const data = await updateLLMConfig(payload)
      setForm(normalizeLLMConfig(data))
      setHasLoaded(true)
      return data
    } catch (err) {
      const message = toErrorMessage(err, "保存模型配置失败")
      setError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setIsSaving(false)
    }
  }, [form])

  return {
    form,
    updateField,
    isLoading,
    isSaving,
    error,
    hasLoaded,
    save,
    reload: load,
  }
}

export function useA2AServers({ enabled }: UseLoadOptions) {
  const [servers, setServers] = useState<ListA2AServerItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const requestIdRef = useRef(0)

  const setPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const data = await getA2AServers()
      if (requestId !== requestIdRef.current) return
      setServers(data.a2a_servers ?? [])
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(toErrorMessage(err, "加载 A2A Agent 列表失败"))
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  const addServer = useCallback(async (baseUrl: string) => {
    const trimmed = baseUrl.trim()
    if (!trimmed) {
      throw new Error("请填写远程 Agent 地址")
    }

    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      throw new Error("请填写有效的远程 Agent 地址，例如 https://example.com/agent")
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("远程 Agent 地址仅支持 http 或 https 协议")
    }

    // 后端对无效地址也可能返回 200，需对比列表确认是否真正新增
    const before = await getA2AServers()
    const beforeIds = new Set(
      (before.a2a_servers ?? []).map((item) => item.id),
    )

    await createA2AServer({ base_url: trimmed })

    const after = await getA2AServers()
    const afterServers = after.a2a_servers ?? []
    setServers(afterServers)

    const added = afterServers.some((item) => !beforeIds.has(item.id))
    if (!added) {
      throw new Error("添加未生效，请检查远程 Agent 地址是否可访问")
    }
  }, [])

  const removeServer = useCallback(
    async (a2aId: string) => {
      setPending(a2aId, true)
      try {
        await deleteA2AServer(a2aId)
        setServers((prev) => prev.filter((item) => item.id !== a2aId))
      } finally {
        setPending(a2aId, false)
      }
    },
    [setPending],
  )

  const setEnabled = useCallback(
    async (a2aId: string, enabledValue: boolean) => {
      setPending(a2aId, true)
      const previous = servers.find((item) => item.id === a2aId)?.enabled
      setServers((prev) =>
        prev.map((item) =>
          item.id === a2aId ? { ...item, enabled: enabledValue } : item,
        ),
      )
      try {
        await setA2AServerEnabled(a2aId, enabledValue)
      } catch (err) {
        if (typeof previous === "boolean") {
          setServers((prev) =>
            prev.map((item) =>
              item.id === a2aId ? { ...item, enabled: previous } : item,
            ),
          )
        }
        throw err
      } finally {
        setPending(a2aId, false)
      }
    },
    [servers, setPending],
  )

  return {
    servers,
    isLoading,
    error,
    pendingIds,
    reload: load,
    addServer,
    removeServer,
    setEnabled,
  }
}

export function useMCPServers({ enabled }: UseLoadOptions) {
  const [servers, setServers] = useState<ListMCPServerItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingNames, setPendingNames] = useState<Set<string>>(new Set())
  const requestIdRef = useRef(0)

  const setPending = useCallback((name: string, pending: boolean) => {
    setPendingNames((prev) => {
      const next = new Set(prev)
      if (pending) next.add(name)
      else next.delete(name)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const data = await getMCPServers()
      if (requestId !== requestIdRef.current) return
      setServers(data.mcp_servers ?? [])
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(toErrorMessage(err, "加载 MCP 服务器列表失败"))
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load()
  }, [enabled, load])

  const addServers = useCallback(
    async (config: MCPConfig) => {
      await createMCPServers(config)
      await load()
    },
    [load],
  )

  const removeServer = useCallback(
    async (serverName: string) => {
      setPending(serverName, true)
      try {
        await deleteMCPServer(serverName)
        setServers((prev) =>
          prev.filter((item) => item.server_name !== serverName),
        )
      } finally {
        setPending(serverName, false)
      }
    },
    [setPending],
  )

  const setEnabled = useCallback(
    async (serverName: string, enabledValue: boolean) => {
      setPending(serverName, true)
      const previous = servers.find(
        (item) => item.server_name === serverName,
      )?.enabled
      setServers((prev) =>
        prev.map((item) =>
          item.server_name === serverName
            ? { ...item, enabled: enabledValue }
            : item,
        ),
      )
      try {
        await setMCPServerEnabled(serverName, enabledValue)
      } catch (err) {
        if (typeof previous === "boolean") {
          setServers((prev) =>
            prev.map((item) =>
              item.server_name === serverName
                ? { ...item, enabled: previous }
                : item,
            ),
          )
        }
        throw err
      } finally {
        setPending(serverName, false)
      }
    },
    [servers, setPending],
  )

  return {
    servers,
    isLoading,
    error,
    pendingNames,
    reload: load,
    addServers,
    removeServer,
    setEnabled,
  }
}
