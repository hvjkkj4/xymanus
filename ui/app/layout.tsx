import type {Metadata} from "next";
import "./globals.css";
import {Geist} from "next/font/google";
import {cn} from "@/lib/utils";
import {SidebarProvider} from "@/components/ui/sidebar";
import {LeftPanel} from "@/components/left-panel";
import {Toaster} from "@/components/ui/sonner";

const geist = Geist({subsets: ['latin'], variable: '--font-sans'});

export const metadata: Metadata = {
    title: "MoocManus",
    description:
        "MoocManus 是一个行动引擎，它超越了答案的范畴，可以执行任务、自动化工作流程，并扩展你的能力。",
    icons: {
        icon: '/icon.png',
    },
};

export default function RootLayout({children}: LayoutProps<"/">) {

    return (
        <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
        <body>
        <SidebarProvider
            style={{
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                "--sidebar-width": '300px',
                "--sidebar-width-icon": "300px",
            }}
        >
            {/* 左侧的面板 */}
            <LeftPanel/>
            {/* 右侧的内容 */}
            <div className="flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f8f8f7]">
                {children}
            </div>
        </SidebarProvider>
        <Toaster position="top-center" richColors />
        </body>
        </html>
    );
}
