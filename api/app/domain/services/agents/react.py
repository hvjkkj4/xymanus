import logging
from typing import Optional, AsyncGenerator

from app.domain.models.event import WaitEvent, StepEvent, StepEventStatus, ToolEvent, ToolEventStatus, MessageEvent, \
    ErrorEvent, \
    Event
from app.domain.models.files import File
from app.domain.models.message import Message
from app.domain.models.plan import Step, Plan, ExecutionStatus
from app.domain.services.agents.base import BaseAgent
from app.domain.services.prompts.react import REACT_SYSTEM_PROMPT, EXECUTION_PROMPT, SUMMARIZE_PROMPT
from app.domain.services.prompts.system import SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class ReActAgent(BaseAgent):
    """基于ReAct架构的执行Agent"""
    name: str = "react"
    _system_prompt: str = SYSTEM_PROMPT + REACT_SYSTEM_PROMPT
    # 注意：这里保留"json_object"，但BaseAgent.invoke内部已保证工具调用轮次
    # (首次调用+工具结果轮次)一律强制format=None，避免DeepSeek上JSON Output与
    # Function Calling互斥导致模型永远不返回tool_calls；仅当模型停止调用工具、
    # 输出最终答案时才按_format强制json_object(且自由输出已是纯JSON时零额外调用)。
    # 这样tool事件与结构化最终答案两者兼得。
    _format: Optional[str] = "json_object"

    async def _parse_execution_result(self, text: str) -> Step:
        """解析执行Agent返回的结果JSON，防御json修复库可能产生的非法结构"""
        parsed_obj = await self._json_parser.invoke(text)
        if not isinstance(parsed_obj, dict):
            raise ValueError("LLM输出的执行结果不是有效的JSON对象")
        # 步骤id可能是数字，转回字符串避免校验崩溃
        if isinstance(parsed_obj.get("id"), int):
            parsed_obj["id"] = str(parsed_obj["id"])
        # result字段可能被json修复库解析成数组(如代码片段)，转回字符串
        if isinstance(parsed_obj.get("result"), list):
            parsed_obj["result"] = "".join(str(part) for part in parsed_obj["result"])
        return Step.model_validate(parsed_obj)

    async def execute_step(self, plan: Plan, step: Step, message: Message) -> AsyncGenerator[Event, None]:
        """根据传递的消息+规划+子步骤，执行相应的子步骤"""
        # 1.根据传递的内容生成执行消息
        query = EXECUTION_PROMPT.format(
            message=message.message,
            attachments="\n".join(message.attachments),
            language=plan.language,
            step=step.description,
        )
        # 2.更新步骤的执行状态为运行中并返回Step事件
        step.status = ExecutionStatus.RUNNING
        yield StepEvent(step=step, status=StepEventStatus.STARTED)

        # 3.调用invoke获取agent返回的事件内容
        async for event in self.invoke(query):
            # 4.判断事件类型执行不同操作
            if isinstance(event, ToolEvent):
                # 5.工具事件需要判断工具的名称是否为message_ask_user
                if event.function_name == "message_ask_user":
                    # 6.工具如果在调用中，我们需要返回一条消息告知用户需要让用户处理什么
                    if event.status == ToolEventStatus.CALLING:
                        yield MessageEvent(
                            role="assistant",
                            message=event.function_args.get("text", "")
                        )
                    elif event.status == ToolEventStatus.CALLED:
                        # 7.如果工具事件为已调用，则需要返回等待事件并中断程序
                        yield WaitEvent()
                        return
                    continue
                # 5.5非ask_user的工具事件(如write_file/shell_execute等)必须显式透传。
                # 注意：下面的elif是外层if(isinstance ToolEvent)的elif，ToolEvent命中外层if后
                # 若此处不yield，事件会被整个if/elif链跳过而静默丢弃(工具实际执行了但前端看不到)
                yield event
            elif isinstance(event, MessageEvent):
                # 8.返回消息事件，意味着content有内容，content有内容则代表执行Agent已运行完毕
                step.status = ExecutionStatus.COMPLETED
                try:
                    # 9.message中输出的数据结构为json，需要提取并解析
                    new_step = await self._parse_execution_result(event.message)
                except Exception as e:
                    # 10.执行结果JSON被修复成非法结构时，标记步骤失败而不是中断整个任务
                    logger.error(f"执行Agent解析执行结果失败: {str(e)}")
                    step.status = ExecutionStatus.FAILED
                    step.error = str(e)
                    yield StepEvent(step=step, status=StepEventStatus.FAILED)
                    yield ErrorEvent(error=f"执行结果解析失败: {str(e)}")
                    return
                # 11.更新子步骤的数据
                step.success = new_step.success
                step.result = new_step.result
                step.attachments = new_step.attachments
                # 12.返回步骤完成事件
                yield StepEvent(step=step, status=StepEventStatus.COMPLETED)
                # 13.如果子步骤拿到了结果，还需要返回一段消息给用户(将结果返回给用户)
                if step.result:
                    yield MessageEvent(role="assistant", message=step.result)
                continue
            elif isinstance(event, ErrorEvent):
                # 13.错误事件更新步骤的状态
                step.status = ExecutionStatus.FAILED
                step.error = event.error
                # 14.返回子步骤对应事件
                yield StepEvent(step=step, status=StepEventStatus.FAILED)
            else:
                # 15.其他场景将事件直接返回
                yield event
        # 16.循环迭代完成后代表子步骤已实现，需要更新状态
        step.status = ExecutionStatus.COMPLETED

    async def summarize(self) -> AsyncGenerator[Event, None]:
        """调用Agent汇总历史的消息并生成最终回复+附件"""
        # 1.构建请求query
        query = SUMMARIZE_PROMPT
        # 2.调用invoke方法获取Agent生成的事件
        async for event in self.invoke(query):
            # 3.判断事件类型是否为消息事件，如果是则表示Agent结构化生成汇总内容
            if isinstance(event, MessageEvent):
                # 4.记录日志并解析输出内容
                logger.info(f"执行Agent生成汇总内容: {event.message}")
                try:
                    parsed_obj = await self._json_parser.invoke(event.message)
                    if not isinstance(parsed_obj, dict):
                        raise ValueError("LLM输出的汇总内容不是有效的JSON对象")
                    # 5.将解析数据转换为Message对象
                    message = Message.model_validate(parsed_obj)
                except Exception as e:
                    # 6.汇总JSON被修复成非法结构时，输出错误事件而不是让整个任务崩溃
                    logger.error(f"执行Agent解析汇总内容失败: {str(e)}")
                    yield ErrorEvent(error=f"汇总生成失败: {str(e)}")
                    return
                # 7.提取消息中的附件信息
                attachments = [File(filepath=filepath) for filepath in message.attachments]
                # 8.返回消息事件并将消息+附件进行相应
                yield MessageEvent(
                    role="assistant",
                    message=message.message,
                    attachments=attachments,
                )
            else:
                # 9.其他事件则直接返回
                yield event
