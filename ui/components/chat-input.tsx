"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowUp, Paperclip, XCircle } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { FileAttachmentCardFromInfo } from "@/components/file-attachment-card";
import {
  useChatAttachments,
  type PendingAttachment,
} from "@/hooks/use-chat-attachments";
import type { FileInfo } from "@/lib/api";

/** 约 2 行起步、略超 6 行封顶（text-sm + leading-6 → 1.5rem/行） */
const TEXTAREA_MIN_HEIGHT_PX = 48;
const TEXTAREA_MAX_HEIGHT_PX = 154;

export interface ChatSendPayload {
  message: string;
  attachmentIds: string[];
  attachmentFiles?: FileInfo[];
}

interface ChatInputProps {
  className?: string;
  /** 受控输入内容；不传时组件内部自行管理 */
  value?: string;
  /** 输入内容变化回调 */
  onValueChange?: (value: string) => void;
  /** 点击发送 / Enter；未提供则发送按钮不可用 */
  onSend?: (payload: ChatSendPayload) => void | Promise<void>;
  /** 在发送中时，点击按钮执行的停止动作 */
  onStop?: () => void | Promise<void>;
  /** 外部发送中状态（如创建会话） */
  isSending?: boolean;
}

type AttachmentListItem =
  | { kind: "ready"; file: FileInfo }
  | { kind: "pending"; file: PendingAttachment };

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const next = Math.min(
    Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT_PX),
    TEXTAREA_MAX_HEIGHT_PX,
  );
  el.style.height = `${next}px`;
}

export function ChatInput({
  className,
  value,
  onValueChange,
  onSend,
  onStop,
  isSending = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState("");
  const text = isControlled ? value : internalValue;

  const {
    attachments,
    pending,
    isUploading,
    uploadFiles,
    removeAttachment,
    clearAttachments,
  } = useChatAttachments();

  const listItems: AttachmentListItem[] = [
    ...attachments.map((file) => ({ kind: "ready" as const, file })),
    ...pending.map((file) => ({ kind: "pending" as const, file })),
  ];
  const hasAttachments = listItems.length > 0;

  const trimmed = text.trim();
  const isStopAction = isSending;
  const canSend =
    Boolean(onSend) &&
    trimmed.length > 0 &&
    !isSending &&
    !isUploading &&
    pending.length === 0;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    adjustTextareaHeight(el);
  }, [text]);

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    // FileList 是 live 引用，必须先拷贝再清空 input，否则选中文件会丢失
    const files = input.files ? Array.from(input.files) : [];
    input.value = "";
    if (files.length === 0) return;
    await uploadFiles(files);
  }

  async function handleSend() {
    if (isStopAction) {
      if (!onStop) return;
      await onStop();
      return;
    }

    if (!canSend || !onSend) return;

    const payload: ChatSendPayload = {
      message: trimmed,
      attachmentIds: attachments.map((file) => file.id),
      attachmentFiles: attachments,
    };

    try {
      await onSend(payload);
      // 跳转成功前若仍挂载，清空本地输入与附件
      clearAttachments();
      if (!isControlled) setInternalValue("");
      else onValueChange?.("");
    } catch {
      // 错误由调用方 toast；此处保留输入便于重试
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    void handleSend();
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-white w-full rounded-2xl py-3 border",
        className,
      )}
    >
      {/* 顶部的文件列表 */}
      {hasAttachments ? (
        <div className="w-full px-4 mb-1">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max space-x-3 pb-4">
              {listItems.map((item) => {
                const key =
                  item.kind === "ready" ? item.file.id : item.file.localId;
                const filename =
                  item.kind === "ready"
                    ? item.file.filename || item.file.filepath || item.file.id
                    : item.file.filename;

                return (
                  <FileAttachmentCardFromInfo
                    key={key}
                    file={item.file}
                    pending={item.kind === "pending"}
                    variant="muted"
                    widthClassName="w-70"
                    className="shrink-0"
                    actions={
                      item.kind === "ready" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="cursor-pointer"
                          aria-label={`移除 ${filename}`}
                          disabled={isSending}
                          onClick={() => removeAttachment(item.file.id)}
                        >
                          <XCircle />
                        </Button>
                      ) : null
                    }
                  />
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      ) : null}

      {/* 中间输入框：随内容增高，略超 6 行后固定高度并滚动 */}
      <div className="px-4 mb-3">
        <textarea
          ref={textareaRef}
          rows={2}
          placeholder="给MoocManus一个任务"
          value={text}
          disabled={isSending}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          className="outline-none w-full text-sm leading-6 resize-none min-h-12 max-h-[154px] overflow-y-auto disabled:opacity-60"
        />
      </div>

      {/* 底部上传&发送按钮 */}
      <footer className="flex flex-row justify-between w-full px-3">
        {/* 上传按钮：用 label 关联 file input，避免 programmatic click 被拦截 */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="relative rounded-full w-8 h-8 cursor-pointer overflow-hidden"
            aria-label="上传附件"
            disabled={isSending || isUploading}
            asChild={!isSending && !isUploading}
          >
            {isSending || isUploading ? (
              <span className="inline-flex size-full items-center justify-center">
                <Paperclip />
              </span>
            ) : (
              <label>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <Paperclip />
              </label>
            )}
          </Button>
        </div>
        {/* 发送按钮 */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="default"
            className={cn(
              // 注意：Button 基础样式带 active:not-aria-[haspopup]:translate-y-px，
              // 其优先级高于普通的 active:translate-y-0，必须加 ! 才能取消点击时的下压位移
              "size-8 cursor-pointer rounded-full border-transparent bg-black text-white hover:bg-slate-800 active:translate-y-0!",
            )}
            aria-label={isStopAction ? "停止输出" : "发送"}
            disabled={isStopAction ? !onStop : !canSend}
            onClick={() => void handleSend()}
          >
            <span className="relative flex size-4 items-center justify-center">
              {isStopAction ? (
                <span
                  aria-hidden="true"
                  className="size-3 rounded-[2px] bg-white"
                />
              ) : (
                <ArrowUp aria-hidden="true" className="size-4" />
              )}
            </span>
          </Button>
        </div>
      </footer>
    </div>
  );
}
