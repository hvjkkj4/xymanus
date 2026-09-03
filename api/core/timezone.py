"""应用统一时区工具（中国上海 UTC+8）"""
from datetime import datetime
from zoneinfo import ZoneInfo

APP_TZ = ZoneInfo("Asia/Shanghai")


def now() -> datetime:
    """返回上海时区的当前时间（naive，与 DB timestamp without time zone 对齐）"""
    return datetime.now(APP_TZ).replace(tzinfo=None)


def from_timestamp(ts: float) -> datetime:
    """将 Unix 时间戳转换为上海时区的 naive datetime"""
    return datetime.fromtimestamp(ts, tz=APP_TZ).replace(tzinfo=None)
