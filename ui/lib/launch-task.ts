import {
  createSession,
  isApiError,
  subscribeChatStream,
  type AgentSSEEvent,
  type ChatRequest,
  type FileInfo,
} from "@/lib/api";
import { createOptimisticUserMessageEvent } from "@/lib/session-timeline";
import { resolveFileInfoList } from "@/lib/file-meta";

export interface LaunchTaskInput {
  message: string;
  /** 已上传附件的 file id 列表（发给后端） */
  attachments?: string[];
  /** 完整附件元信息（用于首屏乐观渲染，避免显示 UUID） */
  attachmentFiles?: FileInfo[];
}

type EventListener = (event: AgentSSEEvent) => void;
type ErrorListener = (error: unknown) => void;
type DoneListener = () => void;

interface LaunchStreamEntry {
  abort: () => void;
  /** 尚未被详情页消费的缓冲事件 */
  buffer: AgentSSEEvent[];
  eventListeners: Set<EventListener>;
  errorListeners: Set<ErrorListener>;
  doneListeners: Set<DoneListener>;
  done: boolean;
}

/** 模块级：首页发起的 SSE 在路由跳转后仍保持，供详情页接管 */
const activeStreams = new Map<string, LaunchStreamEntry>();
/**
 * 首条用户消息的乐观缓存（详情页打开即可展示，不等待落库）。
 * 可被详情页多次取用（React StrictMode 在 dev 会双跑 effect），
 * 直到真实用户消息已从历史合并后才由 {@link releaseLaunchSeedUserEvent} 释放，
 * 避免「发送后跳转详情页只有 AI 消息、刷新后人类消息才出现」。
 */
const seedUserEvents = new Map<string, AgentSSEEvent>();

function toErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

/**
 * 创建空白会话并流式发起首条聊天。
 * 事件会缓冲在模块级，详情页可通过 {@link adoptLaunchStream} 接管，避免跳转时被 abort。
 */
export async function launchTask(input: LaunchTaskInput): Promise<string> {
  const message = input.message.trim();
  if (!message) {
    throw new Error("请输入任务内容");
  }

  if (input.attachments?.some((id) => !id.trim())) {
    throw new Error("附件信息不完整，请重新上传后再试");
  }

  const { session_id } = await createSession();

  activeStreams.get(session_id)?.abort();
  activeStreams.delete(session_id);

  const seedUserEvent = createOptimisticUserMessageEvent({
    message,
    attachments: resolveFileInfoList(input.attachmentFiles ?? []),
  });
  seedUserEvents.set(session_id, seedUserEvent);

  const entry: LaunchStreamEntry = {
    abort: () => undefined,
    buffer: [],
    eventListeners: new Set(),
    errorListeners: new Set(),
    doneListeners: new Set(),
    done: false,
  };

  const payload: ChatRequest = {
    message,
    attachments: input.attachments?.length ? input.attachments : [],
    event_id: null,
    timestamp: Math.floor(Date.now() / 1000),
  };

  const subscription = subscribeChatStream(session_id, payload, {
    onEvent: (event) => {
      if (entry.eventListeners.size === 0) {
        entry.buffer.push(event);
      } else {
        for (const listener of entry.eventListeners) listener(event);
      }
    },
    onError: (error) => {
      entry.done = true;
      if (isApiError(error) || error instanceof Error) {
        console.error(
          `[launchTask] session=${session_id} stream error:`,
          toErrorMessage(error, "聊天流异常"),
        );
      }
      for (const listener of entry.errorListeners) listener(error);
      activeStreams.delete(session_id);
    },
    onDone: () => {
      entry.done = true;
      for (const listener of entry.doneListeners) listener();
      activeStreams.delete(session_id);
    },
  });

  entry.abort = subscription.abort;
  activeStreams.set(session_id, entry);
  return session_id;
}

export interface AdoptLaunchStreamHandlers {
  onEvent: EventListener;
  onError?: ErrorListener;
  onDone?: DoneListener;
}

/**
 * 取出首页首条用户消息（可跨多次挂载重复取出），供详情页立刻渲染。
 * 这里不消费、不删除：StrictMode 等导致的重复 effect 每次都能再取到，
 * 待真实用户消息落库并合并后再由 {@link releaseLaunchSeedUserEvent} 释放。
 */
export function takeLaunchSeedUserEvent(
  sessionId: string,
): AgentSSEEvent | null {
  return seedUserEvents.get(sessionId) ?? null;
}

/** 真实用户消息已从历史中合并后释放乐观种子，避免长期驻留内存 */
export function releaseLaunchSeedUserEvent(sessionId: string): void {
  seedUserEvents.delete(sessionId);
}

/**
 * 详情页接管首页启动流：回放缓冲事件并继续监听。
 * @returns 是否成功接管；失败时详情页应自行 getSession + 空 JSON 续流
 */
export function adoptLaunchStream(
  sessionId: string,
  handlers: AdoptLaunchStreamHandlers,
): { release: () => void } | null {
  const entry = activeStreams.get(sessionId);
  if (!entry || entry.done) return null;

  const buffered = entry.buffer.splice(0, entry.buffer.length);
  for (const event of buffered) {
    handlers.onEvent(event);
  }

  entry.eventListeners.add(handlers.onEvent);
  if (handlers.onError) entry.errorListeners.add(handlers.onError);
  if (handlers.onDone) entry.doneListeners.add(handlers.onDone);

  return {
    release: () => {
      entry.eventListeners.delete(handlers.onEvent);
      if (handlers.onError) entry.errorListeners.delete(handlers.onError);
      if (handlers.onDone) entry.doneListeners.delete(handlers.onDone);
    },
  };
}

/** 是否仍有可接管的启动流 */
export function hasLaunchStream(sessionId: string): boolean {
  const entry = activeStreams.get(sessionId);
  return Boolean(entry && !entry.done);
}

/** 主动取消某个会话的启动流（发送新消息前 / 显式停止时） */
export function abortTaskStream(sessionId: string): void {
  const entry = activeStreams.get(sessionId);
  if (!entry) return;
  entry.abort();
  activeStreams.delete(sessionId);
}
