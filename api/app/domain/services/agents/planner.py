import logging
from typing import Optional, AsyncGenerator

from app.domain.models.event import MessageEvent, ErrorEvent, Event, PlanEvent, PlanEventStatus
from app.domain.models.message import Message
from app.domain.models.plan import Plan, Step
from app.domain.services.agents.base import BaseAgent
from app.domain.services.prompts.planner import PLANNER_SYSTEM_PROMPT, CREATE_PLAN_PROMPT, UPDATE_PLAN_PROMPT
from app.domain.services.prompts.system import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

"""
多Agent系统/flow=PlannerAgent+ReActAgent

顺序：
1. PlannerAgent生成规划；
2. 循环取出规划中的子步骤，让ReActAgent执行，依次迭代；
3. ReActAgent执行完每一个子步骤之后，需要将子步骤结果+Plan传递给PlannerAgent让其更新计划/Plan
4. 循环取出规划中的子步骤，让ReActAgent执行，依次迭代；
5. ...
6. 直到所有子任务/步骤都完成，这时候将子步骤的所有结果汇总进行总结(ReActAgent);

PlannerAgent：
- 功能：将用户的需求拆解成多个子任务+根据已完成的子任务更新规划
- 提示词：创建规划的prompt、更新规划的prompt

ReActAgent：
- 功能：迭代执行完每一个子任务、汇总所有的子任务进行总结
- 提示词：执行任务的prompt、汇总总结prompt
"""


class PlannerAgent(BaseAgent):
    """规划Agent，用于将用户的任务/需求拆解成多个子步骤"""
    name: str = "planner"
    _system_prompt: str = SYSTEM_PROMPT + PLANNER_SYSTEM_PROMPT
    _format: Optional[str] = "json_object"
    _tool_choice: Optional[str] = "none"

    async def _parse_plan(self, text: str) -> Plan:
        """解析LLM输出的计划JSON，防御json修复库可能产生的非法结构"""
        parsed_obj = await self._json_parser.invoke(text)
        if not isinstance(parsed_obj, dict):
            raise ValueError("LLM输出的计划不是有效的JSON对象")
        # 计划id可能是数字，转回字符串避免校验崩溃
        if isinstance(parsed_obj.get("id"), int):
            parsed_obj["id"] = str(parsed_obj["id"])
        # json修复库可能把代码片段解析成数组，过滤非字典步骤，避免Step校验崩溃
        if isinstance(parsed_obj.get("steps"), list):
            cleaned_steps = []
            for step in parsed_obj["steps"]:
                if not isinstance(step, dict):
                    continue
                # 步骤id可能是数字，转回字符串避免校验崩溃
                if isinstance(step.get("id"), int):
                    step["id"] = str(step["id"])
                cleaned_steps.append(step)
            parsed_obj["steps"] = cleaned_steps
        return Plan.model_validate(parsed_obj)

    async def create_plan(self, message: Message) -> AsyncGenerator[Event, None]:
        """根据用户传递的消息创建计划/规划，迭代返回对应的事件"""
        # 1.根据用户传递的消息生成创建plan的提示词
        query = CREATE_PLAN_PROMPT.format(
            message=message.message,
            attachments="\n".join(message.attachments),
        )
        # 2.调用invoke函数返回迭代事件
        async for event in self.invoke(query):
            # 3.规划智能体因为使用json_object，正常情况下会返回MessageEvent
            if isinstance(event, MessageEvent):
                # 4.记录日志并使用json解析器解析得到对应的数据
                logger.info(f"PlannerAgent生成消息: {event.message}")
                try:
                    plan = await self._parse_plan(event.message)
                except Exception as e:
                    # 5.LLM输出畸形时抛出明确错误，由上层转换为错误事件
                    logger.error(f"PlannerAgent解析创建计划失败: {str(e)}")
                    raise ValueError(f"规划创建失败: {str(e)}")
                # 6.返回PlanEvent表示规划创建成功
                yield PlanEvent(plan=plan, status=PlanEventStatus.CREATED)
            else:
                # 返回不是消息事件的事件
                yield event

    async def update_plan(self, plan: Plan, step: Step) -> AsyncGenerator[Event, None]:
        """根据传递的原始规划+子步骤更新事件"""
        # 1.使用plan+step创建更新Plan提示词
        query = UPDATE_PLAN_PROMPT.format(
            plan=plan.model_dump_json(),
            step=step.model_dump_json(),
        )
        # 2.调用invoke获取对应的事件
        async for event in self.invoke(query):
            # 3.判断规划Agent生成的事件是不是消息事件
            if isinstance(event, MessageEvent):
                # 4.记录日志并解析json
                logger.info(f"PlannerAgent生成消息: {event.message}")
                try:
                    updated_plan = await self._parse_plan(event.message)
                except Exception as e:
                    # 5.解析失败不中断任务，保留原计划继续执行并输出错误事件
                    logger.error(f"PlannerAgent解析更新计划失败: {str(e)}")
                    yield ErrorEvent(error=f"规划更新失败: {str(e)}")
                    continue
                # 6.拷贝更新计划中的steps，避免造成数据污染
                new_steps = [Step.model_validate(step) for step in updated_plan.steps]
                # 7.查询旧计划中第一个未完成的计划
                first_pending_index = None
                for idx, step in enumerate(plan.steps):
                    if not step.done:
                        first_pending_index = idx
                        break
                # 8.判断是否有未完成的步骤，如果有则执行更新
                if first_pending_index is not None:
                    # 9.获取历史已完成的子步骤并更新
                    updated_steps = plan.steps[:first_pending_index]
                    updated_steps.extend(new_steps)
                    # 10.更新plan规划
                    plan.steps = updated_steps
                    # 11.返回规划更新事件
                    yield PlanEvent(plan=plan, status=PlanEventStatus.UPDATED)
            else:
                # 其他事件则直接返回
                yield event
