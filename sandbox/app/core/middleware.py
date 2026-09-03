import logging

from starlette.requests import Request

from app.core.config import get_settings
from app.interfaces.service_dependencies import get_supervisor_service

logger = logging.getLogger(__name__)


async def auto_extend_timeout_middleware(request: Request, call_next):
    """使用中间件延长每次API请求超时销毁时间"""
    # 1.获取系统配置与supervisor服务
    settings = get_settings()
    supervisor_service = get_supervisor_service()

    # 2.判断逻辑，仅在符合条件时延长超时销毁时间3分钟
    # supervisor模块的所有接口(查询/停启/shutdown/超时配置)都不延长销毁时间
    is_api = request.url.path.startswith("/api/")
    is_supervisor_api = request.url.path.startswith("/api/supervisor/")

    if (
            settings.server_timeout_minutes is not None
            and supervisor_service.timeout_active
            and is_api
            and not is_supervisor_api
            and supervisor_service.expand_enabled
    ):
        try:
            await supervisor_service.extend_timeout(3)
            logger.debug("调用API请求而自动延长超时销毁时长: %s", (request.url,))
        except Exception as e:
            logger.warning("自动延长超时失败: %s", (str(e),))

    response = await call_next(request)
    return response
