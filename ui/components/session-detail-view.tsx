"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  FileImage,
  Loader2,
  MonitorUp,
  PanelRightClose,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionHeader } from "@/components/session-header";
import { ChatInput } from "@/components/chat-input";
import { PlanPanel } from "@/components/plan-panel";
import { ChatMessage } from "@/components/chat-message";
import { ToolGroup } from "@/components/tool-group";
import { ManusHeader } from "@/components/manus-header";
import { VNCViewer } from "@/components/vnc-viewer";
import { useSessionDetail } from "@/hooks/use-session-detail";
import {
  downloadFileBlob,
  getFileDownloadUrl,
  getSessionVncWsUrl,
  type FileInfo,
  type ToolEventData,
} from "@/lib/api";
import { getToolFamily } from "@/lib/tool-label";
import {
  groupTimelineItems,
  type TimelineItem,
  type TimelineRenderItem,
} from "@/lib/session-timeline";

interface SessionDetailViewProps {
  sessionId: string;
}

type AgentTurnGroup = {
  kind: "agent";
  key: string;
  entries: TimelineRenderItem[];
};

type SingleGroup = {
  kind: "single";
  key: string;
  entry: TimelineRenderItem;
};

type TimelineGroup = AgentTurnGroup | SingleGroup;

function isAgentSideItem(item: TimelineItem): boolean {
  if (item.kind === "message") return item.role === "assistant";
  if (item.kind === "attachments") return item.role === "assistant";
  return (
    item.kind === "notify" ||
    item.kind === "tool" ||
    item.kind === "step" ||
    item.kind === "error"
  );
}

function isAgentSideEntry(entry: TimelineRenderItem): boolean {
  if (entry.kind === "tool_group") return true;
  return isAgentSideItem(entry.item);
}

/**
 * 将连续的 AI 侧内容（助手消息 / 通知 / 工具 / step）归为一组，
 * 组头只渲染一次 manus 标识，对齐官方工具消息布局。
 */
function groupAgentTurns(entries: TimelineRenderItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];

  for (const entry of entries) {
    if (isAgentSideEntry(entry)) {
      const last = groups[groups.length - 1];
      if (last?.kind === "agent") {
        last.entries.push(entry);
      } else {
        groups.push({
          kind: "agent",
          key: `agent-${entry.key}`,
          entries: [entry],
        });
      }
      continue;
    }
    groups.push({ kind: "single", key: entry.key, entry });
  }

  return groups;
}

export function SessionDetailView({ sessionId }: SessionDetailViewProps) {
  const {
    title,
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
    stopSession,
  } = useSessionDetail(sessionId);

  const [localUserDrafts, setLocalUserDrafts] = useState<
    Array<{ key: string; text: string; createdAt: number }>
  >([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const activeDrafts = useMemo(
    () =>
      localUserDrafts.filter(
        (draft) =>
          !timeline.some(
            (item) =>
              item.kind === "message" &&
              item.role === "user" &&
              item.text.trim() === draft.text.trim(),
          ),
      ),
    [localUserDrafts, timeline],
  );

  const visibleTimeline = useMemo(() => {
    if (activeDrafts.length === 0) return timeline;

    const next = [...timeline];
    for (const draft of activeDrafts) {
      next.push({
        kind: "message",
        key: `draft-${draft.key}`,
        role: "user",
        text: draft.text,
        createdAt: draft.createdAt,
      });
    }
    return next;
  }, [activeDrafts, timeline]);

  const renderItems = useMemo(
    () => groupTimelineItems(visibleTimeline),
    [visibleTimeline],
  );
  const timelineGroups = useMemo(
    () => groupAgentTurns(renderItems),
    [renderItems],
  );

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const container = scrollRef.current;
    if (!container) return;
    if (behavior === "auto") {
      container.scrollTop = container.scrollHeight;
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior });
  }

  useEffect(() => {
    shouldStickToBottomRef.current = true;
  }, [sessionId]);

  useEffect(() => {
    if (isLoading) return;
    if (!shouldStickToBottomRef.current) return;

    scrollToBottom("auto");

    const frame = requestAnimationFrame(() => scrollToBottom("auto"));
    const t1 = window.setTimeout(() => scrollToBottom("auto"), 50);
    const t2 = window.setTimeout(() => scrollToBottom("auto"), 200);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [
    sessionId,
    isLoading,
    timeline,
    renderItems.length,
    plan?.steps?.length,
    isSending,
  ]);

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < 80;
    shouldStickToBottomRef.current = atBottom;
  }

  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [toolPreview, setToolPreview] = useState<ToolEventData | null>(null);
  const [previewMode, setPreviewMode] = useState<"file" | "tool" | null>(null);
  const [previewSidebarVisible, setPreviewSidebarVisible] = useState(false);
  const [previewState, setPreviewState] = useState<{
    kind: "loading" | "text" | "image" | "unsupported" | "error";
    content?: string;
    imageUrl?: string;
    error?: string;
  }>({ kind: "loading" });
  const previewObjectUrlRef = useRef<string | null>(null);
  const closePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [browserOverlayOpen, setBrowserOverlayOpen] = useState(false);

  useEffect(() => {
    if (!browserOverlayOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setBrowserOverlayOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [browserOverlayOpen]);

  function clearClosePreviewTimer() {
    if (closePreviewTimerRef.current) {
      clearTimeout(closePreviewTimerRef.current);
      closePreviewTimerRef.current = null;
    }
  }

  function closePreview() {
    clearClosePreviewTimer();
    setPreviewSidebarVisible(false);
    closePreviewTimerRef.current = setTimeout(() => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPreviewFile(null);
      setToolPreview(null);
      setPreviewMode(null);
      setPreviewState({ kind: "loading" });
      setBrowserOverlayOpen(false);
    }, 320);
  }

  function openFilePreview(file: FileInfo) {
    clearClosePreviewTimer();
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setToolPreview(null);
    setPreviewFile(file);
    setPreviewMode("file");
    setPreviewState({ kind: "loading" });
    setPreviewSidebarVisible(true);
  }

  function openToolPreview(tool: ToolEventData) {
    clearClosePreviewTimer();
    setPreviewFile(null);
    setToolPreview(tool);
    setPreviewMode("tool");
    setPreviewState({ kind: "loading" });
    setPreviewSidebarVisible(true);
    setBrowserOverlayOpen(false);
  }

  function jumpToLatestToolPreview() {
    const id = toolPreview?.tool_call_id;
    if (!id) {
      const container = scrollRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
      return;
    }
    const anchor = Array.from(
      document.querySelectorAll("[data-tool-call-id]"),
    ).find(
      (node) => node.getAttribute("data-tool-call-id") === id,
    ) as HTMLElement | null;
    if (anchor) {
      anchor.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const container = scrollRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  function isTextPreviewable(file: FileInfo) {
    const mime = (file.mime_type || "").toLowerCase();
    const ext = (file.extension || "").toLowerCase();
    const textMime = mime.startsWith("text/");
    const textExt = [
      "txt",
      "md",
      "markdown",
      "json",
      "csv",
      "log",
      "yaml",
      "yml",
      "xml",
      "html",
      "htm",
      "js",
      "ts",
      "tsx",
      "jsx",
      "java",
      "py",
      "sql",
      "sh",
      "bash",
    ].includes(ext.replace(/^\./, ""));
    const structuredMime = [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/x-javascript",
      "application/x-yaml",
      "text/x-python",
      "text/csv",
      "text/plain",
      "application/x-www-form-urlencoded",
    ].includes(mime);

    return textMime || textExt || structuredMime;
  }

  function isImagePreviewable(file: FileInfo) {
    return (file.mime_type || "").toLowerCase().startsWith("image/");
  }

  async function handlePreviewFile(file: FileInfo) {
    const next = file || null;
    if (!next?.id) return;

    openFilePreview(next);

    try {
      const blob = await downloadFileBlob(next.id);
      const mime = (next.mime_type || blob.type || "").toLowerCase();
      const canPreviewImage =
        isImagePreviewable(next) || mime.startsWith("image/");

      if (canPreviewImage) {
        const objectUrl = URL.createObjectURL(blob);
        previewObjectUrlRef.current = objectUrl;
        setPreviewState({ kind: "image", imageUrl: objectUrl });
        return;
      }

      if (isTextPreviewable(next) || mime.startsWith("text/")) {
        const content = await blob.text();
        setPreviewState({ kind: "text", content });
        return;
      }

      setPreviewState({
        kind: "unsupported",
        error: "暂不支持预览此类文件，请下载后在本地查看。",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法加载文件预览。";
      setPreviewState({ kind: "error", error: message });
    }
  }

  function coerceString(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    return "";
  }

  function extractStringContent(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const candidates = [
        record.output,
        record.stdout,
        record.stderr,
        record.text,
        record.content,
        record.result,
        record.message,
      ];
      for (const item of candidates) {
        const text = extractStringContent(item);
        if (text) return text;
      }
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "";
      }
    }
    return "";
  }

  function findNestedValue(obj: unknown, keys: string[]): unknown {
    if (!obj || typeof obj !== "object") return undefined;
    const record = obj as Record<string, unknown>;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return record[key];
      }
    }
    return undefined;
  }

  function getScreenshotSource(
    content: unknown,
    args: Record<string, unknown>,
  ): string {
    const explicitSource =
      findNestedValue(content, [
        "screenshot_url",
        "screenshotUrl",
        "screenshot",
        "screenshot_data",
        "screenshotData",
        "image_url",
        "imageUrl",
        "image",
      ]) ??
      findNestedValue(args, [
        "screenshot_url",
        "screenshotUrl",
        "screenshot",
        "screenshot_data",
        "screenshotData",
        "image_url",
        "imageUrl",
        "image",
      ]);
    const source = coerceString(explicitSource);
    if (source) return source;

    const directContent = coerceString(content);
    return directContent.startsWith("data:image/") ? directContent : "";
  }

  function normalizeSearchResults(content: unknown): Array<{
    title: string;
    snippet: string;
    link: string;
  }> {
    const arrays: unknown[] = [];
    if (Array.isArray(content)) arrays.push(...content);
    else if (content && typeof content === "object") {
      const record = content as Record<string, unknown>;
      const resultPool = Array.isArray(record.results)
        ? record.results
        : Array.isArray(record.items)
          ? record.items
          : Array.isArray(record.data)
            ? record.data
            : [];
      if (resultPool.length > 0) arrays.push(...resultPool);
      else if (Array.isArray(record.search_results))
        arrays.push(...record.search_results);
    }

    return arrays
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const title = coerceString(
          findNestedValue(record, ["title", "name", "headline"]) ||
            record.title,
        );
        const snippet = coerceString(
          findNestedValue(record, [
            "snippet",
            "description",
            "summary",
            "abstract",
          ]) ||
            record.snippet ||
            record.description ||
            record.summary,
        );
        const link = coerceString(
          findNestedValue(record, ["link", "url", "href"]) ||
            record.link ||
            record.url,
        );
        if (!title && !snippet && !link) return null;
        return {
          title: title || "搜索结果",
          snippet: snippet || "暂无摘要",
          link: link || "#",
        };
      })
      .filter(Boolean) as Array<{
      title: string;
      snippet: string;
      link: string;
    }>;
  }

  function renderToolPreviewContent(tool: ToolEventData) {
    const family = getToolFamily(tool);
    const args = tool.args ?? {};
    const content = tool.content;
    const command = coerceString(
      findNestedValue(args, ["command"]) || args.command,
    );
    const contentRecord = content as Record<string, unknown> | null;
    const consoleValue =
      contentRecord?.console ?? contentRecord?.console_records;
    const shellOutput = extractStringContent(
      findNestedValue(contentRecord, [
        "console",
        "output",
        "stdout",
        "stderr",
        "text",
        "result",
      ]) ?? content,
    );
    const browserScreenshot = getScreenshotSource(content, args);
    const shellRecords = Array.isArray(consoleValue)
      ? (consoleValue as Array<Record<string, unknown>>)
      : [];
    // 同一个 shell 会话的 console 会累积历史命令，只保留与当前调用匹配的记录，
    // 避免每次工具预览都堆叠整个会话历史。无命令可匹配时退回全部记录。
    const currentCommand = coerceString(args.command);
    const shellRecordsToRender =
      currentCommand && shellRecords.length > 1
        ? shellRecords.filter((r) => String(r.command ?? "") === currentCommand)
        : shellRecords;
    const searchResults = normalizeSearchResults(content);

    if (family === "browser") {
      const imageUrl = browserScreenshot || "";
      const currentUrl = coerceString(
        findNestedValue(args, ["url", "current_url", "currentUrl"]) || args.url,
      );
      return (
        <div className="flex h-full flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="浏览器截图预览"
                className="block w-full h-auto select-none"
              />
            ) : (
              <div className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500">
                <MonitorUp className="h-6 w-6" />
                暂无可用截图
              </div>
            )}
            <button
              type="button"
              title="打开远程浏览器（noVNC）"
              aria-label="打开远程浏览器"
              onClick={() => setBrowserOverlayOpen(true)}
              className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-lg ring-1 ring-slate-200 transition hover:scale-105 hover:bg-white"
            >
              <MonitorUp className="h-5 w-5" />
            </button>
          </div>

          {currentUrl ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                当前页面
              </div>
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-blue-600 underline decoration-blue-300 underline-offset-2"
              >
                {currentUrl}
              </a>
            </div>
          ) : null}
        </div>
      );
    }

    if (family === "search") {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              查询关键词
            </div>
            <div className="mt-1 font-medium text-slate-800">
              {coerceString(args.query) || "搜索结果"}
            </div>
          </div>

          <div className="space-y-3">
            {searchResults.length > 0 ? (
              searchResults.map((item, index) => (
                <a
                  key={`${item.link}-${index}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="mb-1 text-xs text-slate-500">{item.link}</div>
                  <div className="text-base font-medium text-slate-800">
                    {item.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    {item.snippet}
                  </div>
                </a>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                暂无搜索结果信息，等待返回数据…
              </div>
            )}
          </div>
        </div>
      );
    }

    if (family === "shell" || family === "file") {
      const renderedOutput = shellOutput || "暂无可用输出内容。";
      return (
        <div className="space-y-4">
          {shellRecordsToRender.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {shellRecordsToRender.map((record, index) => (
                <div
                  key={`${record?.command ?? index}`}
                  className="border-b border-slate-200 last:border-0"
                >
                  {record?.command ? (
                    <div className="px-3 pt-2 font-mono text-[13px] text-slate-800">
                      <span className="mr-1.5 select-none text-slate-400">
                        $
                      </span>
                      {String(record.command)}
                    </div>
                  ) : null}
                  {record?.output ? (
                    <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[13px] leading-6 text-slate-600">
                      {String(record.output)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <>
              {command ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                    命令
                  </div>
                  <code className="mt-2 block whitespace-pre-wrap break-words text-sm text-slate-700">
                    {command}
                  </code>
                </div>
              ) : null}
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {renderedOutput}
              </pre>
            </>
          )}
        </div>
      );
    }

    if (family === "mcp" || family === "a2a") {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              {family === "mcp" ? "MCP 执行信息" : "A2A 执行信息"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              {tool.name ? (
                <span className="rounded bg-white px-2 py-1">{tool.name}</span>
              ) : null}
              {tool.function ? (
                <span className="rounded bg-white px-2 py-1">
                  {tool.function}
                </span>
              ) : null}
            </div>
          </div>

          <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {typeof content === "string" && content.trim()
              ? content
              : JSON.stringify(content ?? args, null, 2)}
          </pre>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
            执行结果
          </div>
          <div className="mt-2 font-medium">{tool.function || "未知工具"}</div>
        </div>
        <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {typeof content === "string" && content.trim()
            ? content
            : JSON.stringify(content ?? args, null, 2)}
        </pre>
      </div>
    );
  }

  function renderEntry(
    entry: TimelineRenderItem,
    options?: { hideManusHeader?: boolean },
  ) {
    if (entry.kind === "tool_group") {
      return (
        <ToolGroup
          key={entry.key}
          tools={entry.tools}
          preferExpanded={false}
          onPreviewTool={openToolPreview}
        />
      );
    }
    return (
      <ChatMessage
        key={entry.key}
        item={entry.item}
        hideManusHeader={options?.hideManusHeader}
        onViewAllFiles={() => setFilesDialogOpen(true)}
        onPreviewFile={handlePreviewFile}
        onPreviewTool={openToolPreview}
      />
    );
  }

  const activePreviewTitle =
    previewMode === "file" && previewFile
      ? previewFile.filename || previewFile.filepath || "文件预览"
      : toolPreview
        ? `${toolPreview.name || "工具"} 预览`
        : "预览";
  const activePreviewSubtitle =
    previewMode === "file" && previewFile
      ? previewFile.mime_type || "文件内容预览"
      : toolPreview
        ? toolPreview.function || "工具执行详情"
        : "工具执行详情";
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-row overflow-hidden px-3">
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 transition-all duration-200">
        <SessionHeader
          title={title}
          files={files}
          filesDialogOpen={filesDialogOpen}
          onFilesDialogOpenChange={setFilesDialogOpen}
        />

        <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col sm:max-w-[54rem] sm:min-w-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="no-scrollbar flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pt-3 pb-10"
          >
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center py-16 text-gray-500">
                <Loader2 className="mr-2 size-5 animate-spin" />
                加载任务详情…
              </div>
            ) : null}

            {!isLoading && error && timeline.length === 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            {!isLoading && !error && timeline.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-500">
                暂无消息，在下方输入框继续任务
              </div>
            ) : null}

            {timelineGroups.map((group) => {
              if (group.kind === "single") {
                return renderEntry(group.entry);
              }

              return (
                <div
                  key={group.key}
                  className="flex flex-col gap-3 w-full min-w-0 mt-3"
                >
                  <ManusHeader />
                  {group.entries.map((entry) =>
                    renderEntry(entry, { hideManusHeader: true }),
                  )}
                </div>
              );

              {
                !isLoading &&
                !error &&
                isStreaming &&
                !timeline.some(isAgentSideItem) ? (
                  <div className="flex items-center gap-2 px-1 py-2 text-sm text-gray-500">
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>正在思考中...</span>
                  </div>
                ) : null;
              }
            })}
          </div>

          <div className="mt-auto min-w-0 shrink-0 bg-[#f8f8f7] pt-2">
            {!browserOverlayOpen ? (
              <PlanPanel className="mb-2" plan={plan} />
            ) : null}
            <ChatInput
              className="mb-4"
              isSending={isSending}
              onStop={() => void stopSession()}
              onSend={async ({ message, attachmentIds, attachmentFiles }) => {
                const nextMessage = message.trim();
                if (!nextMessage) return;

                shouldStickToBottomRef.current = true;
                setLocalUserDrafts((prev) => [
                  ...prev,
                  {
                    key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    text: nextMessage,
                    createdAt: Date.now() / 1000,
                  },
                ]);

                await sendMessage({
                  message: nextMessage,
                  attachmentIds,
                  attachmentFiles,
                });
              }}
            />
          </div>
        </div>
      </div>

      <aside
        className={[
          "shrink-0 h-full overflow-hidden bg-white transition-all duration-300 ease-out",
          previewSidebarVisible
            ? "w-[680px] min-w-[680px]"
            : "w-0 min-w-0 opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden={!previewSidebarVisible}
      >
        <div className="flex h-full w-[680px] min-w-[680px] flex-col border-l border-slate-200 shadow-[inset_1px_0_0_rgba(148,163,184,0.12)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f7f7f7] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">
                {activePreviewTitle}
              </div>
              <div className="truncate text-xs text-slate-500">
                {activePreviewSubtitle}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {previewMode === "file" && previewFile ? (
                <a
                  href={getFileDownloadUrl(previewFile.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-[#f8fafc] px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <Download className="size-3.5" />
                  下载
                </a>
              ) : null}
              <button
                type="button"
                onClick={closePreview}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
                aria-label="关闭预览"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-400/80">
            {previewMode === "file" ? (
              <>
                {previewState.kind === "loading" ? (
                  <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="size-4 animate-spin" />
                    正在加载文件预览…
                  </div>
                ) : null}

                {previewState.kind === "text" ? (
                  <pre className="whitespace-pre-wrap break-words bg-transparent p-0 text-sm leading-6 text-slate-700">
                    {previewState.content ?? ""}
                  </pre>
                ) : null}

                {previewState.kind === "image" && previewState.imageUrl ? (
                  <div className="flex min-h-[240px] items-center justify-center overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <Image
                      src={previewState.imageUrl}
                      alt={previewFile?.filename || "图片预览"}
                      width={1200}
                      height={800}
                      unoptimized
                      className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
                    />
                  </div>
                ) : null}

                {previewState.kind === "unsupported" ||
                previewState.kind === "error" ? (
                  <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
                    {previewState.kind === "unsupported" ? (
                      <FileImage className="size-8 text-slate-400" />
                    ) : (
                      <TriangleAlert className="size-8 text-amber-500" />
                    )}
                    <div className="text-sm text-slate-600">
                      {previewState.error || "暂不支持预览此类文件。"}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {previewMode === "tool" && toolPreview
              ? renderToolPreviewContent(toolPreview)
              : null}
          </div>

          <div className="border-t border-slate-200 bg-[#f7f7f7] p-3">
            <button
              type="button"
              onClick={jumpToLatestToolPreview}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowUpRight className="size-4" />
              跳转实时
            </button>
          </div>
        </div>
      </aside>

      {browserOverlayOpen && toolPreview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-3 text-white">
            <div>
              <div className="text-sm font-medium">远程浏览器</div>
              <div className="text-xs text-slate-400">
                {toolPreview.function || "browser"} · noVNC
              </div>
            </div>
            <div className="text-xs text-slate-500">
              沙箱桌面由 noVNC 实时托管
            </div>
          </div>
          <div className="relative min-h-0 flex-1 bg-black">
            <VNCViewer url={getSessionVncWsUrl(sessionId)} viewOnly={false} />
          </div>
          <div className="flex shrink-0 items-center justify-center border-t border-slate-800 bg-slate-950/95 px-4 py-3">
            <button
              type="button"
              onClick={() => setBrowserOverlayOpen(false)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              退出远程桌面
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
