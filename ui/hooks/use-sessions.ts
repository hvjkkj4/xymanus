"use client"

import { useCallback, useSyncExternalStore } from "react"
import { getSessionActivityAt } from "@/lib/format-session-time"
import {
  isApiError,
  listSessions,
  subscribeSessionsStream,
  type ListSessionItem,
} from "@/lib/api"

interface UseSessionsResult {
  sessions: ListSessionItem[]
  isLoading: boolean
  error: string | null
  /** 本地移除会话（删除成功后调用，流会随后校正） */
  removeSession: (sessionId: string) => void
}

interface SessionsSnapshot {
  sessions: ListSessionItem[]
  isLoading: boolean
  error: string | null
}

const listeners = new Set<() => void>()

let snapshot: SessionsSnapshot = {
  sessions: [],
  isLoading: true,
  error: null,
}

/** 是否已发起过首屏 GET /sessions（全局仅一次） */
let initialFetchStarted = false
/** 是否已建立 sessions SSE（全局仅一次，断开后可重建） */
let streamStarted = false
let streamSub: { abort: () => void } | null = null
/** 流已推送过数据后，忽略可能更旧的首屏 GET 结果 */
let hasStreamUpdate = false
let pagehideBound = false

/**
 * 内存中的首聊标题（不持久化）。
 * 服务端 get_display_title 已是权威首聊标题；此处仅在首聊 title 事件到达、
 * 列表 SSE 尚未推送前，避免侧边栏短暂显示占位名。
 */
const liveFirstTitles = new Map<string, string>()

/** 清理旧版错误锁定缓存，避免把「最新提问」标题永久冻住 */
const LEGACY_TITLE_LOCK_KEYS = [
  "mooc-manus:session-first-titles:v1",
  "mooc-manus:session-first-titles:v2",
]

function clearLegacyTitleLocks() {
  if (typeof window === "undefined") return
  for (const key of LEGACY_TITLE_LOCK_KEYS) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}

let legacyCleared = false

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

function setSnapshot(partial: Partial<SessionsSnapshot>) {
  snapshot = { ...snapshot, ...partial }
  emit()
}

/** 空标题 / 占位标题：允许被首次生成的标题覆盖 */
function isPlaceholderTitle(title: string | null | undefined) {
  const normalized = title?.trim() ?? ""
  return (
    normalized.length === 0 ||
    normalized === "未命名任务" ||
    normalized === "新对话"
  )
}

/**
 * 合并标题：服务端首聊标题为权威。
 * - 正式 incoming 覆盖一切（含纠正历史错误标题）
 * - incoming 为占位时保留已有正式标题
 */
function mergeSessionTitle(
  existingTitle: string | null | undefined,
  incomingTitle: string | null | undefined,
  sessionId: string,
): string {
  const live = liveFirstTitles.get(sessionId)
  if (!isPlaceholderTitle(incomingTitle)) {
    const next = incomingTitle!.trim()
    // 列表已有权威首聊标题时，清掉仅用于首屏占位的 live 缓存
    if (live && live !== next) {
      liveFirstTitles.delete(sessionId)
    }
    return next
  }
  if (live) return live
  if (!isPlaceholderTitle(existingTitle)) {
    return existingTitle!.trim()
  }
  return incomingTitle?.trim() ?? existingTitle?.trim() ?? ""
}

function parseSessionTime(value: string | null | undefined): number {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

/** running 置顶，其余按 latest_message_at ?? created_at 倒序 */
function sortSessions(sessions: ListSessionItem[]): ListSessionItem[] {
  return [...sessions].sort((a, b) => {
    const aRunning = a.status === "running" ? 1 : 0
    const bRunning = b.status === "running" ? 1 : 0
    if (aRunning !== bRunning) return bRunning - aRunning
    return (
      parseSessionTime(getSessionActivityAt(b)) -
      parseSessionTime(getSessionActivityAt(a))
    )
  })
}

function withMergedTitles(sessions: ListSessionItem[]): ListSessionItem[] {
  return sessions.map((item) => ({
    ...item,
    title: mergeSessionTitle(undefined, item.title, item.session_id),
  }))
}

/**
 * 合并会话列表：
 * - 标题以服务端首聊标题为准（可纠正错误的最新提问标题）
 * - 不回退成占位标题
 * - 不回退更新的活跃时间
 */
function mergeSessionLists(
  prev: ListSessionItem[],
  incoming: ListSessionItem[],
): ListSessionItem[] {
  const prevById = new Map(prev.map((item) => [item.session_id, item]))

  const merged = incoming.map((item) => {
    const existing = prevById.get(item.session_id)
    const title = mergeSessionTitle(
      existing?.title,
      item.title,
      item.session_id,
    )

    if (!existing) {
      return { ...item, title }
    }

    const existingAt = parseSessionTime(getSessionActivityAt(existing))
    const incomingAt = parseSessionTime(getSessionActivityAt(item))
    const keepExistingMessage = existingAt > incomingAt

    return {
      ...item,
      title,
      created_at: item.created_at || existing.created_at,
      latest_message: keepExistingMessage
        ? existing.latest_message
        : item.latest_message,
      latest_message_at: keepExistingMessage
        ? existing.latest_message_at
        : item.latest_message_at,
    }
  })

  return sortSessions(merged)
}

/**
 * 首聊 title 事件到达时同步侧边栏（列表 SSE 尚未推送前）。
 * 若侧边栏已有正式标题则不覆盖，避免跟进提问的 title 事件改写。
 */
export function patchSessionTitle(sessionId: string, title: string) {
  const nextTitle = title.trim()
  if (!sessionId || !nextTitle || isPlaceholderTitle(nextTitle)) return

  const index = snapshot.sessions.findIndex(
    (item) => item.session_id === sessionId,
  )

  if (index >= 0 && !isPlaceholderTitle(snapshot.sessions[index].title)) {
    // 已有正式标题：只记下 live，不改写（服务端首聊标题优先）
    return
  }

  if (!liveFirstTitles.has(sessionId)) {
    liveFirstTitles.set(sessionId, nextTitle)
  }
  const locked = liveFirstTitles.get(sessionId)!
  if (index === -1) return
  if (snapshot.sessions[index].title === locked) return

  const sessions = snapshot.sessions.slice()
  sessions[index] = { ...sessions[index], title: locked }
  setSnapshot({ sessions })
}

/** 详情页读取当前会话已确定的首聊标题 */
export function getLockedSessionTitle(sessionId: string): string | null {
  const live = liveFirstTitles.get(sessionId)
  if (live) return live
  const item = snapshot.sessions.find((s) => s.session_id === sessionId)
  const title = item?.title?.trim()
  if (title && !isPlaceholderTitle(title)) return title
  return null
}

function bindPagehideClose() {
  if (pagehideBound || typeof window === "undefined") return
  pagehideBound = true
  window.addEventListener("pagehide", () => {
    streamSub?.abort()
    streamSub = null
    streamStarted = false
  })
}

function startInitialFetch() {
  if (initialFetchStarted) return
  initialFetchStarted = true
  if (!legacyCleared) {
    legacyCleared = true
    clearLegacyTitleLocks()
  }

  listSessions()
    .then((data) => {
      if (hasStreamUpdate) return
      setSnapshot({
        sessions: sortSessions(withMergedTitles(data.sessions)),
        isLoading: false,
        error: null,
      })
    })
    .catch((err: unknown) => {
      if (hasStreamUpdate || snapshot.sessions.length > 0) return
      setSnapshot({
        isLoading: false,
        error: isApiError(err) ? err.message : "加载会话列表失败",
      })
    })
}

function startSessionsStream() {
  if (streamStarted) return
  streamStarted = true
  if (!legacyCleared) {
    legacyCleared = true
    clearLegacyTitleLocks()
  }
  bindPagehideClose()

  streamSub = subscribeSessionsStream({
    onSessions: (data) => {
      hasStreamUpdate = true
      setSnapshot({
        sessions: mergeSessionLists(snapshot.sessions, data.sessions),
        isLoading: false,
        error: null,
      })
    },
    onError: (err: unknown) => {
      streamStarted = false
      streamSub = null
      if (snapshot.sessions.length > 0) return
      setSnapshot({
        error: isApiError(err) ? err.message : "会话列表同步失败",
      })
    },
    onDone: () => {
      streamStarted = false
      streamSub = null
      if (listeners.size > 0) {
        startSessionsStream()
      }
    },
  })
}

function bootstrapSessionsStore() {
  startInitialFetch()
  startSessionsStream()
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  bootstrapSessionsStore()
  return () => {
    listeners.delete(onStoreChange)
  }
}

function getSnapshot() {
  return snapshot
}

const serverSnapshot: SessionsSnapshot = {
  sessions: [],
  isLoading: true,
  error: null,
}

function getServerSnapshot() {
  return serverSnapshot
}

function removeSessionFromStore(sessionId: string) {
  liveFirstTitles.delete(sessionId)
  setSnapshot({
    sessions: snapshot.sessions.filter(
      (item) => item.session_id !== sessionId,
    ),
  })
}

export function useSessions(): UseSessionsResult {
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const removeSession = useCallback((sessionId: string) => {
    removeSessionFromStore(sessionId)
  }, [])

  return {
    sessions: state.sessions,
    isLoading: state.isLoading,
    error: state.error,
    removeSession,
  }
}
