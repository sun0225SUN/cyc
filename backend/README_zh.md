# backend

[English](./README.md) | 简体中文

从 iGPSPORT 迹驰下载原始 FIT 文件，解析进 SQLite，再导出给首页地图。下载脚本是 `src/igpsport_sync.py`，解析脚本是 `src/fit_parse.py`，导出脚本是 `src/export_activities.py`。GPX / TCX 还没做。

登录 `prod.zh.igpsport.com`，按页读取活动，再请求 `getDownloadUrl`。文件本体从签名 URL 下载，不带登录 Token。

下载结果在 `backend/data/raw/<rideId>.fit`，入库结果在 `backend/data/activities.db`。这两处不进 Git。导出的 `activities.json` 在仓库根目录的 `data/activities.json`，会提交，供前端直接读取。已有 FIT 和已入库的编号都会跳过。某个文件失败时，其余文件继续，命令以退出码 1 结束。

## 环境

需要 [uv](https://docs.astral.sh/uv/) 和 Python 3.12 及以上。

```bash
cp .env.example .env
# 填写 IGPSPORT_PHONE 和 IGPSPORT_PASSWORD
# 开发时可以改填登录返回的 IGPSPORT_ACCESS_TOKEN，本次运行就不再登录
make refresh
```

```bash
uv run igpsport-sync --limit 1
uv run fit-parse --limit 1
uv run export-activities
```

## 检查

格式化用 Black，检查用 Ruff。提交前 Lefthook 会对暂存的 Python 文件跑 Ruff 和 Black，推送包含 `backend/` 时还会跑 pytest。

```bash
make format
make check
make test
make refresh
```

仓库的 `Refresh rides` Action 每天东八区 0 点跑 `make refresh`，若 `data/activities.json` 有变化就提交到 `main`。需要仓库 Secrets：`IGPSPORT_PHONE`、`IGPSPORT_PASSWORD`，以及能推 `main` 的 `ACTION_TOKEN`。也可以在 Actions 里手动触发。

许可证与 cyc 相同，为 GPL-3.0-only。
