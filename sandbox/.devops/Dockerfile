FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV UV_PROJECT_ENVIRONMENT="/venv"
ENV UV_LINK_MODE=copy

# 1.安装基础工具+OpenSSH Server
# mkdir /var/run/sshd是SSH服务启动必须的目录
RUN apt-get update && apt-get install -y \
    ca-certificates git openssh-server python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /var/run/sshd

# 2.配置SSH的账户密码
RUN echo 'root:root' | chpasswd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

# 3.安装uv
RUN python3 -m pip install --no-cache-dir uv

# 添加uv全局清华源
ENV UV_PYTHON_BUILD_MIRROR_URL=https://mirrors.tuna.tsinghua.edu.cn/github-release/python/cpython/LATEST/
ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# 4.设置下工作环境
WORKDIR /workspace

# 5.预先配置环境，将基础依赖+Python版本同步到沙箱中并创建环境
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

# 6.开放SSH端口(22)和应用端口(8080)
EXPOSE 22 8080

# 7.启动SSH服务(必须使用-D让它在前台运行，否则容器会退出)
CMD ["/usr/sbin/sshd", "-D"]
