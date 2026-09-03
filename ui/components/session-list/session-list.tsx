"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteSession, isApiError, type ListSessionItem } from "@/lib/api";
import { useSessions } from "@/hooks/use-sessions";
import { DeleteSessionDialog } from "./delete-session-dialog";
import { SessionListItem } from "./session-list-item";

export function SessionList() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const activeSessionId =
    typeof params?.id === "string" ? params.id : undefined;

  const { sessions, isLoading, error, removeSession } = useSessions();
  const [pendingDelete, setPendingDelete] = useState<ListSessionItem | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSelect = (sessionId: string) => {
    router.push(`/sessions/${sessionId}`);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;

    const sessionId = pendingDelete.session_id;
    setIsDeleting(true);

    try {
      await deleteSession(sessionId);
      removeSession(sessionId);
      setPendingDelete(null);
      toast.success("任务已删除");

      if (activeSessionId === sessionId) {
        router.push("/");
      }
    } catch (err) {
      const message = isApiError(err)
        ? err.message
        : "删除任务失败，请稍后重试";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="session-list-scroll min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {isLoading && sessions.length === 0 ? (
          <SessionListSkeleton />
        ) : error && sessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-gray-500">{error}</p>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-gray-500">
            暂无任务，点击上方新建
          </p>
        ) : (
          <ItemGroup className="gap-1">
            {sessions.map((session) => (
              <SessionListItem
                key={session.session_id}
                session={session}
                isActive={session.session_id === activeSessionId}
                onSelect={handleSelect}
                onDeleteRequest={setPendingDelete}
              />
            ))}
          </ItemGroup>
        )}
      </div>

      <DeleteSessionDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setPendingDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </>
  );
}

function SessionListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-start gap-2 p-2">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
