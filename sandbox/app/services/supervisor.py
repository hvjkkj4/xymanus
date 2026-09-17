"""
1.Supervisor启动后，通过一个Unix套接字文件来实现通信(rpc协议)
2.连接这个通信文件，/tmp/supervisor.sock (xml‑rpc连接)
3.使用某种方式来完成转换，让xml‑rpc实现连接supervisor.sock
4.连接之后我们就可以调用rpc对应的方法，getAllProcessInfo()

超时自毁的实现说明：
  在 uvicorn --reload 的 spawn 架构（reloader 父进程 + spawn 子进程实际服务）下，
  用 asyncio.get_event_loop() + loop.create_task() 挂的单次睡眠任务可能被安排到
  一个从未运行的事件循环上，导致定时器到点不触发、沙箱永远不会被销毁。
  因此这里改为一个常驻后台守护线程，周期性(每 CHECK_INTERVAL_SECONDS 秒)检查
  self.shutdown_time 是否到期。该方案：
    - 纯线程实现，不依赖任何事件循环；
    - 每次 API 调用(extend_timeout)只需更新截止时间，无需取消/重建任务；
    - 若一次停机 RPC 失败，下一轮会继续重试，具备自愈能力。
"""

import asyncio
import http.client
import logging
import socket
import threading
import xmlrpc.client
from datetime import datetime, timedelta
from typing import List, Any, Optional

from app.core.config import get_settings
from app.interfaces.errors.exceptions import BadRequestException, AppException
from app.models.supervisor import ProcessInfo, SupervisorActionResult, SupervisorTimeout

logger = logging.getLogger(__name__)

# 超时监控线程的唤醒/检查间隔(秒)。销毁是分钟级的，10秒粒度足够精确且便于验证
CHECK_INTERVAL_SECONDS = 10


class UnixStreamHTTPConnection(http.client.HTTPConnection):
    """基于Unix流的HTTP连接处理器"""

    def __init__(self, host: str, socket_path: str, timeout=None) -> None:
        """构造函数，完成连接处理器初始化"""
        http.client.HTTPConnection.__init__(self, host, timeout)
        self.socket_path = socket_path

    def connect(self) -> None:
        """重写连接方法，欺骗xml‑rpc库让其觉得自己正在进行网络连接"""
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)


class UnixStreamTransport(xmlrpc.client.Transport):
    """基于Unix流传输层的适配器/转换器"""

    def __init__(self, socket_path: str) -> None:
        """构造函数，完成传输适配器的初始化"""
        xmlrpc.client.Transport.__init__(self)
        self.socket_path = socket_path

    def make_connection(self, host) -> http.client.HTTPConnection:
        return UnixStreamHTTPConnection(host, self.socket_path)


class SupervisorService:
    """Supervisor服务"""

    def __init__(self) -> None:
        """构造函数，完成supervisor服务链接"""
        # 1.连接supervisor配置
        self.rpc_url = "/tmp/supervisor.sock"
        self._connect_rpc()

        # 2.supervisor超时配置
        settings = get_settings()
        self.timeout_active = settings.server_timeout_minutes is not None
        self.shutdown_time: Optional[datetime] = None
        self._expand_enabled = True  # 是否自动保活(每调用一次接口就增加时间)

        # 3.超时监控线程相关状态
        self._monitor_thread: Optional[threading.Thread] = None
        self._monitor_stop = threading.Event()
        self._state_lock = threading.Lock()

        # 4.启动后台监控线程(在app启动阶段构建本服务时即启动，无需等待第一个请求)
        self._ensure_monitor_running()

        # 5.检测是否配置了自动销毁
        if settings.server_timeout_minutes is not None:
            self._arm(datetime.now() + timedelta(minutes=settings.server_timeout_minutes))
            logger.info("已激活沙箱空闲超时自毁: %s 分钟内无API调用将被销毁",
                        settings.server_timeout_minutes)

    @property
    def expand_enabled(self) -> bool:
        """只读属性，返回是否自动保活"""
        return self._expand_enabled

    def enable_expand(self) -> None:
        """开启自动保活"""
        self._expand_enabled = True

    def disable_expand(self) -> None:
        """关闭自动保活"""
        self._expand_enabled = False

    # ------------------------------------------------------------------ #
    # 超时自毁的“截止时间”管理。真正触发销毁的是后台监控线程，这里只负责   #
    # 在加锁保护下更新 self.shutdown_time / self.timeout_active，避免线程   #
    # 与请求处理之间产生数据竞争。                                          #
    # ------------------------------------------------------------------ #
    def _arm(self, deadline: datetime) -> None:
        """设置销毁截止时间并激活超时销毁"""
        with self._state_lock:
            self.shutdown_time = deadline
            self.timeout_active = True

    def _disarm(self) -> None:
        """取消超时销毁(保留监控线程等待再次激活)"""
        with self._state_lock:
            self.timeout_active = False
            self.shutdown_time = None

    def _ensure_monitor_running(self) -> None:
        """确保后台超时监控线程已启动(幂等)"""
        if self._monitor_thread is not None and self._monitor_thread.is_alive():
            return

        def _monitor() -> None:
            """周期检查截止时间，到期则调用supervisord停机指令销毁沙箱"""
            logger.info("沙箱超时自毁监控线程已启动(检查间隔%ss)", CHECK_INTERVAL_SECONDS)
            while not self._monitor_stop.wait(CHECK_INTERVAL_SECONDS):
                try:
                    with self._state_lock:
                        if not self.timeout_active or self.shutdown_time is None:
                            continue  # 未激活/已取消，继续等待
                        deadline = self.shutdown_time
                        expired = (deadline - datetime.now()).total_seconds() <= 0
                    if not expired:
                        continue
                    logger.warning("沙箱已达到销毁截止时间(%s)，开始销毁supervisord", deadline)
                    try:
                        # 线程内直接同步调用supervisord的xml‑rpc停机指令，不依赖事件循环。
                        # supervisord收到后会停止所有子进程并退出，容器随之停止并被自动移除。
                        self.server.supervisor.shutdown()
                        logger.info("supervisord停机指令已发送，沙箱即将销毁")
                        self._monitor_stop.set()
                        return
                    except Exception as e:
                        # supervisord退出时可能已中断当前RPC连接；若确实失败则下一轮重试
                        logger.error("发送supervisord停机指令失败，将在下一轮重试: %s", e)
                except Exception as e:
                    logger.warning("超时监控线程检查异常: %s", e)

        t = threading.Thread(target=_monitor, name="sandbox-timeout-monitor", daemon=True)
        t.start()
        self._monitor_thread = t

    def _remaining_seconds(self) -> float:
        """计算距当前销毁截止时间的剩余秒数(未激活时为0)"""
        with self._state_lock:
            deadline = self.shutdown_time
        if deadline is None:
            return 0.0
        return max(0.0, (deadline - datetime.now()).total_seconds())

    def _current_timeout_minutes(self) -> Optional[int]:
        """返回当前剩余的整分钟数(用于接口返回)"""
        remaining = self._remaining_seconds()
        return int(remaining // 60) if self.timeout_active else None

    def _connect_rpc(self) -> None:
        """使用python的xml‑rpc客户端连接一个本地sock文件文件实现连接rpc服务"""
        try:
            self.server = xmlrpc.client.ServerProxy(
                uri="http://localhost",
                transport=UnixStreamTransport(self.rpc_url),
            )
        except Exception as e:
            logger.error(f"连接Supervisor服务失败: {str(e)}")
            raise BadRequestException(f"连接Supervisor服务失败: {str(e)}")

    @classmethod
    async def _call_rpc(cls, method, *args) -> Any:
        """根据传递的方法+参数调用rpc方法"""
        try:
            return await asyncio.to_thread(method, *args)
        except Exception as e:
            logger.error(f"RPC方法调用失败: {str(e)}")
            raise BadRequestException(f"RPC方法调用失败: {str(e)}")

    async def get_all_processes(self) -> List[ProcessInfo]:
        """获取当前supervisor管理的所有进程信息"""
        try:
            processes = await self._call_rpc(self.server.supervisor.getAllProcessInfo)
            return [ProcessInfo(**process) for process in processes]
        except Exception as e:
            logger.error(f"获取进程信息失败: {str(e)}")
            raise AppException(f"获取进程信息失败: {str(e)}")

    async def stop_all_processes(self) -> SupervisorActionResult:
        """停止supervisor管理的所有进程"""
        try:
            result = await self._call_rpc(self.server.supervisor.stopAllProcesses)
            return SupervisorActionResult(status="stopped", result=result)
        except Exception as e:
            logger.error(f"停止supervisor所有进程服务失败: {str(e)}")
            raise AppException(f"停止supervisor所有进程服务失败: {str(e)}")

    async def shutdown(self) -> SupervisorActionResult:
        """关闭supervisord服务"""
        try:
            shutdown_result = await self._call_rpc(self.server.supervisor.shutdown)
            return SupervisorActionResult(status="shutdown", shutdown_result=shutdown_result)
        except Exception as e:
            logger.error(f"关闭supervisord服务失败: {str(e)}")
            raise AppException(f"关闭supervisord服务失败: {str(e)}")

    async def restart(self) -> SupervisorActionResult:
        """重启Supervisor管理的进程"""
        try:
            stop_result = await self._call_rpc(self.server.supervisor.stopAllProcesses)
            start_result = await self._call_rpc(self.server.supervisor.startAllProcesses)
            return SupervisorActionResult(
                status="restarted",
                stop_result=stop_result,
                start_result=start_result,
            )
        except Exception as e:
            logger.error(f"重启Supervisor进程服务失败: {str(e)}")
            raise AppException(f"重启Supervisor进程服务失败: {str(e)}")

    async def activate_timeout(self, minutes: Optional[int] = None) -> SupervisorTimeout:
        """传递指定分钟，并激活定时销毁任务同时关闭自动保活"""
        # 1.获取超时分钟数
        setting = get_settings()
        timeout_minutes = minutes or setting.server_timeout_minutes
        if timeout_minutes is None:
            raise BadRequestException("超时时间未配置，并且未读取到系统默认超时时间")

        # 2.更新超时截止时间(后台监控线程负责到期触发)
        self._arm(datetime.now() + timedelta(minutes=timeout_minutes))
        self._ensure_monitor_running()

        return SupervisorTimeout(
            status="timeout_activated",
            active=True,
            shutdown_time=self.shutdown_time.isoformat(),
            timeout_minutes=timeout_minutes,
            remaining_seconds=self._remaining_seconds()
        )

    async def extend_timeout(self, minutes: Optional[int] = 3) -> SupervisorTimeout:
        """传递指定的时长，延长超时销毁的时间，默认延长3分钟"""
        # 1.获取超时分钟数
        if minutes is None:
            raise BadRequestException("超时时间未配置，请核实后重试")
        with self._state_lock:
            deadline = self.shutdown_time

        # 2.在原截止时间上直接叠加，避免"取整到整分钟"造成累积漂移
        #   (原实现按 round(剩余秒/60)+minutes 重算，每次调用会白送最多30秒)
        if deadline is None:
            # 当前没有可延长的截止时间(如曾被取消)，则按系统默认超时配置激活
            new_deadline = datetime.now() + timedelta(
                minutes=get_settings().server_timeout_minutes or minutes
            )
        else:
            # 已过期的截止时间以当前时间为基准，避免叠加后仍落在过去而立即被销毁
            new_deadline = max(deadline, datetime.now()) + timedelta(minutes=minutes)

        # 3.更新超时截止时间(后台监控线程负责到期触发)
        self._arm(new_deadline)
        self._ensure_monitor_running()

        return SupervisorTimeout(
            status="timeout_extended",
            active=True,
            shutdown_time=new_deadline.isoformat(),
            timeout_minutes=int(self._remaining_seconds() // 60),
            remaining_seconds=self._remaining_seconds()
        )

    async def cancel_timeout(self) -> SupervisorTimeout:
        """取消超时销毁设置"""
        # 1.判断是否设置了超时销毁
        if not self.timeout_active:
            return SupervisorTimeout(status="no_timeout_active", active=False)

        # 2.取消销毁配置(监控线程保持运行，等待再次激活)
        self._disarm()
        self._expand_enabled = True

        return SupervisorTimeout(status="timeout_cancelled", active=False)

    async def get_timeout_status(self) -> SupervisorTimeout:
        """获取当前supervisor的超时状态"""
        # 1.判断是否开启超时销毁功能
        if not self.timeout_active:
            return SupervisorTimeout(active=False)

        # 2.统计剩余秒数
        return SupervisorTimeout(
            active=self.timeout_active,
            shutdown_time=self.shutdown_time.isoformat() if self.shutdown_time else None,
            remaining_seconds=self._remaining_seconds()
        )
