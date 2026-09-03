"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Download, FileSearchCorner } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileAttachmentCardFromInfo } from "@/components/file-attachment-card";
import { downloadFileToDisk, type FileInfo } from "@/lib/api";
import { toast } from "sonner";

interface SessionHeaderProps {
  title: string;
  files: FileInfo[];
  filesDialogOpen: boolean;
  onFilesDialogOpenChange: (open: boolean) => void;
}

export function SessionHeader({
  title,
  files,
  filesDialogOpen,
  onFilesDialogOpenChange,
}: SessionHeaderProps) {
  const { open, isMobile } = useSidebar();

  async function handleDownload(file: FileInfo) {
    if (!file.id) {
      toast.error("文件信息不完整，无法下载");
      return;
    }
    try {
      await downloadFileToDisk(file.id, {
        filename: file.filename || undefined,
      });
    } catch {
      toast.error("下载失败，请稍后重试");
    }
  }

  const showSidebarTrigger = !open || isMobile;

  return (
    <header className="bg-[#f8f8f7] sticky top-0 z-10 shrink-0 pt-3 pb-2">
      <div className="mx-auto flex w-full max-w-[54rem] items-center justify-between gap-2 px-3">
        {showSidebarTrigger ? (
          <div className="mr-2 shrink-0">
            <SidebarTrigger className="cursor-pointer" />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-hidden text-lg whitespace-nowrap text-ellipsis text-gray-700">
            {title || "未命名任务"}
          </div>
          <Dialog open={filesDialogOpen} onOpenChange={onFilesDialogOpenChange}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer shrink-0"
                aria-label="查看任务文件"
              >
                <FileSearchCorner />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-125 sm:max-w-125">
              <DialogHeader>
                <DialogTitle>此任务中的所有文件</DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-125">
                <div className="flex flex-col gap-1">
                  {files.length === 0 ? (
                    <div className="px-2 py-8 text-center text-sm text-gray-500">
                      暂无文件
                    </div>
                  ) : (
                    files.map((file) => {
                      const name =
                        file.filename ||
                        file.filepath ||
                        file.id ||
                        "未命名文件";
                      return (
                        <FileAttachmentCardFromInfo
                          key={file.id}
                          file={file}
                          variant="default"
                          widthClassName="w-full"
                          className="cursor-pointer hover:bg-gray-100"
                          actions={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="cursor-pointer"
                              aria-label={`下载 ${name}`}
                              onClick={() => void handleDownload(file)}
                            >
                              <Download />
                            </Button>
                          }
                        />
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
