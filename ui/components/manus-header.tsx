"use client"

import { Languages } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ManusHeaderProps {
  className?: string
  /** 右侧附加内容（如相对时间） */
  trailing?: ReactNode
}

/** AI 消息统一标识：logo + manus */
export function ManusHeader({ className, trailing }: ManusHeaderProps) {
  return (
    <div
      className={cn(
        "flex h-7 items-center justify-between group",
        className,
      )}
    >
      <div className="flex items-center justify-center gap-1 text-gray-700">
        <Languages size={18} aria-hidden />
        <span className="text-sm font-medium">manus</span>
      </div>
      {trailing ? (
        <div className="flex items-center gap-0.75">{trailing}</div>
      ) : null}
    </div>
  )
}
