"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolUse } from "@/components/tool-use";
import type { ToolEventData } from "@/lib/api";

/** 连续工具超过该数量时折叠为摘要（>5 才折叠） */
export const TOOL_GROUP_COLLAPSE_AT = 5;

interface ToolGroupProps {
  className?: string;
  tools: ToolEventData[];
  /** 步骤进行中时默认展开，便于跟进展 */
  preferExpanded?: boolean;
  onPreviewTool?: (tool: ToolEventData) => void;
}

export function ToolGroup({
  className,
  tools,
  preferExpanded = false,
  onPreviewTool,
}: ToolGroupProps) {
  const shouldCollapse = tools.length > TOOL_GROUP_COLLAPSE_AT;
  const [expanded, setExpanded] = useState(preferExpanded || !shouldCollapse);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (!shouldCollapse) {
      setExpanded(true);
      return;
    }
    if (userToggled) return;
    setExpanded(preferExpanded);
  }, [preferExpanded, shouldCollapse, userToggled]);

  if (!shouldCollapse) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {tools.map((tool) => (
          <ToolUse
            key={tool.tool_call_id}
            tool={tool}
            onPreviewTool={onPreviewTool}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        className="flex items-center group gap-2 cursor-pointer text-left max-w-full"
        aria-expanded={expanded}
        aria-label={expanded ? "折叠工具调用" : "展开工具调用"}
        onClick={() => {
          setUserToggled(true);
          setExpanded((value) => !value);
        }}
      >
        <div className="rounded-[15px] inline-flex items-center gap-2 px-2.5 py-0.75 border bg-gray-100 max-w-full">
          <div className="w-4 inline-flex items-center text-gray-700">
            <Layers size={16} />
          </div>
          <span className="text-xs text-gray-700 shrink-0">
            已执行 {tools.length} 个操作
          </span>
          <ChevronDown
            size={14}
            className={cn(
              "text-gray-500 transition-transform shrink-0",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
        </div>
      </button>

      {expanded
        ? tools.map((tool) => (
            <ToolUse
              key={tool.tool_call_id}
              tool={tool}
              onPreviewTool={onPreviewTool}
            />
          ))
        : null}
    </div>
  );
}
