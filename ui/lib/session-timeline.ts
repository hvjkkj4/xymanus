import type {
  AgentSSEEvent,
  ErrorSSEEvent,
  ExecutionStatus,
  FileInfo,
  MessageRole,
  MessageSSEEvent,
  PlanEventData,
  PlanSSEEvent,
  SessionStatus,
  StepEventData,
  StepSSEEvent,
  TitleSSEEvent,
  ToolEventData,
  ToolSSEEvent,
} from "@/lib/api"
import { getNotifyText, isNotifyTool } from "@/lib/tool-label"
import { resolveFileInfoList } from "@/lib/file-meta"

/** 步骤内嵌子项：通知文案或工具调用 */
export type StepChildItem =
  | {
      kind: "notify"
      key: string
      toolCallId: string
      text: string
      createdAt: number
    }
  | {
      kind: "tool"
      key: string
      tool: ToolEventData
    }

/** 步骤子项渲染块：通知保持独立，连续工具收成一组 */
export type StepChildBlock =
  | {
      kind: "notify"
      key: string
      item: Extract<StepChildItem, { kind: "notify" }>
    }
  | {
      kind: "tool_group"
      key: string
      tools: ToolEventData[]
    }

/**
 * 将步骤子项按「通知打断、工具连续合并」分块。
 * 通知文案始终单独展示；连续工具调用合并便于折叠。
 */
export function groupStepChildren(children: StepChildItem[]): StepChildBlock[] {
  const blocks: StepChildBlock[] = []
  let toolBuffer: ToolEventData[] = []

  const flushTools = () => {
    if (toolBuffer.length === 0) return
    blocks.push({
      kind: "tool_group",
      key: `tools-${toolBuffer[0].tool_call_id}`,
      tools: toolBuffer,
    })
    toolBuffer = []
  }

  for (const child of children) {
    if (child.kind === "notify") {
      flushTools()
      blocks.push({ kind: "notify", key: child.key, item: child })
      continue
    }
    toolBuffer.push(child.tool)
  }
  flushTools()
  return blocks
}

/** 详情页时间线渲染单元（由原始 SSE 事件投影而来） */
export type TimelineItem =
  | {
      kind: "message"
      key: string
      role: MessageRole
      text: string
      createdAt: number
    }
  | {
      kind: "attachments"
      key: string
      role: MessageRole
      files: FileInfo[]
      createdAt: number
    }
  | {
      kind: "step"
      key: string
      stepId: string
      status: ExecutionStatus
      description: string
      createdAt: number
      children: StepChildItem[]
    }
  | {
      kind: "tool"
      key: string
      tool: ToolEventData
    }
  | {
      kind: "notify"
      key: string
      toolCallId: string
      text: string
      createdAt: number
    }
  | {
      kind: "error"
      key: string
      error: string
      createdAt: number
    }

/** 顶层时间线渲染：连续 tool 合并，其余项保持原样 */
export type TimelineRenderItem =
  | { kind: "single"; key: string; item: TimelineItem }
  | { kind: "tool_group"; key: string; tools: ToolEventData[] }

export function groupTimelineItems(items: TimelineItem[]): TimelineRenderItem[] {
  const result: TimelineRenderItem[] = []
  let toolBuffer: Extract<TimelineItem, { kind: "tool" }>[] = []

  const flushTools = () => {
    if (toolBuffer.length === 0) return
    if (toolBuffer.length === 1) {
      result.push({
        kind: "single",
        key: toolBuffer[0].key,
        item: toolBuffer[0],
      })
    } else {
      result.push({
        kind: "tool_group",
        key: `tools-${toolBuffer[0].key}`,
        tools: toolBuffer.map((item) => item.tool),
      })
    }
    toolBuffer = []
  }

  for (const item of items) {
    if (item.kind === "tool") {
      toolBuffer.push(item)
      continue
    }
    flushTools()
    result.push({ kind: "single", key: item.key, item })
  }
  flushTools()
  return result
}

function isMessageEvent(event: AgentSSEEvent): event is MessageSSEEvent {
  return event.event === "message"
}

function isTitleEvent(event: AgentSSEEvent): event is TitleSSEEvent {
  return event.event === "title"
}

function isPlanEvent(event: AgentSSEEvent): event is PlanSSEEvent {
  return event.event === "plan"
}

function isStepEvent(event: AgentSSEEvent): event is StepSSEEvent {
  return event.event === "step"
}

function isToolEvent(event: AgentSSEEvent): event is ToolSSEEvent {
  return event.event === "tool"
}

function isErrorEvent(event: AgentSSEEvent): event is ErrorSSEEvent {
  return event.event === "error"
}

function eventKey(event: AgentSSEEvent, index: number): string {
  const id = event.data?.event_id
  if (typeof id === "string" && id.length > 0) return id
  return `${event.event}-${index}-${event.data?.created_at ?? 0}`
}

function isTerminalStep(status: ExecutionStatus): boolean {
  return status === "completed" || status === "failed"
}

function upsertStepChild(
  children: StepChildItem[],
  child: StepChildItem,
): StepChildItem[] {
  const id =
    child.kind === "tool" ? child.tool.tool_call_id : child.toolCallId
  const index = children.findIndex((item) =>
    item.kind === "tool"
      ? item.tool.tool_call_id === id
      : item.toolCallId === id,
  )
  if (index === -1) return [...children, child]
  const next = children.slice()
  next[index] = child
  return next
}

function toNotifyChild(tool: ToolEventData): StepChildItem | null {
  const text = getNotifyText(tool)
  if (!text) return null
  return {
    kind: "notify",
    key: tool.tool_call_id,
    toolCallId: tool.tool_call_id,
    text,
    createdAt: tool.created_at,
  }
}

function toToolChild(tool: ToolEventData): StepChildItem {
  return {
    kind: "tool",
    key: tool.tool_call_id,
    // 保留完整 content，供点击胶囊后的预览侧栏使用；
    // 胶囊本身只读 args 渲染文案，不会泄漏执行结果。
    tool,
  }
}

/**
 * 将会话事件列表投影为 UI 时间线。
 *
 * 归组规则（与后端 react.execute_step 对齐）：
 * - 任一 step 事件开启步骤桶，其后 tool / message_notify_user 挂入该步骤
 * - 桶在下一 step / 用户消息 / done / wait 时关闭（completed 不关桶）
 * - 同 step.id 的 running→completed 会被 merge 成单条 completed；若不关桶，
 *   重投影时工具仍能挂回该步骤（否则会掉到顶层，左侧时间线消失）
 * - message 始终作为顶层消息（含 ask_user 转成的助手消息）
 * - 同 tool_call_id 的 calling→called 就地更新
 * - 用户新回合隔离：不把后续 tool/step 挂到上一问，也不复用上一问的 step/tool 槽位
 */
export function projectTimeline(events: AgentSSEEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  let openStepKey: string | null = null
  /** 当前用户回合在 items 中的起始下标（含该用户消息） */
  let turnStartIndex = 0
  let stepOccurrence = 0

  const findOpenStepIndex = (): number => {
    if (!openStepKey) return -1
    return items.findIndex(
      (item) => item.kind === "step" && item.key === openStepKey,
    )
  }

  const attachToOpenStep = (child: StepChildItem): boolean => {
    const index = findOpenStepIndex()
    if (index === -1 || index < turnStartIndex) return false
    const step = items[index]
    if (step.kind !== "step") return false
    items[index] = {
      ...step,
      children: upsertStepChild(step.children, child),
    }
    return true
  }

  const findTurnToolIndex = (toolCallId: string): number => {
    for (let i = items.length - 1; i >= turnStartIndex; i -= 1) {
      const item = items[i]
      if (item.kind === "tool" && item.tool.tool_call_id === toolCallId) {
        return i
      }
      if (item.kind === "notify" && item.toolCallId === toolCallId) {
        return i
      }
    }
    return -1
  }

  const findTurnStepIndex = (stepId: string): number => {
    for (let i = items.length - 1; i >= turnStartIndex; i -= 1) {
      const item = items[i]
      if (item.kind === "step" && item.stepId === stepId) {
        return i
      }
    }
    return -1
  }

  const upsertTopLevelTool = (tool: ToolEventData) => {
    if (isNotifyTool(tool)) {
      const notify = toNotifyChild(tool)
      if (!notify) return
      const index = findTurnToolIndex(tool.tool_call_id)
      if (index === -1) {
        items.push(notify)
        return
      }
      const prev = items[index]
      if (prev.kind === "notify") items[index] = notify
      else items.push(notify)
      return
    }

    const index = findTurnToolIndex(tool.tool_call_id)
    const next: TimelineItem = {
      kind: "tool",
      key: `${tool.tool_call_id}@${turnStartIndex}`,
      tool,
    }
    if (index === -1) items.push(next)
    else if (items[index].kind === "tool") items[index] = next
    else items.push(next)
  }

  events.forEach((event, index) => {
    if (
      event.event === "title" ||
      event.event === "plan"
    ) {
      return
    }

    // 回合结束：关闭步骤桶，后续工具不得再挂到已结束的步骤
    if (event.event === "done" || event.event === "wait") {
      openStepKey = null
      return
    }

    if (isErrorEvent(event)) {
      items.push({
        kind: "error",
        key: eventKey(event, index),
        error: event.data.error || "任务执行出错",
        createdAt: event.data.created_at,
      })
      return
    }

    if (isMessageEvent(event)) {
      const data = event.data
      // 新的用户回合：关闭步骤桶并开启新的隔离区间
      if (data.role === "user") {
        openStepKey = null
        turnStartIndex = items.length
      }
      const key = eventKey(event, index)
      const text = data.message?.trim() ?? ""
      if (text) {
        items.push({
          kind: "message",
          key: `${key}-text`,
          role: data.role,
          text,
          createdAt: data.created_at,
        })
      }
      if (data.attachments?.length) {
        items.push({
          kind: "attachments",
          key: `${key}-files`,
          role: data.role,
          files: resolveFileInfoList(data.attachments),
          createdAt: data.created_at,
        })
      }
      return
    }

    if (isStepEvent(event)) {
      const data: StepEventData = event.data
      const existingIndex = findTurnStepIndex(data.id)

      if (existingIndex >= 0) {
        const prev = items[existingIndex]
        if (prev.kind !== "step") return

        // 上一实例已结束且本事件重新 running/pending → 新开步骤实例，避免串到旧问答下
        if (
          isTerminalStep(prev.status) &&
          (data.status === "running" || data.status === "pending")
        ) {
          stepOccurrence += 1
          const key = `step-${data.id}#${stepOccurrence}`
          items.push({
            kind: "step",
            key,
            stepId: data.id,
            status: data.status,
            description: data.description,
            createdAt: data.created_at,
            children: [],
          })
          openStepKey = key
          return
        }

        items[existingIndex] = {
          ...prev,
          status: data.status,
          description: data.description || prev.description,
          createdAt: data.created_at || prev.createdAt,
        }
        // completed/failed 也保持桶开启：merge 后事件序常为
        // step(completed) → tools，关桶会导致工具掉到顶层
        openStepKey = prev.key
        return
      }

      stepOccurrence += 1
      const key = `step-${data.id}#${stepOccurrence}`
      items.push({
        kind: "step",
        key,
        stepId: data.id,
        status: data.status,
        description: data.description,
        createdAt: data.created_at,
        children: [],
      })
      openStepKey = key
      return
    }

    if (isToolEvent(event)) {
      const tool = event.data
      const child = isNotifyTool(tool)
        ? toNotifyChild(tool)
        : toToolChild(tool)
      if (!child) return

      if (!attachToOpenStep(child)) {
        upsertTopLevelTool(tool)
      }
    }
  })

  return items
}

/** 从事件列表提取最新 plan */
export function extractLatestPlan(
  events: AgentSSEEvent[],
): PlanEventData | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (isPlanEvent(event)) return event.data
  }
  return null
}

/** 从事件列表提取发起会话时第一个聊天的 title */
export function extractFirstTitle(
  events: AgentSSEEvent[],
  fallback = "",
): string {
  let firstUserIdx = -1
  let secondUserIdx = -1
  for (let i = 0; i < events.length; i += 1) {
    if (!isUserMessageEvent(events[i])) continue
    if (firstUserIdx < 0) firstUserIdx = i
    else {
      secondUserIdx = i
      break
    }
  }

  const start = firstUserIdx >= 0 ? firstUserIdx : 0
  const end = secondUserIdx >= 0 ? secondUserIdx : events.length
  const turn = events.slice(start, end)

  for (const event of turn) {
    if (isTitleEvent(event) && event.data.title?.trim()) {
      return event.data.title.trim()
    }
  }

  if (firstUserIdx >= 0) {
    const firstUser = events[firstUserIdx]
    if (isMessageEvent(firstUser)) {
      const text = firstUser.data.message?.trim() ?? ""
      if (text) {
        const normalized = text.replace(/\s+/g, " ")
        return normalized.length > 40
          ? `${normalized.slice(0, 39)}…`
          : normalized
      }
    }
  }

  return fallback
}

/** @deprecated 使用 {@link extractFirstTitle}；保留别名以免外部误用最新标题 */
export function extractLatestTitle(
  events: AgentSSEEvent[],
  fallback = "",
): string {
  return extractFirstTitle(events, fallback)
}

/** 取可用于断点续传的最后一条 event_id */
export function getLastEventId(events: AgentSSEEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const id = events[i]?.data?.event_id
    if (typeof id === "string" && id.length > 0) return id
  }
  return null
}

function isUserMessageEvent(event: AgentSSEEvent): boolean {
  return isMessageEvent(event) && event.data.role === "user"
}

/**
 * 合并事件：
 * - 全局按 event_id 去重
 * - tool_call_id / step.id 仅在同一用户回合内覆盖（calling→called / step 状态推进）
 * - 跨用户回合即使 id 相同也追加，避免后一轮工具覆盖前一轮展示
 */
export function mergeAgentEvents(
  prev: AgentSSEEvent[],
  incoming: AgentSSEEvent | AgentSSEEvent[],
): AgentSSEEvent[] {
  const batch = Array.isArray(incoming) ? incoming : [incoming]
  if (batch.length === 0) return prev

  const next = prev.slice()
  const indexByEventId = new Map<string, number>()
  const toolIndexByCallId = new Map<string, number>()
  const stepIndexById = new Map<string, number>()

  const clearTurnScopedIndexes = () => {
    toolIndexByCallId.clear()
    stepIndexById.clear()
  }

  const indexEvent = (event: AgentSSEEvent, index: number) => {
    const eventId = event.data?.event_id
    if (typeof eventId === "string" && eventId.length > 0) {
      indexByEventId.set(eventId, index)
    }
    if (isUserMessageEvent(event)) {
      clearTurnScopedIndexes()
    }
    if (isToolEvent(event)) {
      toolIndexByCallId.set(event.data.tool_call_id, index)
    }
    if (isStepEvent(event)) {
      stepIndexById.set(event.data.id, index)
    }
  }

  next.forEach((event, index) => {
    indexEvent(event, index)
  })

  for (const event of batch) {
    const eventId = event.data?.event_id
    if (typeof eventId === "string" && indexByEventId.has(eventId)) {
      const index = indexByEventId.get(eventId)!
      next[index] = event
      continue
    }

    if (isToolEvent(event)) {
      const existing = toolIndexByCallId.get(event.data.tool_call_id)
      if (existing != null) {
        next[existing] = event
        if (typeof eventId === "string" && eventId.length > 0) {
          indexByEventId.set(eventId, existing)
        }
        continue
      }
    }

    if (isStepEvent(event)) {
      const existing = stepIndexById.get(event.data.id)
      if (existing != null) {
        const prevStep = next[existing]
        // 已结束的 step 若再次 running，视为新回合实例，追加而非覆盖
        if (
          isStepEvent(prevStep) &&
          isTerminalStep(prevStep.data.status) &&
          (event.data.status === "running" || event.data.status === "pending")
        ) {
          // fall through to append
        } else {
          next[existing] = event
          if (typeof eventId === "string" && eventId.length > 0) {
            indexByEventId.set(eventId, existing)
          }
          continue
        }
      }
    }

    const index = next.length
    next.push(event)
    indexEvent(event, index)
  }

  return next
}

export function deriveStatusFromEvent(
  event: AgentSSEEvent,
  current: SessionStatus,
): SessionStatus {
  switch (event.event) {
    case "done":
      return "completed"
    case "wait":
      return "waiting"
    case "error":
      return "completed"
    case "message":
    case "tool":
    case "step":
    case "plan":
    case "title":
      return current === "pending" ? "running" : current
    default:
      return current
  }
}

export function shouldRefreshFiles(event: AgentSSEEvent): boolean {
  if (isMessageEvent(event) && (event.data.attachments?.length ?? 0) > 0) {
    return true
  }
  if (isToolEvent(event)) {
    return (
      event.data.status === "called" &&
      (event.data.name === "file" ||
        event.data.function === "write_file" ||
        event.data.function === "replace_in_file")
    )
  }
  return false
}

export function createOptimisticUserMessageEvent(input: {
  message: string
  attachments?: FileInfo[]
}): MessageSSEEvent {
  const createdAt = Math.floor(Date.now() / 1000)
  return {
    event: "message",
    data: {
      event_id: `optimistic-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: createdAt,
      role: "user",
      message: input.message,
      attachments: resolveFileInfoList(input.attachments ?? []),
    },
  }
}

function isOptimisticEventId(eventId: string | null | undefined): boolean {
  return typeof eventId === "string" && eventId.startsWith("optimistic-")
}

/**
 * 若已有真实用户消息，去掉同文案的乐观用户消息，避免首页跳转后出现两条。
 */
export function dedupeOptimisticUserMessages(
  events: AgentSSEEvent[],
): AgentSSEEvent[] {
  const realUserTexts = new Set<string>()
  for (const event of events) {
    if (
      isMessageEvent(event) &&
      event.data.role === "user" &&
      !isOptimisticEventId(event.data.event_id)
    ) {
      realUserTexts.add(event.data.message.trim())
    }
  }
  if (realUserTexts.size === 0) return events

  return events.filter((event) => {
    if (!isMessageEvent(event)) return true
    if (event.data.role !== "user") return true
    if (!isOptimisticEventId(event.data.event_id)) return true
    return !realUserTexts.has(event.data.message.trim())
  })
}

export { isMessageEvent, isPlanEvent, isTitleEvent, isToolEvent, isStepEvent }
