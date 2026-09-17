import logging
from typing import List, Callable, Type

from app.application.errors.exceptions import NotFoundError, ServerRequestsError
from app.domain.external.sandbox import Sandbox
from app.domain.models.files import File
from app.domain.models.sesssion import Session, is_placeholder_session_title
from app.domain.repositories.uow import IUnitOfWork
from app.interfaces.schemas.session import FileReadResponse, ShellReadResponse

logger = logging.getLogger(__name__)


class SessionService:
    """会话服务"""

    def __init__(
            self,
            uow_factory: Callable[[], IUnitOfWork],
            sandbox_cls: Type[Sandbox]
    ) -> None:
        """构造函数，完成会话服务初始化"""
        self._uow_factory = uow_factory
        self._uow = uow_factory()
        self._sandbox_cls = sandbox_cls

    async def create_session(self) -> Session:
        """创建会话并立即分配一个独立的沙箱容器"""
        logger.info(f"创建一个空白新任务会话")
        session = Session(title="新对话")

        sandbox = await self._sandbox_cls.create()
        session.sandbox_id = sandbox.id
        async with self._uow:
            await self._uow.session.save(session)
        logger.info(f"成功创建一个新任务会话: {session.id}")
        return session

    async def get_all_sessions(self) -> List[Session]:
        """获取项目所有任务会话列表，并将错误的最新提问标题纠正为首聊标题"""
        async with self._uow:
            sessions = await self._uow.session.get_all()

        healed: List[Session] = []
        for session in sessions:
            display = session.get_display_title()
            stored = (session.title or "").strip()
            if (
                display
                and display != stored
                and not is_placeholder_session_title(display)
            ):
                try:
                    async with self._uow:
                        await self._uow.session.force_update_title(
                            session.id, display
                        )
                    session.title = display
                except Exception:
                    # 列表展示仍用 display，写库失败不阻断
                    session.title = display
            healed.append(session)
        return healed

    async def clear_unread_message_count(self, session_id: str) -> None:
        """清空指定会话未读消息数"""
        logger.info(f"清除会话[{session_id}]未读消息数")
        async with self._uow:
            await self._uow.session.update_unread_message_count(session_id, 0)

    async def delete_session(self, session_id: str) -> None:
        """根据传递的会话id删除任务会话"""
        # 1.先检查会话是否存在
        logger.info(f"正在删除会话，会话id: {session_id}")
        async with self._uow:
            session = await self._uow.session.get_by_id(session_id)
        if not session:
            logger.error(f"会话[{session_id}]不存在，删除失败")
            raise NotFoundError(f"会话[{session_id}]不存在，删除失败")

        # 2.根据传递的会话id删除会话
        async with self._uow:
            await self._uow.session.delete_by_id(session_id)
        logger.info(f"删除会话[{session_id}]成功")

    async def get_session(self, session_id: str) -> Session:
        """获取指定会话详情信息，并将库内标题纠正为事件中的首个正式标题"""
        async with self._uow:
            session = await self._uow.session.get_by_id(session_id)
        if not session:
            return session

        display = session.get_display_title()
        if (
            display
            and display != (session.title or "").strip()
            and display not in ("新对话", "未命名任务")
        ):
            # 纠正历史被跟进提问改写过的 title，保证列表/详情一致
            async with self._uow:
                await self._uow.session.force_update_title(session_id, display)
            session.title = display
        return session

    async def get_session_files(self, session_id: str) -> List[File]:
        """根据传递的会话id获取指定会话的文件列表信息"""
        logger.info(f"获取指定会话[{session_id}]下的文件列表信息")
        async with self._uow:
            session = await self._uow.session.get_by_id(session_id)
        if not session:
            raise RuntimeError(f"当前会话不存在[{session_id}], 请核实后重试")
        return session.files

    async def read_file(self, session_id: str, filepath: str) -> FileReadResponse:
        """根据传递的信息查看会话中指定文件的内容"""
        # 1.检查会话是否存在
        logger.info(f"获取会话[{session_id}]中的文件内容，文件路径：{filepath}")
        async with self._uow:
            session = await self._uow.session.get_by_id(session_id)
        if not session:
            raise RuntimeError(f"当前会话不存在[{session_id}], 请核实后重试")

        # 2.根据沙箱id获取沙箱并判断是否存在
        if not session.sandbox_id:
            raise NotFoundError("当前会话无沙箱环境")
        sandbox = await self._sandbox_cls.get(session.sandbox_id)
        if not sandbox:
            raise NotFoundError("当前会话沙箱不存在或已销毁")

        # 3.调用沙箱读取文件内容
        result = await sandbox.read_file(filepath)
        if result.success:
            return FileReadResponse(**result.data)
        raise ServerRequestsError(result.message)

    async def read_shell_output(self, session_id: str, shell_session_id: str) -> ShellReadResponse:
        """根据传递的任务会话id+Shell会话id获取Shell执行结果"""
        # 1.检查会话是否存在
        logger.info(f"获取会话[{session_id}]中的Shell内容输出，Shell标识符：{shell_session_id}")
        async with self._uow:
            session = await self._uow.session.get_by_id(session_id)
            if not session:
                raise RuntimeError(f"当前会话不存在[{session_id}], 请核实后重试")
            sandbox_id = session.sandbox_id

        # 2.根据沙箱id获取沙箱并判断是否存在
        if not sandbox_id:
            raise NotFoundError("当前会话无沙箱环境")
        sandbox = await self._sandbox_cls.get(sandbox_id)
        if not sandbox:
            raise NotFoundError("当前会话沙箱不存在或已销毁")

        # 3.调用沙箱查看shell内容
        result = await sandbox.read_shell_output(session_id=shell_session_id, console=True)
        if result.success:
            return ShellReadResponse(**result.data)
        raise ServerRequestsError(result.message)

    async def get_vnc_url(self, session_id: str) -> str:
        """获取指定会话的vnc链接"""
        # 1.检查会话是否存在
        logger.info(f"获取会话[{session_id}]的VNC链接")
        async with self._uow:
            session = await self._uow.session.get_by_id(session_id)
        if not session:
            raise NotFoundError(f"当前会话不存在[{session_id}]，请核实后重试")

        # 2.根据沙箱id获取沙箱
        if not session.sandbox_id:
            raise NotFoundError("当前会话无沙箱环境")
        sandbox = await self._sandbox_cls.get(session.sandbox_id)

        # 3.沙箱不存在说明已被超时回收。这里刻意不重建：
        #   重建出来的是全新空沙箱，会话中的文件与环境已随回收一并丢失，
        #   静默重建并覆盖sandbox_id会让用户误以为原有工作仍在。
        #   前端VNCViewer收到非正常断开后会提示"沙箱可能已被回收"。
        if not sandbox:
            logger.warning(f"会话[{session_id}]的沙箱[{session.sandbox_id}]已被回收，拒绝建立VNC连接")
            raise NotFoundError("当前会话沙箱已被回收，无法打开远程浏览器")

        return sandbox.vnc_url
