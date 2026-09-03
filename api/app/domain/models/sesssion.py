import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field

from core.timezone import now
from .event import Event, PlanEvent, TitleEvent, MessageEvent
from .files import File
from .memory import Memory
from .plan import Plan


class SessionStatus(str, Enum):
    """会话状态类型枚举"""
    PENDING = "pending"  # 等待任务
    RUNNING = "running"  # 运行中
    WAITING = "waiting"  # 等待人类响应
    COMPLETED = "completed"  # 已完成


# 创建会话时的占位标题：允许被首个正式 TitleEvent 覆盖，之后不再改写
SESSION_PLACEHOLDER_TITLES = frozenset({"", "新对话", "未命名任务"})


def is_placeholder_session_title(title: Optional[str]) -> bool:
    """判断是否为尚未锁定的占位会话标题"""
    return (title or "").strip() in SESSION_PLACEHOLDER_TITLES


def _event_type(event: Any) -> str:
    if isinstance(event, dict):
        return str(event.get("type") or "")
    return str(getattr(event, "type", "") or "")


def _is_user_message_event(event: Any) -> bool:
    if _event_type(event) != "message":
        return False
    if isinstance(event, MessageEvent):
        return event.role == "user"
    if isinstance(event, dict):
        return event.get("role") == "user"
    return getattr(event, "role", None) == "user"


def _user_message_text(event: Any) -> str:
    if isinstance(event, MessageEvent):
        return (event.message or "").strip()
    if isinstance(event, dict):
        return str(event.get("message") or "").strip()
    return str(getattr(event, "message", "") or "").strip()


def _title_from_title_event(event: Any) -> str:
    if isinstance(event, TitleEvent):
        return (event.title or "").strip()
    if isinstance(event, dict):
        return str(event.get("title") or "").strip()
    if _event_type(event) == "title":
        return str(getattr(event, "title", "") or "").strip()
    return ""


def _title_from_plan_event(event: Any) -> str:
    if isinstance(event, PlanEvent):
        return (event.plan.title or "").strip()
    if isinstance(event, dict) and event.get("type") == "plan":
        plan = event.get("plan") or {}
        return str(plan.get("title") or "").strip()
    if _event_type(event) == "plan":
        plan = getattr(event, "plan", None)
        return str(getattr(plan, "title", "") or "").strip()
    return ""


def _truncate_title(text: str, max_len: int = 40) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= max_len:
        return normalized
    return f"{normalized[: max_len - 1]}…"


class Session(BaseModel):
    """会话领域模型"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))  # 会话id
    sandbox_id: Optional[str] = None  # 沙箱id
    task_id: Optional[str] = None  # 任务id
    title: str = ""  # 标题
    unread_message_count: int = 0  # 未读消息数
    latest_message: str = ""  # 最新消息
    latest_message_at: Optional[datetime] = None  # 最新消息时间
    events: List[Event] = Field(default_factory=list)  # 事件列表
    files: List[File] = Field(default_factory=list)  # 文件列表
    memories: Dict[str, Memory] = Field(default_factory=dict)  # 记忆
    status: SessionStatus = SessionStatus.PENDING  # 状态
    updated_at: datetime = Field(default_factory=now)  # 更新时间（上海时区）
    created_at: datetime = Field(default_factory=now)  # 创建时间（上海时区）

    def get_first_title_from_events(self) -> Optional[str]:
        """
        提取「发起会话时第一个聊天」的标题：
        仅在首条用户消息与第二条用户消息之间查找 TitleEvent / Plan.title，
        绝不使用后续跟进提问产生的标题。
        """
        first_user_idx: Optional[int] = None
        second_user_idx: Optional[int] = None

        for index, event in enumerate(self.events):
            if not _is_user_message_event(event):
                continue
            if first_user_idx is None:
                first_user_idx = index
            else:
                second_user_idx = index
                break

        # 尚无用户消息：退回全局首个 title（兼容异常数据）
        search_start = first_user_idx if first_user_idx is not None else 0
        search_end = (
            second_user_idx if second_user_idx is not None else len(self.events)
        )
        turn_events = self.events[search_start:search_end]

        for event in turn_events:
            title = _title_from_title_event(event)
            if title and not is_placeholder_session_title(title):
                return title

        for event in turn_events:
            title = _title_from_plan_event(event)
            if title and not is_placeholder_session_title(title):
                return title

        # 首聊未生成 title 时，用首条用户消息截断作为会话名
        if first_user_idx is not None:
            user_text = _user_message_text(self.events[first_user_idx])
            if user_text:
                return _truncate_title(user_text)

        return None

    def get_display_title(self) -> str:
        """
        侧边栏/详情/列表接口展示用标题：
        固定为发起会话时第一个聊天的标题。
        """
        first = self.get_first_title_from_events()
        if first:
            return first
        current = (self.title or "").strip()
        return current if current else "新对话"

    def get_latest_plan(self) -> Optional[Plan]:
        """获取会话中的最新计划"""
        # 1.倒序遍历会话中所有事件消息
        for event in reversed(self.events):
            # 2.判断事件的类型是否为PlanEvent，如果是则提取计划后返回
            if isinstance(event, PlanEvent):
                return event.plan
        return None
