"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolUse } from "@/components/tool-use";
import { ToolGroup } from "@/components/tool-group";
import { ManusHeader } from "@/components/manus-header";
import { AttachmentsMessage } from "@/components/attachments-message";
import { MarkdownContent } from "@/components/markdown-content";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { groupStepChildren, type TimelineItem } from "@/lib/session-timeline";
import type { FileInfo } from "@/lib/api";

interface ChatMessageProps {
  className?: string;
  item: TimelineItem;
  /** 已由外层 Agent 块渲染过 manus 标识时隐藏 */
  hideManusHeader?: boolean;
  onViewAllFiles?: () => void;
  onPreviewFile?: (file: FileInfo) => void;
  onPreviewTool?: (tool: any) => void;
}

/** 工具通知文案：message_notify_user / message_ask_user */
function NotifyMessage({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-gray-600 text-sm leading-6 whitespace-pre-line",
        className,
      )}
    >
      {text}
    </p>
  );
}

/**
 * Step 容器：step 开始到完成之间的通知 + 工具调用。
 * 默认可折叠；运行中自动展开，完成后保持展开（避免时间线与工具对齐跳动）。
 */
function StepMessage({
  item,
  onPreviewTool,
}: {
  item: Extract<TimelineItem, { kind: "step" }>;
  onPreviewTool?: (tool: any) => void;
}) {
  const isDone = item.status === "completed";
  const isFailed = item.status === "failed";
  const isRunning = item.status === "running";
  const [expanded, setExpanded] = useState(true);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (userToggled) return;
    if (isRunning) setExpanded(true);
  }, [isRunning, userToggled]);

  const blocks = groupStepChildren(item.children);
  const hasChildren = item.children.length > 0;

  return (
    <div className="flex flex-col gap-1 w-full min-w-0">
      <button
        type="button"
        className={cn(
          "text-sm w-full flex gap-2 justify-between items-center text-left text-gray-700 rounded-lg py-0.5",
          hasChildren && "cursor-pointer hover:bg-black/2",
        )}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => {
          if (!hasChildren) return;
          setUserToggled(true);
          setExpanded((value) => !value);
        }}
      >
        <div className="flex flex-row gap-2 items-center min-w-0 flex-1">
          <div
            className={cn(
              "w-4 h-4 shrink-0 flex items-center justify-center border rounded-full",
              isDone && "bg-gray-300 border-gray-300",
              isFailed && "bg-red-400 border-red-400",
              isRunning && "bg-white border-gray-300",
              item.status === "pending" && "bg-white border-gray-200",
            )}
          >
            {isDone || isFailed ? (
              <CheckIcon className="text-white" size={10} />
            ) : isRunning ? (
              <Loader2 className="animate-spin text-gray-500" size={10} />
            ) : null}
          </div>
          <div className="font-medium text-gray-700 break-words min-w-0">
            {item.description}
          </div>
        </div>
        {hasChildren ? (
          <ChevronDown
            size={16}
            className={cn(
              "text-gray-500 transition-transform shrink-0",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        ) : null}
      </button>

      {expanded && hasChildren ? (
        <div className="flex min-w-0">
          <div className="w-6 relative shrink-0">
            <div className="absolute left-2 top-0 bottom-0 border-l border-dashed border-gray-200" />
          </div>
          <div className="flex flex-col gap-3 flex-1 min-w-0 overflow-hidden pt-2 pb-1">
            {blocks.map((block) => {
              if (block.kind === "notify") {
                return <NotifyMessage key={block.key} text={block.item.text} />;
              }
              return (
                <ToolGroup
                  key={block.key}
                  tools={block.tools}
                  preferExpanded={isRunning}
                  onPreviewTool={onPreviewTool}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ChatMessage({
  className,
  item,
  hideManusHeader = false,
  onViewAllFiles,
  onPreviewFile,
  onPreviewTool,
}: ChatMessageProps) {
  if (item.kind === "message" && item.role === "user") {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-end justify-end gap-1 group mt-3",
          className,
        )}
      >
        <div className="flex items-end">
          <div className="flex items-center justify-end gap-1 invisible group-hover:visible">
            <div className="float-right transition text-xs text-gray-500 invisible group-hover:visible">
              {formatRelativeTime(item.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex max-w-[90%] relative flex-col gap-2 items-end">
          <div className="text-gray-700 relative rounded-lg overflow-hidden bg-white p-3 border">
            <MarkdownContent
              content={item.text}
              className="text-sm leading-6"
            />
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === "message" && item.role === "assistant") {
    return (
      <div className={cn("flex flex-col gap-2 w-full group", className)}>
        {!hideManusHeader ? (
          <ManusHeader
            trailing={
              <div className="float-right transition text-xs text-gray-500 invisible group-hover:visible">
                {formatRelativeTime(item.createdAt)}
              </div>
            }
          />
        ) : null}
        <MarkdownContent content={item.text} />
      </div>
    );
  }

  if (item.kind === "attachments") {
    return (
      <AttachmentsMessage
        className={className}
        role={item.role}
        files={item.files}
        onViewAllFiles={onViewAllFiles}
        onPreviewFile={onPreviewFile}
      />
    );
  }

  if (item.kind === "tool") {
    return (
      <ToolUse
        className={className}
        tool={item.tool}
        onPreviewTool={onPreviewTool}
      />
    );
  }

  if (item.kind === "notify") {
    return <NotifyMessage className={className} text={item.text} />;
  }

  if (item.kind === "step") {
    return (
      <div className={className}>
        <StepMessage item={item} onPreviewTool={onPreviewTool} />
      </div>
    );
  }

  if (item.kind === "error") {
    return (
      <div
        className={cn(
          "mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600",
          className,
        )}
      >
        {item.error}
      </div>
    );
  }

  return null;
}
