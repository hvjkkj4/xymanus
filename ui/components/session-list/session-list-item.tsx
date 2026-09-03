"use client"

import { useState } from "react"
import { Loader2, MessageSquareText, MoreHorizontal } from "lucide-react"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { formatSessionTime, getSessionActivityAt } from "@/lib/format-session-time"
import type { ListSessionItem } from "@/lib/api"

interface SessionListItemProps {
  session: ListSessionItem
  isActive: boolean
  onSelect: (sessionId: string) => void
  onDeleteRequest: (session: ListSessionItem) => void
}

export function SessionListItem({
  session,
  isActive,
  onSelect,
  onDeleteRequest,
}: SessionListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const timeLabel = formatSessionTime(getSessionActivityAt(session))
  const title = session.title?.trim() || "未命名任务"
  const preview = session.latest_message?.trim() || "暂无消息"
  const isBusy = session.status === "running"

  return (
    <Item
      role="listitem"
      data-session-status={session.status}
      className={cn(
        "cursor-pointer gap-2 p-2 hover:bg-white",
        (isActive || menuOpen) && "bg-white",
      )}
      onClick={() => onSelect(session.session_id)}
    >
      <div className="flex shrink-0 items-center self-center">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white"
          aria-label={isBusy ? "任务进行中" : undefined}
        >
          {isBusy ? (
            <span className="session-status-spin inline-flex">
              <Loader2 className="size-4" />
            </span>
          ) : (
            <MessageSquareText className="size-4" />
          )}
        </div>
      </div>

      <ItemContent className="min-w-0 gap-0">
        <ItemTitle className="text-md line-clamp-1 font-medium text-gray-700">
          {title}
        </ItemTitle>
        <ItemDescription className="line-clamp-1 text-xs text-gray-500">
          {preview}
        </ItemDescription>
      </ItemContent>

      <ItemActions
        className="flex shrink-0 flex-col items-end gap-0.5 self-start pt-1"
        onClick={(event) => event.stopPropagation()}
      >
        <ItemDescription className="text-xs text-gray-500">
          {timeLabel || "\u00A0"}
        </ItemDescription>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              className="cursor-pointer border-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
              aria-label="更多操作"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={4}
            className="min-w-0 w-fit rounded-md p-0 shadow-sm"
          >
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer justify-center rounded-md px-4 py-1.5 text-sm min-w-16"
              onSelect={() => onDeleteRequest(session)}
            >
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  )
}
