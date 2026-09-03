"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  clearUnreadMessageCount,
  getSession,
  getSessionFiles,
  isApiError,
  stopSession,
  subscribeChatStream,
  type AgentSSEEvent,
  type FileInfo,
  type PlanEventData,
  type SessionStatus,
} from "@/lib/api";
import { rememberUploadedFile, resolveFileInfoList } from "@/lib/file-meta";
import {
  abortTaskStream,
  adoptLaunchStream,
  hasLaunchStream,
  releaseLaunchSeedUserEvent,
  takeLaunchSeedUserEvent,
} from "@/lib/launch-task";
import { patchSessionTitle, getLockedSessionTitle } from "@/hooks/use-sessions";
import {
  createOptimisticUserMessageEvent,
  dedupeOptimisticUserMessages,
  deriveStatusFromEvent,
  extractFirstTitle,
  extractLatestPlan,
  getLastEventId,
  isPlanEvent,
  isTitleEvent,
  mergeAgentEvents,
  projectTimeline,
  shouldRefreshFiles,
  type TimelineItem,
} from "@/lib/session-timeline";

export interface SendSessionMessageInput {
  message: string;
  attachmentIds: string[];
  attachmentFiles?: FileInfo[];
}

export interface UseSessionDetailResult {
  sessionId: string;
  title: string;
  status: SessionStatus;
  plan: PlanEventData | null;
  timeline: TimelineItem[];
  files: FileInfo[];
  isLoading: boolean;
  isStreaming: boolean;
  isSending: boolean;
  error: string | null;
  filesDialogOpen: boolean;
  setFilesDialogOpen: (open: boolean) => void;
  sendMessage: (input: SendSessionMessageInput) => Promise<void>;
  stopSession: () => Promise<void>;
  refreshFiles: () => Promise<void>;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

function isActiveStatus(status: SessionStatus): boolean {
  return status === "running" || status === "pending";
}

function isPlaceholderTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim() ?? "";
  return (
    normalized.length === 0 ||
    normalized === "未命名任务" ||
    normalized === "新对话"
  );
}

function normalizeCompletedEvents(events: AgentSSEEvent[]): AgentSSEEvent[] {
  return events.map((event) => {
    if (event.event === "step" && event.data.status === "running") {
      return {
        ...event,
        data: { ...event.data, status: "failed" as const },
      };
    }
    if (event.event === "tool" && event.data.status === "calling") {
      return {
        ...event,
        data: { ...event.data, status: "called" as const },
      };
    }
    return event;
  });
}

type StreamPayload = {
  message?: string | null;
  attachments?: string[];
  eventId?: string | null;
  asSend?: boolean;
};

/**
 * 任务详情：拉取历史事件 + 接管首页启动流 / 空 JSON 续流 + 发送跟进消息。
 */
export function useSessionDetail(sessionId: string): UseSessionDetailResult {
  const [title, setTitle] = useState("未命名任务");
  const [status, setStatus] = useState<SessionStatus>("pending");
  const [events, setEvents] = useState<AgentSSEEvent[]>([]);
  const [plan, setPlan] = useState<PlanEventData | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);

  const streamRef = useRef<{ abort: () => void } | null>(null);
  const launchReleaseRef = useRef<(() => void) | null>(null);
  const filesRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const mountedRef = useRef(true);
  const sessionIdRef = useRef(sessionId);
  const streamGenerationRef = useRef(0);
  const eventsRef = useRef<AgentSSEEvent[]>([]);
  const titleRef = useRef("未命名任务");

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const timeline = useMemo(() => projectTimeline(events), [events]);

  const isCurrentSession = useCallback((targetSessionId: string) => {
    return mountedRef.current && sessionIdRef.current === targetSessionId;
  }, []);

  const stopLocalStream = useCallback((markEventsStopped = false) => {
    streamRef.current?.abort();
    streamRef.current = null;
    launchReleaseRef.current?.();
    launchReleaseRef.current = null;
    if (mountedRef.current) {
      if (markEventsStopped) {
        const stoppedEvents = eventsRef.current.map((event) => {
          if (event.event === "step" && event.data.status === "running") {
            return {
              ...event,
              data: { ...event.data, status: "failed" as const },
            };
          }
          if (event.event === "tool" && event.data.status === "calling") {
            return {
              ...event,
              data: { ...event.data, status: "called" as const },
            };
          }
          return event;
        });
        eventsRef.current = stoppedEvents;
        setEvents(stoppedEvents);
      }
      setIsStreaming(false);
      setIsSending(false);
    }
  }, []);

  const refreshFiles = useCallback(async () => {
    const targetSessionId = sessionId;
    try {
      const data = await getSessionFiles(targetSessionId);
      if (!isCurrentSession(targetSessionId)) return;
      const files = resolveFileInfoList(data.files).map(rememberUploadedFile);
      setFiles(files);
    } catch (err) {
      console.error("[useSessionDetail] refreshFiles failed:", err);
    }
  }, [isCurrentSession, sessionId]);

  const scheduleFilesRefresh = useCallback(() => {
    if (filesRefreshTimerRef.current) {
      clearTimeout(filesRefreshTimerRef.current);
    }
    filesRefreshTimerRef.current = setTimeout(() => {
      void refreshFiles();
    }, 400);
  }, [refreshFiles]);

  const applyEvent = useCallback(
    (event: AgentSSEEvent, targetSessionId: string) => {
      if (!isCurrentSession(targetSessionId)) return;

      // 同步更新 eventsRef，避免 bootstrap 与流事件竞态时读到旧列表
      const merged = mergeAgentEvents(eventsRef.current, event);
      eventsRef.current = merged;
      setEvents(merged);

      if (isTitleEvent(event) && event.data.title?.trim()) {
        // 会话标题锁定为首个正式标题，后续提问的 title 事件忽略
        if (isPlaceholderTitle(titleRef.current)) {
          const nextTitle = event.data.title.trim();
          titleRef.current = nextTitle;
          setTitle(nextTitle);
          patchSessionTitle(targetSessionId, nextTitle);
        }
      }
      if (isPlanEvent(event)) {
        setPlan(event.data);
      }

      setStatus((prev) => deriveStatusFromEvent(event, prev));

      if (shouldRefreshFiles(event)) {
        scheduleFilesRefresh();
      }
    },
    [isCurrentSession, scheduleFilesRefresh],
  );

  const startStream = useCallback(
    (payload: StreamPayload) => {
      const targetSessionId = sessionId;
      const generation = ++streamGenerationRef.current;

      // 发送新消息前结束首页启动流与本地续流，避免双连接
      launchReleaseRef.current?.();
      launchReleaseRef.current = null;
      abortTaskStream(targetSessionId);
      streamRef.current?.abort();
      streamRef.current = null;

      if (payload.asSend) setIsSending(true);
      setIsStreaming(true);
      setError(null);

      const subscription = subscribeChatStream(
        targetSessionId,
        {
          message: payload.message ?? null,
          attachments: payload.attachments ?? [],
          event_id: payload.eventId ?? null,
          timestamp: Math.floor(Date.now() / 1000),
        },
        {
          onEvent: (event) => {
            if (streamGenerationRef.current !== generation) return;
            applyEvent(event, targetSessionId);
          },
          onError: (err) => {
            if (streamGenerationRef.current !== generation) return;
            if (!isCurrentSession(targetSessionId)) return;
            setIsStreaming(false);
            setIsSending(false);
            streamRef.current = null;
            const message = toErrorMessage(err, "事件流异常");
            setError(message);
            toast.error(message);
          },
          onDone: () => {
            if (streamGenerationRef.current !== generation) return;
            if (!isCurrentSession(targetSessionId)) return;
            setIsStreaming(false);
            setIsSending(false);
            streamRef.current = null;
            void refreshFiles();
          },
        },
      );

      streamRef.current = { abort: subscription.abort };
    },
    [applyEvent, isCurrentSession, refreshFiles, sessionId],
  );

  const startStreamRef = useRef(startStream);
  const stopLocalStreamRef = useRef(stopLocalStream);
  const applyEventRef = useRef(applyEvent);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    startStreamRef.current = startStream;
    stopLocalStreamRef.current = stopLocalStream;
    applyEventRef.current = applyEvent;
  }, [applyEvent, sessionId, startStream, stopLocalStream]);

  // 初始加载：优先接管首页启动流，否则 getSession + 空 JSON 续流
  useEffect(() => {
    mountedRef.current = true;
    sessionIdRef.current = sessionId;
    const bootstrapGeneration = ++streamGenerationRef.current;
    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setError(null);
      setEvents([]);
      eventsRef.current = [];
      setPlan(null);
      setFiles([]);
      // 若侧边栏已锁定首聊标题，详情头与之对齐，避免点开后又跳成另一套标题
      const lockedTitle = getLockedSessionTitle(sessionId);
      titleRef.current = lockedTitle || "未命名任务";
      setTitle(lockedTitle || "未命名任务");
      setStatus("pending");
      setIsStreaming(false);
      setIsSending(false);
      stopLocalStreamRef.current();

      // 首页跳转进来：立刻展示人类消息，不必等 getSession
      const seedUserEvent = takeLaunchSeedUserEvent(sessionId);
      if (seedUserEvent) {
        setEvents([seedUserEvent]);
        eventsRef.current = [seedUserEvent];
        setStatus("running");
        setIsLoading(false);
      }

      try {
        // 1) 先接管首页流（不要 abort），避免首聊请求被取消
        const adopted = hasLaunchStream(sessionId)
          ? adoptLaunchStream(sessionId, {
              onEvent: (event) => {
                if (streamGenerationRef.current !== bootstrapGeneration) return;
                applyEventRef.current(event, sessionId);
              },
              onError: (err) => {
                if (streamGenerationRef.current !== bootstrapGeneration) return;
                if (!isCurrentSession(sessionId)) return;
                setIsStreaming(false);
                launchReleaseRef.current = null;
                const message = toErrorMessage(err, "事件流异常");
                setError(message);
                toast.error(message);
              },
              onDone: () => {
                if (streamGenerationRef.current !== bootstrapGeneration) return;
                if (!isCurrentSession(sessionId)) return;
                setIsStreaming(false);
                launchReleaseRef.current = null;
                void refreshFiles();
              },
            })
          : null;

        if (adopted) {
          if (streamGenerationRef.current !== bootstrapGeneration) {
            adopted.release();
            return;
          }
          launchReleaseRef.current = adopted.release;
          setIsStreaming(true);
          setIsSending(true);
        }

        // 2) 拉取已落库历史，与启动流事件合并
        const [session, filesData] = await Promise.all([
          getSession(sessionId),
          getSessionFiles(sessionId).catch(() => ({ files: [] as FileInfo[] })),
        ]);
        if (
          cancelled ||
          streamGenerationRef.current !== bootstrapGeneration ||
          !isCurrentSession(sessionId)
        ) {
          return;
        }

        const nextEvents = session.events ?? [];
        // 同步合并：勿依赖 setState updater 时机，否则 title/plan 会读到旧 eventsRef
        const merged = dedupeOptimisticUserMessages(
          mergeAgentEvents(eventsRef.current, nextEvents),
        );
        const displayEvents =
          session.status === "completed"
            ? normalizeCompletedEvents(merged)
            : merged;
        eventsRef.current = displayEvents;
        setEvents(displayEvents);

        // 首聊真实用户消息已从历史中拿到：释放乐观种子，避免下次挂载重复注入；
        // 若尚未落库则保留，供 StrictMode 二次挂载等场景继续兜底渲染人类消息
        const hasPersistedUserMessage = displayEvents.some(
          (event) =>
            event.event === "message" &&
            event.data?.role === "user" &&
            !String(event.data?.event_id ?? "").startsWith("optimistic-"),
        );
        if (hasPersistedUserMessage) {
          releaseLaunchSeedUserEvent(sessionId);
        }

        const titleFromEvents = extractFirstTitle(displayEvents, "");
        const lockedTitle = getLockedSessionTitle(sessionId);
        // 已锁定优先（与侧边栏一致）；否则用事件首个 title 并锁定
        const nextTitle =
          lockedTitle ||
          titleFromEvents ||
          session.title?.trim() ||
          "未命名任务";
        titleRef.current = nextTitle;
        setTitle(nextTitle);
        if (!lockedTitle && titleFromEvents) {
          patchSessionTitle(sessionId, titleFromEvents);
        }

        // 输入框上方列表：取事件流中最新 plan；若历史尚未落库则保留启动流已写入的 plan
        setPlan((prev) => extractLatestPlan(displayEvents) ?? prev);
        setStatus((prev) => {
          // 本会话启动流已在跑时保留实时状态，否则以服务端为准
          if (adopted && (prev === "running" || prev === "waiting")) {
            return prev;
          }
          return session.status;
        });
        setFiles(
          resolveFileInfoList(filesData.files).map(rememberUploadedFile),
        );
        setIsLoading(false);

        void clearUnreadMessageCount(sessionId).catch(() => undefined);

        // 3) 无启动流可接管时，对未完成任务空 JSON 续流
        if (!adopted && isActiveStatus(session.status)) {
          startStreamRef.current({
            message: null,
            attachments: [],
            eventId: getLastEventId(displayEvents),
          });
        }
      } catch (err) {
        if (
          cancelled ||
          streamGenerationRef.current !== bootstrapGeneration ||
          !isCurrentSession(sessionId)
        ) {
          return;
        }
        setIsLoading(false);
        const message = toErrorMessage(err, "加载任务详情失败");
        setError(message);
        toast.error(message);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      streamGenerationRef.current += 1;
      // 仅解除监听，不 abort 首页启动流，避免打断 Agent
      launchReleaseRef.current?.();
      launchReleaseRef.current = null;
      streamRef.current?.abort();
      streamRef.current = null;
      if (filesRefreshTimerRef.current) {
        clearTimeout(filesRefreshTimerRef.current);
      }
    };
  }, [sessionId, refreshFiles, isCurrentSession]);

  const sendMessage = useCallback(
    async (input: SendSessionMessageInput) => {
      const message = input.message.trim();
      if (!message) {
        toast.error("请输入任务内容");
        return;
      }
      const optimistic = createOptimisticUserMessageEvent({
        message,
        attachments: input.attachmentFiles ?? [],
      });
      const merged = mergeAgentEvents(eventsRef.current, optimistic);
      eventsRef.current = merged;
      setEvents(merged);
      // 新提问先清空上一问 plan，避免输入框上方残留旧任务步骤
      setPlan(null);
      setStatus((prev) =>
        prev === "completed" || prev === "waiting" || prev === "pending"
          ? "running"
          : prev,
      );

      startStream({
        message,
        attachments: input.attachmentIds,
        eventId: getLastEventId(
          merged.filter(
            (event) =>
              !String(event.data?.event_id ?? "").startsWith("optimistic-"),
          ),
        ),
        asSend: true,
      });
    },
    [startStream],
  );

  const stopCurrentSession = useCallback(async () => {
    if (!sessionId) return;
    stopLocalStream(true);
    try {
      await stopSession(sessionId);
    } catch (error) {
      const message = toErrorMessage(error, "停止任务失败");
      toast.error(message);
    }
  }, [sessionId, stopLocalStream]);

  return {
    sessionId,
    title,
    status,
    plan,
    timeline,
    files,
    isLoading,
    isStreaming,
    isSending,
    error,
    filesDialogOpen,
    setFilesDialogOpen,
    sendMessage,
    stopSession: stopCurrentSession,
    refreshFiles,
  };
}
