import asyncio
import io
import logging
import uuid
from typing import List, AsyncGenerator, BinaryIO, Callable

from fastapi import UploadFile
from pydantic import TypeAdapter

from app.domain.external.browser import Browser
from app.domain.external.file_storage import FileStorage
from app.domain.external.json_parser import JSONParser
from app.domain.external.llm import LLM
from app.domain.external.sandbox import Sandbox
from app.domain.external.search import SearchEngine
from app.domain.external.task import TaskRunner, Task
from app.domain.models.app_config import AgentConfig, MCPConfig, A2AConfig
from app.domain.models.event import Event, ErrorEvent, MessageEvent, BaseEvent, ToolEvent, ToolEventStatus, \
    BrowserToolContent, SearchToolContent, ShellToolContent, FileToolContent, MCPToolContent, A2AToolContent, \
    TitleEvent, WaitEvent, DoneEvent
from app.domain.models.files import File
from app.domain.models.message import Message
from app.domain.models.search import SearchResults
from app.domain.models.sesssion import SessionStatus
from app.domain.models.tool_result import ToolResult
from app.domain.repositories.uow import IUnitOfWork
from app.domain.services.flows.planner_react import PlannerReActFlow
from app.domain.services.tools.a2a import A2ATool
from app.domain.services.tools.mcp import MCPTool
from core.config import get_settings

logger = logging.getLogger(__name__)


class AgentTaskRunner(TaskRunner):
    """基于Agent智能体的任务运行器"""

    def __init__(
            self,
            llm: LLM,  # 大语言模型
            agent_config: AgentConfig,  # 智能体配置
            mcp_config: MCPConfig,  # mcp配置
            a2a_config: A2AConfig,  # a2a配置
            session_id: str,  # 会话id
            uow_factory: Callable[[], IUnitOfWork],  # Uow工厂
            file_storage: FileStorage,  # 文件存储桶
            json_parser: JSONParser,  # json解析器
            browser: Browser,  # 浏览器
            search_engine: SearchEngine,  # 搜索引擎
            sandbox: Sandbox,  # 沙箱
    ) -> None:
        """构造函数，完成Agent任务运行器的创建"""
        self._session_id = session_id
        self._uow_factory = uow_factory
        self._uow = uow_factory()
        self._sandbox = sandbox
        self._mcp_config = mcp_config
        self._mcp_tool = MCPTool()
        self._a2a_config = a2a_config
        self._a2a_tool = A2ATool()
        self._file_storage = file_storage
        self._browser = browser
        self._flow = PlannerReActFlow(
            llm=llm,
            agent_config=agent_config,
            session_id=session_id,
            uow_factory=uow_factory,
            json_parser=json_parser,
            browser=browser,
            sandbox=sandbox,
            search_engine=search_engine,
            mcp_tool=self._mcp_tool,
            a2a_tool=self._a2a_tool,
        )

    async def destroy(self) -> None:
        """销毁任务运行器并释放资源"""
        # 1.清除沙箱
        logger.info(f"开始清除销毁AgentTaskRunner资源")
        if self._sandbox:
            logger.info("销毁AgentTaskRunner中的沙箱环境")
            await self._sandbox.destroy()

        # 2.清除mcp和a2a工具（幂等操作，如果invoke()中已清理则不会重复执行）
        await self._cleanup_tools()

    async def on_done(self, task: Task) -> None:
        """任务执行完成的回调函数，负责释放该任务占用的临时资源"""
        # 1.记录日志
        logger.info(f"AgentTaskRunner任务[{task.id}]执行完成，开始清理任务资源")

        # 2.释放MCP工具连接(每个AgentTaskRunner独立持有MCPTool实例，任务结束后清理不影响后续任务)
        try:
            if self._mcp_tool:
                await self._mcp_tool.cleanup()
        except Exception as e:
            logger.exception(f"AgentTaskRunner任务完成后清理MCP资源失败: {str(e)}")

        # 3.释放A2A工具连接
        try:
            if self._a2a_tool and self._a2a_tool.manager:
                await self._a2a_tool.manager.cleanup()
        except Exception as e:
            logger.exception(f"AgentTaskRunner任务完成后清理A2A资源失败: {str(e)}")

        # 4.沙箱由会话持有并在消息间复用，这里不销毁(destroy后DockerSandbox.get的缓存会失效)

    async def _put_and_add_event(self, task: Task, event: Event) -> None:
        """往指定任务的消息队列中添加事件"""
        # 1.往任务的输出消息队列中新增事件
        event_id = await task.output_stream.put(event.model_dump_json())
        event.id = event_id

        # 2.将事件添加到对应的会话中
        async with self._uow:
            await self._uow.session.add_event(self._session_id, event)

    async def _update_session_status(self, status: SessionStatus) -> None:
        """更新指定会话的状态"""
        async with self._uow:
            await self._uow.session.update_status(self._session_id, status)

    @classmethod
    async def _pop_event(cls, task: Task) -> Event:
        """从任务的输入流中获取事件信息"""
        # 1.从任务task中读取数据
        event_id, event_str = await task.input_stream.pop()
        if event_str is None:
            logger.warning(f"AgentTaskRunner接收到空消息")
            return

        # 2.使用pydantic+type类型将字符串转换成事件
        event = TypeAdapter(Event).validate_json(event_str)
        event.id = event_id
        return event

    async def _sync_message_attachments_to_sandbox(self, event: MessageEvent):
        """将消息事件中的附件同步到沙箱中"""
        # 1.定义附件列表
        attachments: List[str] = []

        try:
            # 2.判断消息中是否存在附件
            if event.attachments:
                # 3.循环遍历所有的消息附件
                for attachment in event.attachments:
                    # 4.根据同步文件的id将数据同步到沙箱中
                    file = await self._sync_file_to_sandbox(attachment.id)
                    # 5.文件是否同步成功
                    if file:
                        attachments.append(file)
                        async with self._uow:
                            await self._uow.session.add_file(self._session_id, file)
                # 6.更新消息事件中的attachments
                event.attachments = attachments
        except Exception as e:
            logger.exception(f"AgentTaskRunner同步消息附件到沙箱失败: {str(e)}")

    async def _sync_file_to_sandbox(self, file_id: str) -> File:
        """根据文件id将文件同步到沙箱中"""
        try:
            # 1.调用文件存储下载文件信息
            file_data, file = await self._file_storage.download_file(file_id)
            # 2.组装沙箱文件路径
            filepath = f"/home/ubuntu/upload/{file.filename}"
            # 3.调用沙箱将文件上传至沙箱
            tool_result = await self._sandbox.upload_file(
                file_data=file_data,
                filepath=filepath,
                filename=file.filename
            )
            # 4.判断是否上传成功
            if tool_result.success:
                file.filepath = filepath
                async with self._uow:
                    await self._uow.file.save(file)  # 可以更新也可以不更新
                return file
        except Exception as e:
            logger.exception(f"AgentTaskRunner同步文件[{file_id}]失败: {str(e)}")

    async def _get_browser_screenshot(self) -> str:
        """获取浏览器截图并返回截图文件对应的id"""
        # 1.调用浏览器完成截图
        screenshot = await self._browser.screenshot()

        # 2.将浏览器截图上传到文件存储中
        file = await self._file_storage.upload_file(UploadFile(
            file=io.BytesIO(screenshot),
            filename=f"{str(uuid.uuid4())}.png",
            size=self._get_stream_size(io.BytesIO(screenshot))
        ))

        # 3.获取setting并组装完整URL
        settings = get_settings()
        return f"https://{settings.cos_bucket}.cos.{settings.cos_region}.myqcloud.com/{file.key}"

    async def _handle_tool_event(self, event: ToolEvent) -> None:
        """额外处理工具消息，使其前端交互更友好"""
        try:
            # 1.如果事件状态为已调用则执行以下代码
            if event.status == ToolEventStatus.CALLED:
                # 2.工具为浏览器则补全工具浏览器工具内容
                if event.tool_name == "browser":
                    event.tool_content = BrowserToolContent(
                        screenshot=await self._get_browser_screenshot(),
                    )
                elif event.tool_name == "search":
                    # 3.工具为搜索则添加搜索工具内容
                    search_results: ToolResult[SearchResults] = event.function_result
                    logger.info(f"搜索工具结果: {search_results}")
                    event.tool_content = SearchToolContent(results=search_results.data.results)
                elif event.tool_name == "shell":
                    # 4.工具为shell则生成shell工具内容
                    if "session_id" in event.function_args:
                        shell_result = await self._sandbox.read_shell_output(
                            event.function_args["session_id"],
                            console=True,
                        )
                        records = (shell_result.data or {}).get("console_records", [])
                        # 同一 shell 会话的 console 会累积历史命令，只保留当前命令对应的记录，
                        # 避免每次工具预览都堆叠整个会话历史
                        command = event.function_args.get("command")
                        if event.function_name == "shell_execute" and command:
                            matched = [r for r in records if r.get("command") == command]
                            if matched:
                                records = matched
                        event.tool_content = ShellToolContent(console=records)
                    else:
                        event.tool_content = ShellToolContent(console="(No console)")
                elif event.tool_name == "file":
                    # 5.工具为file则按函数类型生成对应工具内容
                    fn = event.function_name
                    if fn in ("list_files", "find_files"):
                        # 目录/文件列表：将文件路径列表转成可读文本
                        data = (event.function_result.data if event.function_result else None)
                        if isinstance(data, dict) and isinstance(data.get("files"), list):
                            files = data["files"]
                            file_content = "\n".join(str(f) for f in files) if files else "(空目录)"
                        else:
                            file_content = "(无结果)"
                        event.tool_content = FileToolContent(content=file_content)
                    elif fn == "search_in_file":
                        # 搜索结果：filepath:line: match
                        data = (event.function_result.data if event.function_result else None)
                        if data and isinstance(data, dict):
                            matches = data.get("matches") or []
                            line_numbers = data.get("line_numbers") or []
                            filepath = data.get("filepath", "")
                            lines = [
                                f"{filepath}:{line_numbers[i] if i < len(line_numbers) else ''}: {m}"
                                for i, m in enumerate(matches)
                            ]
                            file_content = "\n".join(lines) if lines else "(无匹配)"
                        else:
                            file_content = "(无结果)"
                        event.tool_content = FileToolContent(content=file_content)
                    elif "filepath" in event.function_args:
                        filepath = event.function_args["filepath"]
                        file_read_result = await self._sandbox.read_file(filepath)
                        file_content: str = (file_read_result.data or {}).get("content", "")
                        event.tool_content = FileToolContent(content=file_content)
                        await self._sync_file_to_sandbox(filepath)
                    else:
                        event.tool_content = FileToolContent(content="(No Content)")
                elif event.tool_name in ["mcp", "a2a"]:
                    # 6.工具为mcp/a2a则处理调用结果
                    logger.info(f"处理MCP/A2A工具事件, function_result: {event.function_result}")
                    if event.function_result:
                        # 7.如果结果包含data则提取data
                        if hasattr(event.function_result, "data") and event.function_result.data:
                            logger.info(f"MCP/A2A工具调用结果: {event.function_result.data}")
                            event.tool_content = (
                                MCPToolContent(result=event.function_result.data)
                                if event.tool_name == "mcp"
                                else A2AToolContent(a2a_result=event.function_result.data)
                            )
                        elif hasattr(event.function_result, "success") and event.function_result.success:
                            # 8.mcp/a2a工具调用正常，但是无结果产生
                            logger.info(f"MCP/A2A工具调用成功返回, 但无结果: {event.function_result}")
                            result_data = (
                                event.function_result.model_dump()
                                if hasattr(event.function_result, "model_dump")
                                else str(event.function_result)
                            )
                            event.tool_content = (
                                MCPToolContent(result=result_data)
                                if event.tool_name == "mcp"
                                else A2AToolContent(a2a_result=result_data)
                            )
                        else:
                            # 9.其他情况将结果转换成字符串进行传递
                            logger.info(f"MCP/A2A工具额记过: {event.function_result}")
                            event.tool_content = (
                                MCPToolContent(result=str(event.function_result))
                                if event.tool_name == "mcp"
                                else A2AToolContent(a2a_result=str(event.function_result))
                            )
                    else:
                        logger.warning("MCP/A2A工具调用结果未发现")
                        event.tool_content = (
                            MCPToolContent(result="(MCP工具无可用结果)")
                            if event.tool_name == "mcp"
                            else A2AToolContent(a2a_result="(A2A智能体无可用结果)")
                        )
        except Exception as e:
            logger.exception(f"AgentTaskRunner生成工具内容失败: {str(e)}")

    async def _run_flow(self, message: Message) -> AsyncGenerator[BaseEvent, None]:
        """根据消息对象运行PlannerReActFlow"""
        # 1.判断传递的消息是否为空
        if not message.message:
            logger.warning(f"AgentTaskRunner接收了一条空消息")
            yield ErrorEvent(error="空消息错误")
            return

        # 2.调用流并运行获取事件信息
        async for event in self._flow.invoke(message):
            # 3.判断是否为工具事件，如果是则额外处理
            if isinstance(event, ToolEvent):
                await self._handle_tool_event(event)
            elif isinstance(event, MessageEvent):
                # 4.如果是消息事件则将AI消息事件中的附件同步到存储中
                await self._sync_message_attachments_to_storage(event)
            # 5.将事件直接返回
            yield event

    @classmethod
    def _get_stream_size(cls, f: BinaryIO) -> int:
        """根据传递的文件流，获取计算文件的大小"""
        # 1.记录当前文件指针位置
        current_pos = f.tell()

        # 2.将指针移动到文件末尾，seek，0：偏移量、2：相对文件末尾
        f.seek(0, 2)

        # 3.获取当前位置，也就是文件大小
        size = f.tell()

        # 4.恢复指针到原始位置
        f.seek(current_pos)

        return size

    async def _sync_message_attachments_to_storage(self, event: MessageEvent) -> None:
        """将消息事件的附件同步到文件存储桶中"""
        # 1.定义附件列表存储数据
        attachments: List[File] = []

        try:
            # 2.判断消息中是否存在附件
            if event.attachments:
                # 3.循环遍历所有附件
                for attachment in event.attachments:
                    # 4.根据文件路径将数据同步到文件存储桶
                    file = await self._sync_file_to_storage(attachment.filepath)
                    if file:
                        attachments.append(file)
                # 5.更新事件中的附件列表资源
                event.attachments = attachments
        except Exception as e:
            logger.exception(f"AgentTaskRunner同步消息附件到存储桶失败: {str(e)}")

    async def _sync_file_to_storage(self, filepath: str) -> File:
        """将沙箱中指定的文件路径数据同步到存储桶中"""
        try:
            # 1.根据文件路径从会话中查找文件数据
            async with self._uow:
                file = await self._uow.session.get_file_by_path(self._session_id, filepath)
            # 2.从沙箱中下载文件
            file_data = await self._sandbox.download_file(filepath)

            # 3.判断会话中的文件是否存在
            if file:
                async with self._uow:
                    await self._uow.session.remove_file(self._session_id, file.filepath)

            # 4.提取文件名字、文件信息并更新文件路径
            filename = filepath.split("/")[-1]
            upload_file = UploadFile(
                file=file_data,
                filename=filename,
                size=self._get_stream_size(file_data)
            )

            # 5.上传文件到文件存储桶
            file = await self._file_storage.upload_file(upload_file)
            file.filepath = filepath

            # 6.往会话中新增加一个文件信息
            async with self._uow:
                await self._uow.session.add_file(self._session_id, file)
            return file

        except Exception as e:
            logger.exception(f"AgentTaskRunner同步消息附件到文件存储桶失败: {str(e)}")

    async def _cleanup_tools(self) -> None:
        """清理MCP和A2A工具资源，确保在同一任务上下文中释放

        注意：该方法必须在初始化MCP/A2A的同一个asyncio Task中调用，
        否则anyio的cancel scope会检测到任务上下文切换并抛出RuntimeError。
        """
        try:
            if self._mcp_tool:
                await self._mcp_tool.cleanup()
        except Exception as e:
            logger.warning(f"清理MCP工具资源时出错: {e}")

        try:
            if self._a2a_tool:
                await self._a2a_tool.manager.cleanup()
        except Exception as e:
            logger.warning(f"清理A2A工具资源时出错: {e}")

    async def invoke(self, task: Task) -> None:
        """根据传递的任务处理agent消息队列并运行agent流"""
        try:
            # 1.确保沙箱、mcp、a2a均初始化完成
            logger.info(f"AgentTaskRunner任务处理开始")
            await self._sandbox.ensure_sandbox()
            await self._mcp_tool.initialize(self._mcp_config)
            await self._a2a_tool.initialize(self._a2a_config)

            # 2.循环读取任务中的输入消息队列
            while not await task.input_stream.is_empty():
                # 3.从输入流中获取数据
                event = await self._pop_event(task)
                message = ""

                # 4.判断事件类型是否为消息事件，如果是则处理消息并将附件同步到沙箱中
                if isinstance(event, MessageEvent):
                    message = event.message or ""
                    await self._sync_message_attachments_to_sandbox(event)
                    logger.info(f"AgentTaskRunner接收到新消息: {message[:50]}...")

                # 5.将消息事件转换称消息对象
                message_obj = Message(
                    message=message,
                    attachments=[attachment.filepath for attachment in event.attachments]
                )

                # 6.传递消息对象并运行PlannerReActFlow
                async for event in self._run_flow(message_obj):
                    # 7.将得到的事件添加到消息队列中
                    await self._put_and_add_event(task, event)

                    # 8.如果事件类型为标题事件则更新会话标题
                    if isinstance(event, TitleEvent):
                        async with self._uow:
                            await self._uow.session.update_title(self._session_id, event.title)
                    elif isinstance(event, MessageEvent):
                        # 9.如果事件为消息事件，则更新最新消息并新增未读消息数
                        async with self._uow:
                            await self._uow.session.update_latest_message(
                                self._session_id,
                                event.message,
                                event.created_at,
                            )
                            await self._uow.session.increment_unread_message_count(self._session_id)
                    elif isinstance(event, WaitEvent):
                        # 10.如果事件为等待，则更新会话状态并终止程序
                        await self._update_session_status(SessionStatus.WAITING)
                        return

                    # 11.判断如果输入消息队列为空则跳出循环
                    if not await task.input_stream.is_empty():
                        break

            # 12.更新会话状态为已完成
            await self._update_session_status(SessionStatus.COMPLETED)
        except asyncio.CancelledError:
            # 13.异步任务被取消，推送结束事件并更新状态
            logger.info(f"AgentTaskRunner任务运行取消")
            # 注意：这里的取消常由MCP SDK内部的anyio取消作用域触发(例如jina.ai连接超时)。
            # 该作用域在退出时会对本任务再次投递CancelledError，导致此处直接await的
            # xadd被二次取消、终端DoneEvent永远无法写入Redis，chat端的阻塞XREAD随之
            # 永久挂起。用asyncio.shield将写入放进独立任务，保证DoneEvent一定落库。
            try:
                await asyncio.shield(self._put_and_add_event(task, DoneEvent()))
            except asyncio.CancelledError:
                logger.warning("AgentTaskRunner取消清理期间再次被取消，忽略")
            try:
                await asyncio.shield(
                    self._update_session_status(SessionStatus.COMPLETED)
                )
            except asyncio.CancelledError:
                logger.warning("AgentTaskRunner取消后更新会话状态被中断，忽略")

        except Exception as e:
            # 14.记录日志并往任务队列/消息队列中写入异常事件并更新会话状态
            logger.exception(f"AgentTaskRunner运行出错: {str(e)}")
            # 与CancelledError分支同理：MCP SDK的anyio取消作用域可能残留并在后续await上
            # 再次投递CancelledError，导致直接await的xadd被中断、ErrorEvent丢失、chat端
            # SSE挂起。用asyncio.shield确保错误事件一定落库。
            try:
                await asyncio.shield(
                    self._put_and_add_event(task, ErrorEvent(error=f"AgentTaskRunner出错: {str(e)}"))
                )
            except (asyncio.CancelledError, Exception):
                logger.warning("AgentTaskRunner写入错误事件被中断，忽略")
            try:
                await asyncio.shield(
                    self._update_session_status(SessionStatus.COMPLETED)
                )
            except (asyncio.CancelledError, Exception):
                logger.warning("AgentTaskRunner出错后更新会话状态失败")
        finally:
            # 15.在同一个asyncio Task上下文中清理MCP/A2A工具资源
            # 这是关键：streamablehttp_client内部使用anyio.create_task_group(),
            # 要求在同一个Task中进入和退出cancel scope，
            # 所以必须在invoke()的finally块（即初始化MCP的同一个Task）中清理
            await self._cleanup_tools()
