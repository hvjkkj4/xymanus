"use client"

import { cn } from "@/lib/utils"
import { useState } from "react"
import { Check, ChevronDown, ChevronUp, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PlanEventData } from "@/lib/api"

interface PlanPanelProps {
  className?: string
  plan: PlanEventData | null
}

function currentStepIndex(steps: PlanEventData["steps"]): number {
  const running = steps.findIndex((step) => step.status === "running")
  if (running >= 0) return running
  const pending = steps.findIndex((step) => step.status === "pending")
  if (pending >= 0) return pending
  return Math.max(0, steps.length - 1)
}

export function PlanPanel({ className, plan }: PlanPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const steps = plan?.steps ?? []

  if (steps.length === 0) return null

  const togglePanel = () => setIsExpanded((value) => !value)
  const activeIndex = currentStepIndex(steps)
  const activeStep = steps[activeIndex]
  const progressLabel = `${activeIndex + 1} / ${steps.length}`

  return (
    <div className={cn("bg-white rounded-xl border", className)}>
      {!isExpanded ? (
        <div
          className="flex flex-row items-start justify-between pr-3 relative clickable cursor-pointer rounded-xl z-99"
          onClick={togglePanel}
        >
          <div className="flex-1 min-w-0 relative overflow-hidden">
            <div className="w-full h-9">
              <div className="flex items-center justify-center gap-2.5 w-full px-4 py-2 truncate text-gray-500">
                {activeStep?.status === "running" ? (
                  <Loader2 size={16} className="animate-spin shrink-0" />
                ) : (
                  <Clock size={16} className="shrink-0" />
                )}
                <div className="flex flex-col w-full gap-0.5 min-w-0 truncate">
                  <div className="text-sm truncate">
                    {activeStep?.description || "任务进行中"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-full justify-center gap-2 shrink-0 items-center py-2">
            <span className="text-xs text-gray-500">{progressLabel}</span>
            <ChevronUp className="text-gray-700" size={16} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col py-4 rounded-xl z-99">
          <div className="flex px-4 mb-4 w-full">
            <div className="flex items-start ml-auto">
              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  onClick={togglePanel}
                  variant="ghost"
                  size="icon-xs"
                  className="cursor-pointer"
                  aria-label="收起任务进度"
                >
                  <ChevronDown className="text-gray-500" size={16} />
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4">
            <div className="bg-gray-50 rounded-lg px-2 py-3">
              <div className="flex justify-between w-full px-4">
                <span className="text-gray-700 font-bold">任务进度</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{progressLabel}</span>
                </div>
              </div>

              <div className="max-h-[min(calc(100vh-360px),400px)] overflow-y-auto">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start text-gray-500 text-sm gap-2.5 w-full px-4 py-2"
                  >
                    {step.status === "completed" ? (
                      <Check size={16} className="relative mt-0.5 shrink-0" />
                    ) : step.status === "running" ? (
                      <Loader2
                        size={16}
                        className="relative mt-0.5 shrink-0 animate-spin"
                      />
                    ) : (
                      <Clock size={16} className="relative mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 text-sm whitespace-normal break-words">
                      {step.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
