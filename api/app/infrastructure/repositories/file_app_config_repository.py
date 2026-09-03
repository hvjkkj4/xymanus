import logging
from pathlib import Path
from typing import Optional

import yaml
from filelock import FileLock

from app.application.errors.exceptions import ServerRequestsError
from app.domain.models.app_config import AppConfig, LLMConfig, AgentConfig, MCPConfig, A2AConfig
from app.domain.repositories.app_config_repository import AppConfigRepository

logger = logging.getLogger(__name__)


class FileAppConfigRepository(AppConfigRepository):
    """基于本地文件的App配置数据仓库"""

    def __init__(self, config_path: str) -> None:
        """构造函数，完成文件配置仓库的相关信息初始化"""
        # 1.获取当前项目的根目录
        root_dir = Path.cwd()
        # 2.拼接配置文件完整路径
        self._config_path = root_dir.joinpath(config_path)
        # 确保父目录存在，parents支持多级目录，exist_ok忽略已存在报错
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        # 定义锁文件路径（同目录下生成 .lock 文件）
        self._lock_file = self._config_path.with_suffix(".lock")

    def _create_default_app_config_if_not_exists(self):
        """如果配置文件不存在，则使用默认配置并写入到本地文件"""
        if not self._config_path.exists():
            default_app_config = AppConfig(
                llm_config=LLMConfig(),
                agent_config=AgentConfig(),
                mcp_config=MCPConfig(),
                a2a_config=A2AConfig(),
            )
            self.save(default_app_config)

    def load(self) -> Optional[AppConfig]:
        """从本地yaml文件中加载应用配置"""
        # 1.创建默认配置确保文件存在
        self._create_default_app_config_if_not_exists()
        try:
            # 2.打开配置文件并加载为AppConfig
            with open(self._config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                return AppConfig.model_validate(data) if data else None
        except Exception as e:
            logger.error(f"读取应用配置失败: {str(e)}")
            raise ServerRequestsError("读取应用配置失败，请稍后尝试")

    def save(self, app_config: AppConfig) -> None:
        """将app_config存储到本地yaml配置"""
        # 1.写入之前先上锁，防止并发读写冲突
        lock = FileLock(self._lock_file, timeout=5)
        try:
            with lock:
                # 2.将app_config转换成可序列化字典
                data_to_dump = app_config.model_dump(mode="json")
                # 3.打开yaml文件并覆盖写入
                with open(self._config_path, "w", encoding="utf-8") as f:
                    yaml.dump(
                        data_to_dump,
                        f,
                        allow_unicode=True,  # 中文不转义
                        sort_keys=False  # 保持字段原有顺序
                    )
        except TimeoutError:
            logger.error("无法获取配置文件锁，写入配置文件失败")
            raise ServerRequestsError("写入配置文件失败，请稍后尝试")
