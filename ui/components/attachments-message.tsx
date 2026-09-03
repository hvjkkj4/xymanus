"use client"

import { cn } from "@/lib/utils"
import { Eye, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FileAttachmentCardFromInfo } from "@/components/file-attachment-card"
import type { FileInfo, MessageRole } from "@/lib/api"

interface AttachmentsMessageProps {
  className?: string
  role: MessageRole | string
  files: FileInfo[]
  onViewAllFiles?: () => void
  onPreviewFile?: (file: FileInfo) => void
}

function FileCard({
  file,
  onPreview,
}: {
  file: FileInfo
  onPreview?: (file: FileInfo) => void
}) {
  const name = file.filename || file.filepath || file.id || "未命名文件"

  return (
    <FileAttachmentCardFromInfo
      file={file}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="cursor-pointer"
          aria-label={`预览 ${name}`}
          onClick={() => onPreview?.(file)}
        >
          <Eye />
        </Button>
      }
    />
  )
}

export function AttachmentsMessage({
  className,
  role,
  files,
  onViewAllFiles,
  onPreviewFile,
}: AttachmentsMessageProps) {
  if (!files.length) return null

  const isUser = role === "user"

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-2",
        isUser ? "items-end justify-end" : "items-start justify-start",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full min-w-0 max-w-142 gap-2 flex-wrap",
          isUser && "justify-end",
        )}
      >
        {files.map((file) => (
          <FileCard key={file.id} file={file} onPreview={onPreviewFile} />
        ))}
      </div>
      {!isUser && onViewAllFiles ? (
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          onClick={onViewAllFiles}
        >
          <FileSearch size={16} />
          <span className="text-sm text-gray-700">查看此任务中所有的文件</span>
        </Button>
      ) : null}
    </div>
  )
}
