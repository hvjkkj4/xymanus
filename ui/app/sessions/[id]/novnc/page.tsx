"use client";

import { useParams } from "next/navigation";
import { VNCViewer } from "@/components/vnc-viewer";
import { getWebSocketBaseUrl } from "@/lib/api/client";

export default function Page() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id ?? "";

  return (
    <div className="w-screen h-screen">
      {sessionId ? (
        <VNCViewer
          url={`${getWebSocketBaseUrl()}/sessions/${sessionId}/vnc`}
          viewOnly={false}
        />
      ) : (
        <div className="flex h-screen items-center justify-center bg-black text-white">
          正在加载会话…
        </div>
      )}
    </div>
  );
}
