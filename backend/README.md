# backend

从 iGPSPORT 迹驰下载原始 FIT 文件。脚本是 `igpsport_sync.py`。解析、GPX / TCX、地图和统计都还没做。

接口与 [running_page](https://github.com/yihong0618/running_page) 的 `run_page/igpsport_sync.py` 相同：登录 `prod.zh.igpsport.com`，按页读取活动，再请求 `getDownloadUrl`。文件本体从签名 URL 下载，不带登录 Token。

下载结果在 `data/raw/<rideId>.fit`。`data/` 不进 Git。FIT 里有轨迹、心率和设备信息。已有且文件头合法的 FIT 会跳过。某个活动失败时，其余活动继续，命令以退出码 1 结束。

## 环境

需要 [uv](https://docs.astral.sh/uv/) 和 Python 3.12 及以上。

```bash
cp .env.example .env
# 填写 IGPSPORT_USERNAME 和 IGPSPORT_PASSWORD
# 开发时可以改填登录返回的 IGPSPORT_ACCESS_TOKEN，本次运行就不再登录
uv sync
uv run igpsport-sync
```

```bash
uv run igpsport-sync --limit 1
uv run igpsport-sync --output data/raw
```

## 检查

格式化用 Black，检查用 Ruff，依赖和虚拟环境用 uv。提交前 Lefthook 会对暂存的 Python 文件跑 Ruff 和 Black，推送包含 `backend/` 时会跑 pytest。

```bash
make format
make check
make test
```

许可证与 cyc 相同，为 GPL-3.0-only。
