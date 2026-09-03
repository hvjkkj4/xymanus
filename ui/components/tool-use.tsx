"use client";

import {
  FileText,
  Globe,
  Loader2,
  Search,
  SquareChevronRight,
  SquareTerminal,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getToolFamily, getToolLabel } from "@/lib/tool-label";
import type { ToolEventData } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ToolUseProps {
  className?: string;
  tool: ToolEventData;
  /** 可选：紧挨胶囊上方的通知文案 */
  notifyText?: string;
  onPreviewTool?: (tool: ToolEventData) => void;
}

function ToolIcon({ tool }: { tool: ToolEventData }) {
  const family = getToolFamily(tool);
  if (family === "file") return <FileText size={16} />;
  if (family === "shell") return <SquareTerminal size={16} />;
  if (family === "browser") return <Globe size={16} />;
  if (family === "search") return <Search size={16} />;
  return <SquareChevronRight size={18} />;
}

/**
 * 工具调用消息：calling / called 共用同一胶囊（按 tool_call_id 合并）。
 * calling 时显示加载态，called 后保持同一文案。
 */
export function ToolUse({
  className,
  tool,
  notifyText,
  onPreviewTool,
}: ToolUseProps) {
  const label = getToolLabel(tool);
  const timeLabel = formatRelativeTime(tool.created_at);
  const isCalling = tool.status === "calling";

  return (
    <>
      {notifyText ? (
        <p className="text-gray-500 text-sm whitespace-pre-line leading-6">
          {notifyText}
        </p>
      ) : null}
      <div
        className={cn("flex items-center group gap-2 max-w-full", className)}
      >
        <div className="flex-1 min-w-0">
          <button
            type="button"
            data-tool-call-id={tool.tool_call_id}
            onClick={() => onPreviewTool?.(tool)}
            className={cn(
              "w-fit rounded-[15px] inline-flex items-center gap-2 px-2.5 py-0.75 border bg-gray-100 max-w-full text-left transition hover:bg-gray-50",
              isCalling && "border-gray-200",
            )}
          >
            <div className="w-4 inline-flex items-center text-gray-700 shrink-0">
              {isCalling ? (
                <Loader2 size={14} className="animate-spin text-gray-500" />
              ) : (
                <ToolIcon tool={tool} />
              )}
            </div>
            <div className="flex-1 h-full min-w-0 flex">
              <div className="inline-flex items-center h-full text-xs text-gray-700 max-w-full min-w-0">
                <span className="shrink-0">{label.action}</span>
                {label.detail ? (
                  <span className="flex-1 min-w-0 rounded-[6px] px-1 ml-1 relative truncate">
                    <code className="font-mono text-[11px]">
                      {label.detail}
                    </code>
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        </div>
        {timeLabel ? (
          <div className="float-right transition text-xs text-gray-500 invisible group-hover:visible shrink-0">
            {timeLabel}
          </div>
        ) : null}
      </div>
    </>
  );
}
