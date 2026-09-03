"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DeleteSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isDeleting?: boolean
}

export function DeleteSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: DeleteSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isDeleting}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-gray-700">
            要删除任务信息吗？
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            删除任务信息后，该任务下的所有聊天记录将被永远删除，无法找回，所上传的文件与生成文件均无法查看&下载。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              className="cursor-pointer focus-visible:border-border focus-visible:ring-0"
              disabled={isDeleting}
            >
              取消
            </Button>
          </DialogClose>
          <Button
            className="cursor-pointer"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? "删除中…" : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
