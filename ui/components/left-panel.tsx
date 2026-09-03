'use client'

import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { NewTaskButton } from "@/components/session-list/new-task-button"
import { SessionList } from "@/components/session-list/session-list"

export function LeftPanel() {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarTrigger className="cursor-pointer" />
      </SidebarHeader>
      <SidebarContent className="overflow-hidden p-2">
        <NewTaskButton />
        <SessionList />
      </SidebarContent>
    </Sidebar>
  )
}
