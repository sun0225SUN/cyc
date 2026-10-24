# backend

从 iGPSPORT 迹驰下载原始 FIT 文件，再解析进 SQLite。下载脚本是 `src/igpsport_sync.py`，解析脚本是 `src/fit_parse.py`，导出脚本是 `src/export_activities.py`。GPX / TCX、地图和统计都还没做。

接口与 [running_page](https://github.com/yihong0618/running_page) 的 `run_page/igpsport_sync.py` 相同：登录 `prod.zh.igpsport.com`，按页读取活动，再请求 `getDownloadUrl`。文件本体从签名 URL 下载，不带登录 Token。

下载结果在 `backend/data/raw/<rideId>.fit`，入库结果在 `backend/data/activities.db`。这两处不进 Git。导出的 `activities.json` 在仓库根目录的 `data/activities.json`，会提交，供前端直接读取。已有 FIT 和已入库的编号都会跳过。某个文件失败时，其余文件继续，命令以退出码 1 结束。

## 环境

需要 [uv](https://docs.astral.sh/uv/) 和 Python 3.12 及以上。

```bash
cp .env.example .env
# 填写 IGPSPORT_USERNAME 和 IGPSPORT_PASSWORD
# 开发时可以改填登录返回的 IGPSPORT_ACCESS_TOKEN，本次运行就不再登录
uv sync
uv run igpsport-sync
uv run fit-parse
uv run export-activities
```

```bash
uv run igpsport-sync --limit 1
uv run fit-parse --limit 1
uv run export-activities
```

## 检查

格式化用 Black，检查用 Ruff，依赖和虚拟环境用 uv。提交前 Lefthook 会对暂存的 Python 文件跑 Ruff 和 Black，推送包含 `backend/` 时会跑 pytest。

```bash
make format
make check
make test
```

许可证与 cyc 相同，为 GPL-3.0-only。
