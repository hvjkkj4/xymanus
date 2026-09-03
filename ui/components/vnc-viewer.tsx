"use client";

import { RefObject, useEffect, useRef, useState } from "react";

// @novnc/novnc 的 core/util/logging.js 在模块加载时就访问 `window`，
// 若在文件顶层 import 会被 Next.js SSR 在 Node 端执行 → ReferenceError: window is not defined
// 导致 /sessions/[id] 与 /sessions/[id]/novnc 整页加载白屏。因此必须客户端动态加载。
type RFBEventDetail = { clean?: boolean; code?: number; reason?: string };

type RFBInstance = {
  viewOnly: boolean;
  scaleViewport: boolean;
  background: string;
  addEventListener: (
    type: string,
    listener: (event: { detail?: RFBEventDetail } | undefined) => void,
  ) => void;
  disconnect: () => void;
};

type RFBConstructor = new (
  target: Element,
  url: string,
  options?: Record<string, unknown>,
) => RFBInstance;

type VNCStatus = "connecting" | "connected" | "failed";

interface VNCViewerProps {
  url: string;
  viewOnly?: boolean;
}

interface RFBDisconnectEvent {
  detail?: { clean?: boolean; code?: number; reason?: string };
}

export function VNCViewer({ url, viewOnly }: VNCViewerProps) {
  const displayRef: RefObject<HTMLDivElement | null> = useRef(null);
  const [status, setStatus] = useState<VNCStatus>("connecting");

  useEffect(() => {
    // 1.检查引用是否存在
    if (!displayRef.current) return;

    let disposed = false;
    let rfb: RFBInstance | null = null;
    setStatus("connecting");

    // 2.动态加载 noVNC 并创建代理连接（仅客户端执行）
    import("@novnc/novnc")
      .then((mod) => {
        if (disposed || !displayRef.current) return;
        const RFBModule = mod as {
          default?: RFBConstructor;
          [key: string]: unknown;
        };
        const RFB = (RFBModule.default ?? RFBModule) as RFBConstructor;
        const rfbInstance = new RFB(displayRef.current, url, {
          credentials: {
            password: "",
            username: "",
            target: "",
          },
        });
        rfb = rfbInstance;

        // 3.配置基础属性
        rfbInstance.viewOnly = viewOnly || false;
        rfbInstance.scaleViewport = true;
        rfbInstance.background = "#000";

        rfbInstance.addEventListener("connect", () => {
          if (disposed) return;
          setStatus("connected");
        });
        // 连接被服务器拒绝或沙箱已回收时，WebSocket 握手失败 → 非 clean 断开
        rfbInstance.addEventListener(
          "disconnect",
          (e: { detail?: RFBEventDetail } | undefined) => {
            if (disposed) return;
            setStatus(e?.detail?.clean ? "connecting" : "failed");
          },
        );
      })
      .catch(() => {
        if (!disposed) setStatus("failed");
      });

    return () => {
      disposed = true;
      rfb?.disconnect();
    };
  }, [url, viewOnly]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={displayRef} className="h-full w-full bg-black" />
      {status === "connecting" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-slate-200">
          正在连接沙箱浏览器…
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
          <p className="text-base font-medium">无法连接到远程浏览器</p>
          <p className="text-sm text-slate-300">
            该会话的沙箱可能已被回收或未运行。请在新会话中重试。
          </p>
        </div>
      ) : null}
    </div>
  );
}
