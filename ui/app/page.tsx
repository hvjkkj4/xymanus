'use client'

import {useState} from "react";
import {ChatHeader} from "@/components/chat-header";
import {ChatInput} from "@/components/chat-input";
import {SuggestedQuestions} from "@/components/suggested-questions";
import {useStartTask} from "@/hooks/use-start-task";

export default function Page() {
    const [message, setMessage] = useState("");
    const {startTask, isStarting} = useStartTask();

    return (
        <div className="h-full min-h-0 flex flex-col">
            {/* 顶部header */}
            <ChatHeader/>
            {/* 中间内容：问候 + 输入框 + 推荐问题，整体垂直居中 */}
            <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center px-4 py-8">
                <div className="relative w-full max-w-full sm:max-w-3xl sm:min-w-97.5 -translate-y-[min(6vh,48px)]">
                    {/* 对话提示内容 */}
                    <div className="text-[32px] font-bold mb-4">
                        <div className="text-gray-700">您好，慕学员</div>
                        <div className="text-gray-500">我能为您做什么?</div>
                    </div>
                    {/* 对话框 */}
                    <ChatInput
                        className="mb-4"
                        value={message}
                        onValueChange={setMessage}
                        isSending={isStarting}
                        onSend={startTask}
                    />
                    {/* 推荐对话内容 */}
                    <SuggestedQuestions onSelect={setMessage}/>
                </div>
            </div>
        </div>
    );
}
