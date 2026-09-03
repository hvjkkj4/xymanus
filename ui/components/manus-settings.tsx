"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Gift,
  Languages,
  LayoutGrid,
  LayoutList,
  Settings,
  Trash,
  Wrench,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Kbd } from "@/components/ui/kbd"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { isApiError } from "@/lib/api"
import {
  parseMCPConfigJson,
  useA2AServers,
  useAgentConfigForm,
  useLLMConfigForm,
  useMCPServers,
  type AgentConfigDraft,
  type LLMConfigDraft,
  type NumberDraft,
} from "@/hooks/use-app-config"

type SettingKey =
  | "common-setting"
  | "llm-setting"
  | "a2a-setting"
  | "mcp-setting"

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return isApiError(error) ? error.message : fallback
}

function parseNumberInput(value: string): NumberDraft {
  if (value.trim() === "") return ""
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : ""
}

interface CommonSettingProps {
  form: AgentConfigDraft
  isLoading: boolean
  error: string | null
  onChange: <K extends keyof AgentConfigDraft>(
    key: K,
    value: AgentConfigDraft[K],
  ) => void
  onRetry?: () => void
}

export function CommonSetting({
  form,
  isLoading,
  error,
  onChange,
  onRetry,
}: CommonSettingProps) {
  return (
    <form
      className="w-full px-1"
      onSubmit={(event) => event.preventDefault()}
    >
      <FieldGroup>
        <FieldSet>
          {/* 顶部表单标题 */}
          <FieldLegend className="text-lg font-bold text-gray-700">
            通用配置
          </FieldLegend>
          <FieldDescription className="text-sm">
            配置MoocManus系统的通用配置信息
          </FieldDescription>

          {error ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">{error}</p>
              {onRetry ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="cursor-pointer"
                  disabled={isLoading}
                  onClick={onRetry}
                >
                  重试
                </Button>
              ) : null}
            </div>
          ) : null}
          {isLoading ? (
            <p className="text-xs text-gray-500">加载中…</p>
          ) : null}

          {/* 中间表单内容 */}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="max_iterations">
                最大迭代次数
                <Kbd>max_iterations</Kbd>
              </FieldLabel>
              <Input
                id="max_iterations"
                type="number"
                placeholder="Agent最大迭代次数"
                value={form.max_iterations}
                min={0}
                max={200}
                required
                disabled={isLoading}
                onChange={(event) =>
                  onChange("max_iterations", parseNumberInput(event.target.value))
                }
              />
              <FieldDescription className="text-xs">
                执行Agent最大能迭代循环调用工具的次数，默认为100
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="max_retries">
                最大重试次数
                <Kbd>max_retries</Kbd>
              </FieldLabel>
              <Input
                id="max_retries"
                type="number"
                placeholder="LLM/Tool最大重试次数"
                value={form.max_retries}
                min={0}
                max={10}
                required
                disabled={isLoading}
                onChange={(event) =>
                  onChange("max_retries", parseNumberInput(event.target.value))
                }
              />
              <FieldDescription className="text-xs">
                默认情况下，最大重试次数为3
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="max_search_results">
                最大搜索结果
                <Kbd>max_search_results</Kbd>
              </FieldLabel>
              <Input
                id="max_search_results"
                type="number"
                placeholder="搜索工具返回的最大结果数"
                value={form.max_search_results}
                min={0}
                max={30}
                required
                disabled={isLoading}
                onChange={(event) =>
                  onChange(
                    "max_search_results",
                    parseNumberInput(event.target.value),
                  )
                }
              />
              <FieldDescription className="text-xs">
                默认情况下，每个搜索步骤包括10个结果
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
    </form>
  )
}

interface LLMSettingProps {
  form: LLMConfigDraft
  isLoading: boolean
  error: string | null
  onChange: <K extends keyof LLMConfigDraft>(
    key: K,
    value: LLMConfigDraft[K],
  ) => void
  onRetry?: () => void
}

export function LLMSetting({
  form,
  isLoading,
  error,
  onChange,
  onRetry,
}: LLMSettingProps) {
  return (
    <form
      className="w-full px-1"
      onSubmit={(event) => event.preventDefault()}
    >
      <FieldGroup>
        <FieldSet>
          {/* 顶部表单标题 */}
          <FieldLegend className="text-lg font-bold text-gray-700">
            模型提供商
          </FieldLegend>
          <FieldDescription className="text-sm">
            配置Agent使用的基础LLM模型（兼容OpenAI格式）
          </FieldDescription>

          {error ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-destructive">{error}</p>
              {onRetry ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="cursor-pointer"
                  disabled={isLoading}
                  onClick={onRetry}
                >
                  重试
                </Button>
              ) : null}
            </div>
          ) : null}
          {isLoading ? (
            <p className="text-xs text-gray-500">加载中…</p>
          ) : null}

          {/* 中间表单内容 */}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="base_url">
                提供商基础地址
                <Kbd>base_url</Kbd>
              </FieldLabel>
              <Input
                id="base_url"
                type="url"
                placeholder="请填写LLM基础URL地址"
                value={form.base_url}
                required
                disabled={isLoading}
                onChange={(event) => onChange("base_url", event.target.value)}
              />
              <FieldDescription className="text-xs">
                请填写模型提供商的基础 url 地址，需兼容 OpenAI 格式
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="api_key">
                提供商秘钥
                <Kbd>api_key</Kbd>
              </FieldLabel>
              <Input
                id="api_key"
                type="password"
                autoComplete="off"
                placeholder="请填写提供商API秘钥"
                value={form.api_key ?? ""}
                disabled={isLoading}
                onChange={(event) => onChange("api_key", event.target.value)}
              />
              <FieldDescription className="text-xs">
                请填写模型提供商秘钥信息
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="model_name">
                模型名
                <Kbd>model_name</Kbd>
              </FieldLabel>
              <Input
                id="model_name"
                type="text"
                placeholder="请填写需要使用的模型名字"
                value={form.model_name}
                required
                disabled={isLoading}
                onChange={(event) =>
                  onChange("model_name", event.target.value)
                }
              />
              <FieldDescription className="text-xs">
                请填写 MoocManus
                调用的模型名字，模型必须支持工具调用、图像识别等功能。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="temperature">
                温度
                <Kbd>temperature</Kbd>
              </FieldLabel>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                placeholder="请填写模型温度信息"
                value={form.temperature}
                required
                disabled={isLoading}
                onChange={(event) =>
                  onChange("temperature", parseNumberInput(event.target.value))
                }
              />
              <FieldDescription className="text-xs">
                温度越低，模型输出内容越确定，创意性越差，默认配置0.7
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="max_tokens">
                最大输出token数
                <Kbd>max_tokens</Kbd>
              </FieldLabel>
              <Input
                id="max_tokens"
                type="number"
                placeholder="请填写模型最大输出token数"
                value={form.max_tokens}
                min={0}
                required
                disabled={isLoading}
                onChange={(event) =>
                  onChange("max_tokens", parseNumberInput(event.target.value))
                }
              />
              <FieldDescription className="text-xs">
                设置模型的最大输出token数
              </FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
    </form>
  )
}

interface A2ASettingProps {
  servers: ReturnType<typeof useA2AServers>["servers"]
  isLoading: boolean
  error: string | null
  pendingIds: Set<string>
  onAdd: (baseUrl: string) => Promise<void>
  onDelete: (a2aId: string) => Promise<void>
  onToggle: (a2aId: string, enabled: boolean) => Promise<void>
}

export function A2ASetting({
  servers,
  isLoading,
  error,
  pendingIds,
  onAdd,
  onDelete,
  onToggle,
}: A2ASettingProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (isAdding) return
    setIsAdding(true)
    try {
      await onAdd(baseUrl)
      setBaseUrl("")
      setAddOpen(false)
      toast.success("远程 Agent 已添加")
    } catch (err) {
      toast.error(toErrorMessage(err, "添加远程 Agent 失败"))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="w-full px-1">
      <FieldGroup>
        <FieldSet>
          <FieldLegend className="w-full flex justify-between items-center text-lg font-bold text-gray-700">
            A2A Agent配置
            <Dialog
              open={addOpen}
              onOpenChange={(open) => {
                setAddOpen(open)
                if (!open) setBaseUrl("")
              }}
            >
              {/* 模态窗触发按钮 */}
              <DialogTrigger asChild>
                <Button type="button" size="xs" className="cursor-pointer">
                  新增远程Agent
                </Button>
              </DialogTrigger>

              {/* 新增A2A服务器模态窗 */}
              <DialogContent className="max-w-125 sm:max-w-125">
                <DialogHeader>
                  <DialogTitle className="text-gray-700">
                    添加远程Agent
                  </DialogTitle>
                  <DialogDescription className="text-gray-500">
                    MoocManus 使用标准的 A2A 协议来连接远程 Agent。
                    <br />
                    请将您的配置粘贴到下方，然后点击“添加”即可添加 Agent。
                  </DialogDescription>
                </DialogHeader>

                <form
                  className="w-full"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleAdd()
                  }}
                >
                  <FieldGroup>
                    <FieldSet>
                      <Field>
                        <Input
                          id="a2a_base_url"
                          type="text"
                          inputMode="url"
                          autoComplete="url"
                          placeholder="Example: https://mooc-manus.com/weather-agent"
                          value={baseUrl}
                          disabled={isAdding}
                          onChange={(event) => setBaseUrl(event.target.value)}
                        />
                      </Field>
                    </FieldSet>
                  </FieldGroup>
                </form>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      variant="outline"
                      className="cursor-pointer"
                      disabled={isAdding}
                    >
                      取消
                    </Button>
                  </DialogClose>
                  <Button
                    className="cursor-pointer"
                    disabled={isAdding || !baseUrl.trim()}
                    onClick={() => void handleAdd()}
                  >
                    {isAdding ? "添加中…" : "添加"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </FieldLegend>

          <FieldDescription className="text-sm">
            模型A2A协议（Agent to Agent Protocol）通过集成外部 Agent 来增强
            MoocManus 的性能。
          </FieldDescription>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          {isLoading && servers.length === 0 ? (
            <p className="text-xs text-gray-500">加载中…</p>
          ) : null}
          {!isLoading && !error && servers.length === 0 ? (
            <p className="text-xs text-gray-500">暂无远程 Agent，请先添加</p>
          ) : null}

          {/* 中间列表内容 */}
          <ItemGroup>
            {servers.map((server) => {
              const busy = pendingIds.has(server.id)
              return (
                <Item key={server.id} variant="outline">
                  <ItemContent>
                    <ItemTitle className="w-full flex justify-between items-center text-md font-bold text-gray-700">
                      {/* 左侧Agent名称 */}
                      <div className="flex gap-2 items-center">
                        {server.name || server.id}
                        {!server.enabled ? <Badge>禁用</Badge> : null}
                      </div>
                      {/* 右侧基础操作 */}
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="cursor-pointer"
                          disabled={busy}
                          onClick={() => {
                            void onDelete(server.id).then(
                              () => toast.success("已删除 Agent"),
                              (err: unknown) =>
                                toast.error(
                                  toErrorMessage(err, "删除 Agent 失败"),
                                ),
                            )
                          }}
                        >
                          <Trash />
                        </Button>
                        <Switch
                          checked={server.enabled}
                          disabled={busy}
                          onCheckedChange={(checked) => {
                            void onToggle(server.id, checked).then(
                              () => {
                                const name = server.name || server.id
                                toast.success(
                                  checked
                                    ? `已启用 ${name}`
                                    : `已禁用 ${name}`,
                                )
                              },
                              (err: unknown) =>
                                toast.error(
                                  toErrorMessage(err, "更新 Agent 状态失败"),
                                ),
                            )
                          }}
                        />
                      </div>
                    </ItemTitle>

                    {server.description ? (
                      <ItemDescription>{server.description}</ItemDescription>
                    ) : null}

                    <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <LayoutList size={12} />
                      {(server.input_modes ?? []).map((mode) => (
                        <Badge
                          key={`in-${server.id}-${mode}`}
                          variant="secondary"
                          className="text-gray-500"
                        >
                          输入: {mode}
                        </Badge>
                      ))}
                      {(server.output_modes ?? []).map((mode) => (
                        <Badge
                          key={`out-${server.id}-${mode}`}
                          variant="secondary"
                          className="text-gray-500"
                        >
                          输出: {mode}
                        </Badge>
                      ))}
                      {server.streaming ? (
                        <Badge variant="secondary" className="text-gray-500">
                          流式输出
                        </Badge>
                      ) : null}
                      {server.push_notifications ? (
                        <Badge variant="secondary" className="text-gray-500">
                          推送通知
                        </Badge>
                      ) : null}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              )
            })}
          </ItemGroup>
        </FieldSet>
      </FieldGroup>
    </div>
  )
}

interface MCPSettingProps {
  servers: ReturnType<typeof useMCPServers>["servers"]
  isLoading: boolean
  error: string | null
  pendingNames: Set<string>
  onAdd: (configText: string) => Promise<void>
  onDelete: (serverName: string) => Promise<void>
  onToggle: (serverName: string, enabled: boolean) => Promise<void>
}

export function MCPSetting({
  servers,
  isLoading,
  error,
  pendingNames,
  onAdd,
  onDelete,
  onToggle,
}: MCPSettingProps) {
  const mcpConfigPlaceholder = `{
  "mcpServers": {
    "qiniu": {
      "command": "uvx",
      "args": [
        "qiniu-mcp-server"
      ],
      "env": {
        "QINIU_ACCESS_KEY": "YOUR_ACCESS_KEY",
        "QINIU_SECRET_KEY": "YOUR_SECRET_KEY",
        "QINIU_REGION_NAME": "YOUR_REGION_NAME",
        "QINIU_ENDPOINT_URL": "YOUR_ENDPOINT_URL",
        "QINIU_BUCKETS": ""
      },
      "disabled": false
    }
  }
}`

  const [addOpen, setAddOpen] = useState(false)
  const [configText, setConfigText] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (isAdding) return
    setIsAdding(true)
    try {
      await onAdd(configText)
      setConfigText("")
      setAddOpen(false)
      toast.success("MCP 服务器已添加")
    } catch (err) {
      toast.error(toErrorMessage(err, "添加 MCP 服务器失败"))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="w-full px-1">
      <FieldGroup>
        <FieldSet>
          <FieldLegend className="w-full flex justify-between items-center text-lg font-bold text-gray-700">
            MCP 服务器
            <Dialog
              open={addOpen}
              onOpenChange={(open) => {
                setAddOpen(open)
                if (!open) setConfigText("")
              }}
            >
              {/* 模态窗触发按钮 */}
              <DialogTrigger asChild>
                <Button type="button" size="xs" className="cursor-pointer">
                  新增服务器
                </Button>
              </DialogTrigger>

              {/* 新增MCP服务器模态窗 */}
              <DialogContent className="max-w-125 sm:max-w-125">
                <DialogHeader>
                  <DialogTitle className="text-gray-700">
                    添加新的 MCP 服务器
                  </DialogTitle>
                  <DialogDescription className="text-gray-500">
                    MoocManus 使用标准的 JSON MCP 配置来创建新服务器。
                    请将您的配置粘贴到下方，然后点击 “添加” 即可添加新服务器。
                  </DialogDescription>
                </DialogHeader>

                <form
                  className="w-full"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleAdd()
                  }}
                >
                  <FieldGroup>
                    <FieldSet>
                      <Field>
                        <Textarea
                          id="mcp_config"
                          placeholder={mcpConfigPlaceholder}
                          required
                          value={configText}
                          disabled={isAdding}
                          className="min-h-48 font-mono text-xs"
                          onChange={(event) =>
                            setConfigText(event.target.value)
                          }
                        />
                      </Field>
                    </FieldSet>
                  </FieldGroup>
                </form>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      variant="outline"
                      className="cursor-pointer"
                      disabled={isAdding}
                    >
                      取消
                    </Button>
                  </DialogClose>
                  <Button
                    className="cursor-pointer"
                    disabled={isAdding || !configText.trim()}
                    onClick={() => void handleAdd()}
                  >
                    {isAdding ? "添加中…" : "添加"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </FieldLegend>

          <FieldDescription className="text-sm">
            MoocManus 支持协议扩展（MCP），通过集成外部工具来增强 MoocManus
            的性能，例如拥有海量资源
          </FieldDescription>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          {isLoading && servers.length === 0 ? (
            <p className="text-xs text-gray-500">加载中…</p>
          ) : null}
          {!isLoading && !error && servers.length === 0 ? (
            <p className="text-xs text-gray-500">暂无 MCP 服务器，请先添加</p>
          ) : null}

          {/* 中间列表内容 */}
          <ItemGroup>
            {servers.map((server) => {
              const busy = pendingNames.has(server.server_name)
              return (
                <Item key={server.server_name} variant="outline">
                  <ItemContent>
                    <ItemTitle className="w-full flex justify-between items-center text-md font-bold text-gray-700">
                      {/* 左侧MCP名称 */}
                      <div className="flex gap-2 items-center">
                        {server.server_name}
                        <Badge>{server.transport}</Badge>
                        {!server.enabled ? <Badge>禁用</Badge> : null}
                      </div>
                      {/* 右侧基础操作 */}
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="cursor-pointer"
                          disabled={busy}
                          onClick={() => {
                            void onDelete(server.server_name).then(
                              () => toast.success("已删除 MCP 服务器"),
                              (err: unknown) =>
                                toast.error(
                                  toErrorMessage(err, "删除 MCP 服务器失败"),
                                ),
                            )
                          }}
                        >
                          <Trash />
                        </Button>
                        <Switch
                          checked={server.enabled}
                          disabled={busy}
                          onCheckedChange={(checked) => {
                            void onToggle(server.server_name, checked).then(
                              () =>
                                toast.success(
                                  checked
                                    ? `已启用 ${server.server_name}`
                                    : `已禁用 ${server.server_name}`,
                                ),
                              (err: unknown) =>
                                toast.error(
                                  toErrorMessage(
                                    err,
                                    "更新 MCP 服务器状态失败",
                                  ),
                                ),
                            )
                          }}
                        />
                      </div>
                    </ItemTitle>
                    <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Wrench size={12} />
                      {(server.tools ?? []).map((tool) => (
                        <Badge
                          key={`${server.server_name}-${tool}`}
                          variant="secondary"
                          className="text-gray-500"
                        >
                          {tool}
                        </Badge>
                      ))}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              )
            })}
          </ItemGroup>
        </FieldSet>
      </FieldGroup>
    </div>
  )
}

export function ManusSettings() {
  const [open, setOpen] = useState(false)
  const [activatedSetting, setActivatedSetting] =
    useState<SettingKey>("common-setting")
  const [isSaving, setIsSaving] = useState(false)

  const agent = useAgentConfigForm({
    enabled: open && activatedSetting === "common-setting",
  })
  const llm = useLLMConfigForm({
    enabled: open && activatedSetting === "llm-setting",
  })
  const a2a = useA2AServers({
    enabled: open && activatedSetting === "a2a-setting",
  })
  const mcp = useMCPServers({
    enabled: open && activatedSetting === "mcp-setting",
  })

  const settingMenus = [
    {
      key: "common-setting" as const,
      icon: Settings,
      title: "通用配置",
    },
    {
      key: "llm-setting" as const,
      icon: Languages,
      title: "模型提供商",
    },
    {
      key: "a2a-setting" as const,
      icon: LayoutGrid,
      title: "A2A Agent配置",
    },
    {
      key: "mcp-setting" as const,
      icon: Gift,
      title: "MCP 服务器",
    },
  ]

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
  }

  const handleSave = async () => {
    if (isSaving) return

    if (
      activatedSetting === "a2a-setting" ||
      activatedSetting === "mcp-setting"
    ) {
      // 列表类配置已即时生效
      setOpen(false)
      return
    }

    setIsSaving(true)
    try {
      if (activatedSetting === "common-setting") {
        await agent.save()
        toast.success("通用配置已保存")
      } else {
        await llm.save()
        toast.success("模型提供商配置已保存")
      }
      setOpen(false)
    } catch (err) {
      toast.error(
        toErrorMessage(
          err,
          activatedSetting === "common-setting"
            ? "保存通用配置失败"
            : "保存模型配置失败",
        ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const footerBusy =
    isSaving ||
    (activatedSetting === "common-setting" && agent.isLoading) ||
    (activatedSetting === "llm-setting" && llm.isLoading)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* 模态窗触发器 */}
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" className="cursor-pointer">
          <Settings />
        </Button>
      </DialogTrigger>

      {/* 模态窗本身 */}
      <DialogContent className="max-w-212.5!">
        {/* 模态窗header */}
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-gray-700">MoocManus 设置</DialogTitle>
          <DialogDescription className="text-gray-500">
            在此管理您的 MoocManus 设置。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-row gap-4">
          {/* 左侧快捷菜单 */}
          <div className="max-w-45">
            <div className="flex flex-col gap-0">
              {settingMenus.map((setting) => (
                <Button
                  key={setting.key}
                  variant={
                    activatedSetting === setting.key ? "default" : "ghost"
                  }
                  className="cursor-pointer justify-start"
                  onClick={() => setActivatedSetting(setting.key)}
                >
                  <setting.icon />
                  {setting.title}
                </Button>
              ))}
            </div>
          </div>

          {/* 分隔符 */}
          <Separator orientation="vertical" />

          {/* 右侧表单内容 */}
          <div className="flex-1 h-125 scrollbar-hide overflow-y-auto">
            {activatedSetting === "common-setting" && (
              <CommonSetting
                form={agent.form}
                isLoading={agent.isLoading}
                error={agent.error}
                onChange={agent.updateField}
                onRetry={() => {
                  void agent.reload().catch((err: unknown) => {
                    toast.error(toErrorMessage(err, "加载通用配置失败"))
                  })
                }}
              />
            )}
            {activatedSetting === "llm-setting" && (
              <LLMSetting
                form={llm.form}
                isLoading={llm.isLoading}
                error={llm.error}
                onChange={llm.updateField}
                onRetry={() => {
                  void llm.reload().catch((err: unknown) => {
                    toast.error(toErrorMessage(err, "加载模型配置失败"))
                  })
                }}
              />
            )}
            {activatedSetting === "a2a-setting" && (
              <A2ASetting
                servers={a2a.servers}
                isLoading={a2a.isLoading}
                error={a2a.error}
                pendingIds={a2a.pendingIds}
                onAdd={a2a.addServer}
                onDelete={a2a.removeServer}
                onToggle={a2a.setEnabled}
              />
            )}
            {activatedSetting === "mcp-setting" && (
              <MCPSetting
                servers={mcp.servers}
                isLoading={mcp.isLoading}
                error={mcp.error}
                pendingNames={mcp.pendingNames}
                onAdd={async (configText) => {
                  const config = parseMCPConfigJson(configText)
                  await mcp.addServers(config)
                }}
                onDelete={mcp.removeServer}
                onToggle={mcp.setEnabled}
              />
            )}
          </div>
        </div>

        {/* 模态窗footer */}
        <DialogFooter className="border-t pt-4">
          <DialogClose asChild>
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={isSaving}
            >
              取消
            </Button>
          </DialogClose>
          <Button
            className="cursor-pointer"
            disabled={footerBusy}
            onClick={() => void handleSave()}
          >
            {isSaving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
