"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
  /** 更紧凑的样式（通知文案、步骤内说明） */
  compact?: boolean;
}

/**
 * 将接口返回的 Markdown（如 **加粗**、列表、行内代码）渲染为可读富文本，
 * 避免页面上直接露出 `**` / `****` 等原始标记。
 */
export function MarkdownContent({
  content,
  className,
  compact = false,
}: MarkdownContentProps) {
  const text = content?.trim();
  if (!text) return null;

  return (
    <div
      className={cn(
        "markdown-content text-gray-700 break-words",
        compact ? "text-sm text-gray-500" : "text-[15px] leading-7",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-xl font-bold text-gray-800 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-lg font-bold text-gray-800 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-base font-bold text-gray-800 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className={cn("my-2 first:mt-0 last:mb-0", compact && "my-1")}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-gray-800">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc list-outside space-y-1 pl-6">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal list-outside space-y-1 pl-6">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-7 break-words [overflow-wrap:anywhere]">
              {children}
            </li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = Boolean(codeClassName?.includes("language-"));
            if (isBlock) {
              return (
                <code
                  className={cn("font-mono text-[13px]", codeClassName)}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-gray-800"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-3 overflow-x-auto rounded-lg border bg-gray-50 p-3 text-[13px] leading-6">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-gray-300 pl-3 text-gray-600">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-gray-200" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
