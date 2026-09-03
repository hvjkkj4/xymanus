"use client";

import { cn } from "@/lib/utils";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Avatar, AvatarGroupCount } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Loader2 } from "lucide-react";
import { formatFileSize } from "@/lib/format-file-size";
import { getFileDisplayName } from "@/lib/file-meta";
import type { ReactNode } from "react";

export function displayFileExtension(extension: string): string {
  const normalized = extension.replace(/^\./, "").trim();
  return normalized || "文件";
}

interface FileAttachmentCardProps {
  className?: string;
  filename: string;
  extension?: string;
  size?: number;
  /** 副标题；不传则用「扩展名 · 大小」 */
  description?: string;
  /** 左侧图标；默认文件图标 */
  media?: ReactNode;
  /** 右侧操作区 */
  actions?: ReactNode;
  variant?: "outline" | "muted" | "default";
  /** 固定卡片宽度，默认与会话附件一致 */
  widthClassName?: string;
}

/**
 * 统一的文件卡片：文件名过长时省略号截断，悬停 Tooltip 显示全名。
 */
export function FileAttachmentCard({
  className,
  filename,
  extension = "",
  size = 0,
  description,
  media,
  actions,
  variant = "outline",
  widthClassName = "w-70",
}: FileAttachmentCardProps) {
  const name = filename.trim() || "未命名文件";
  const subtitle =
    description ??
    `${displayFileExtension(extension)} · ${formatFileSize(size)}`;

  return (
    <Item
      variant={variant}
      className={cn(
        widthClassName,
        "max-w-full flex-nowrap overflow-hidden p-2 gap-2",
        variant === "outline" && "bg-white",
        className,
      )}
    >
      <ItemMedia>
        {media ?? (
          <Avatar className="size-8">
            <AvatarGroupCount>
              <FileText />
            </AvatarGroupCount>
          </Avatar>
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 flex-1 gap-0 overflow-hidden">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <ItemTitle className="w-full cursor-default text-sm text-gray-700">
                {name}
              </ItemTitle>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs break-all">
              {name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <ItemDescription className="w-full truncate text-xs">
          {subtitle}
        </ItemDescription>
      </ItemContent>
      {actions ? <ItemActions>{actions}</ItemActions> : null}
    </Item>
  );
}

export function FileAttachmentCardFromInfo({
  file,
  actions,
  variant,
  widthClassName,
  className,
  pending,
}: {
  file: {
    filename?: string;
    filepath?: string;
    id?: string;
    extension?: string;
    size?: number;
  };
  actions?: ReactNode;
  variant?: FileAttachmentCardProps["variant"];
  widthClassName?: string;
  className?: string;
  pending?: boolean;
}) {
  const name = getFileDisplayName({
    filename: file.filename ?? "",
    filepath: file.filepath ?? "",
  });

  return (
    <FileAttachmentCard
      className={className}
      filename={name}
      extension={file.extension ?? ""}
      size={file.size ?? 0}
      description={pending ? "上传中…" : undefined}
      variant={variant}
      widthClassName={widthClassName}
      media={
        <Avatar className="size-8">
          <AvatarGroupCount>
            {pending ? <Loader2 className="animate-spin" /> : <FileText />}
          </AvatarGroupCount>
        </Avatar>
      }
      actions={actions}
    />
  );
}
