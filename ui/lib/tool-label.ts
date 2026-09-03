import type { ToolEventData } from "@/lib/api";

export type ToolFamily =
  | "file"
  | "shell"
  | "browser"
  | "search"
  | "mcp"
  | "a2a"
  | "message"
  | "unknown";

export interface ToolLabel {
  /** 人性化动作文案，如「正在查找文件」 */
  action: string;
  /** 辅助细节（路径 / 命令 / 查询词），不含工具函数名 */
  detail?: string;
  /** 工具族，用于图标映射 */
  family: ToolFamily;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return "";
}

function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** 根据工具箱名 / 函数名推断工具族 */
export function getToolFamily(
  tool: Pick<ToolEventData, "name" | "function">,
): ToolFamily {
  const name = (tool.name || "").toLowerCase();
  const fn = (tool.function || "").toLowerCase();

  if (name === "file" || fn.includes("file")) return "file";
  if (name === "shell" || fn.startsWith("shell_")) return "shell";
  if (name === "browser" || fn.startsWith("browser_")) return "browser";
  if (name === "search" || fn.includes("search_web")) return "search";
  if (name === "mcp") return "mcp";
  if (name === "a2a" || fn.includes("remote_agent")) return "a2a";
  if (name === "message" || fn.startsWith("message_")) return "message";
  return "unknown";
}

/**
 * 事件列表用人性化提示。
 * - 不展示工具函数名 / MCP 原始工具名
 * - 不展示执行结果
 * - calling / called 共用同一套文案（UI 只渲染一次）
 */
export function getToolLabel(tool: ToolEventData): ToolLabel {
  const args = tool.args ?? {};
  const fn = tool.function;
  const family = getToolFamily(tool);

  switch (fn) {
    // ---- file ----
    case "write_file":
      return {
        family: "file",
        action: "正在写入文件",
        detail: firstString(args.filepath),
      };
    case "read_file":
      return {
        family: "file",
        action: "正在读取文件",
        detail: firstString(args.filepath),
      };
    case "replace_in_file":
      return {
        family: "file",
        action: "正在修改文件",
        detail: firstString(args.filepath),
      };
    case "search_in_file":
      return {
        family: "file",
        action: "正在搜索文件内容",
        detail: firstString(args.filepath),
      };
    case "find_files":
      return {
        family: "file",
        action: "正在查找文件",
        detail: firstString(args.dir_path, args.glob_pattern, args.glob),
      };
    case "list_files":
      return {
        family: "file",
        action: "正在浏览目录",
        detail: firstString(args.dir_path),
      };

    // ---- shell / bash ----
    case "shell_execute":
      return {
        family: "shell",
        action: "正在执行命令",
        detail: truncate(firstString(args.command)),
      };
    case "shell_read_output":
      return { family: "shell", action: "正在读取命令输出" };
    case "shell_wait_process":
      return { family: "shell", action: "正在等待命令完成" };
    case "shell_write_input":
      return { family: "shell", action: "正在向终端输入内容" };
    case "shell_kill_process":
      return { family: "shell", action: "正在结束运行中的进程" };

    // ---- browser ----
    case "browser_navigate":
      return {
        family: "browser",
        action: "正在打开网页",
        detail: truncate(firstString(args.url), 60),
      };
    case "browser_view":
      return { family: "browser", action: "正在查看当前页面" };
    case "browser_restart":
      return {
        family: "browser",
        action: "正在重启浏览器",
        detail: truncate(firstString(args.url), 60),
      };
    case "browser_click":
      return { family: "browser", action: "正在点击页面元素" };
    case "browser_input":
      return { family: "browser", action: "正在向页面输入内容" };
    case "browser_move_mouse":
      return { family: "browser", action: "正在移动鼠标" };
    case "browser_press_key":
      return { family: "browser", action: "正在模拟按键" };
    case "browser_select_option":
      return { family: "browser", action: "正在选择页面选项" };
    case "browser_scroll_up":
      return { family: "browser", action: "正在向上滚动页面" };
    case "browser_scroll_down":
      return { family: "browser", action: "正在向下滚动页面" };
    case "browser_console_exec":
      return { family: "browser", action: "正在执行页面脚本" };
    case "browser_console_view":
      return { family: "browser", action: "正在查看浏览器控制台" };

    // ---- search ----
    case "search_web":
      return {
        family: "search",
        action: "正在搜索网络信息",
        detail: truncate(firstString(args.query), 48),
      };

    // ---- a2a ----
    case "get_remote_agent_cards":
      return { family: "a2a", action: "正在发现可用的远程智能体" };
    case "call_remote_agent":
      return {
        family: "a2a",
        action: "正在与远程智能体协作",
        detail: truncate(
          firstString(args.agent_name, args.name, args.agent_id),
          40,
        ),
      };

    // ---- message（一般不进工具胶囊，兜底） ----
    case "message_notify_user":
      return { family: "message", action: "正在通知用户" };
    case "message_ask_user":
      return { family: "message", action: "正在询问用户" };

    default:
      break;
  }

  // MCP / 未知工具：按工具族给通用人性化文案，绝不暴露函数名
  switch (family) {
    case "mcp":
      return { family, action: "正在调用 mcp 工具" };
    case "a2a":
      return { family, action: "正在与远程智能体协作" };
    case "file":
      return { family, action: "正在处理文件" };
    case "shell":
      return { family, action: "正在执行终端操作" };
    case "browser":
      return { family, action: "正在操作浏览器" };
    case "search":
      return { family, action: "正在搜索信息" };
    case "message":
      return { family, action: "正在更新进度" };
    default:
      return { family: "unknown", action: "正在执行操作" };
  }
}

/** 是否为「通知/询问用户」类工具（详情页渲染为纯文本，而非工具胶囊） */
export function isNotifyTool(tool: Pick<ToolEventData, "function">): boolean {
  return (
    tool.function === "message_notify_user" ||
    tool.function === "message_ask_user"
  );
}

export function getNotifyText(tool: ToolEventData): string {
  return asString(tool.args?.text);
}
