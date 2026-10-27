# backend

[English](./README.md) | 简体中文

从 iGPSPORT 迹驰下载原始 FIT 文件，解析进 SQLite，再导出给首页地图。下载脚本是 `igpsport/data_sync.py`，解析脚本是 `igpsport/fit_data_parse.py`，导出脚本是 `shared/export_db_to_json.py`。Strava 用 `strava/data_sync.py` 和 `strava/activity_data_parse.py`。两套爬虫各自独立。GPX / TCX 还没做。

登录 `prod.zh.igpsport.com`，按页读取活动，再请求 `getDownloadUrl`。文件本体从签名 URL 下载，不带登录 Token。

下载结果在 `backend/data/igpsport/<rideId>.fit`，Strava 骑行在 `backend/data/strava/<id>.json`，入库结果在 `backend/data/igpsport.db` 和 `backend/data/strava.db`。这些不进 Git。导出的 `activities.json` 在仓库根目录的 `data/activities.json`，每条骑行的曲线和圈点在 `data/rides/<id>.json`。这些文件会提交，供前端直接读取。已有 FIT 会跳过。已入库的活动也会跳过，除非缺 record 时间序列，这时会从 FIT 回填。某个文件失败时，其余文件继续，命令以退出码 1 结束。

## 环境

需要 [uv](https://docs.astral.sh/uv/) 和 Python 3.12 及以上。

```bash
cp .env.example .env
# 填写 IGPSPORT_PHONE 和 IGPSPORT_PASSWORD
# 开发时可以改填登录返回的 IGPSPORT_ACCESS_TOKEN，本次运行就不再登录
make refresh igpsport
```

```bash
uv run igpsport-sync --limit 1
uv run fit-parse --limit 1 --db data/igpsport.db
uv run export-activities --db data/igpsport.db
```

Strava 用自己的数据库。`STRAVA_CLIENT_ID`、`STRAVA_CLIENT_SECRET` 和 `STRAVA_REFRESH_TOKEN` 的获取方法在 [docs/refresh-data.zh.md](../docs/refresh-data.zh.md)。写进 `.env` 后执行：

```bash
make refresh strava
```

`make fetch strava` 刷新 access token，只保留骑行，把摘要、轨迹流和计圈写到 `data/strava/<id>.json`。已经完整的文件会跳过。`make parse strava` 把新骑行写入 `data/strava.db`。`make export strava` 把这份库写成网站用的 JSON。

## 检查

格式化用 Black，检查用 Ruff。提交前 Lefthook 会对暂存的 Python 文件跑 Ruff 和 Black，推送包含 `backend/` 时还会跑 pytest。

```bash
make format
make check
make test
```

仓库的 `Refresh data` Action 每天东八区 0 点跑。仓库变量 `DATA_SOURCE`、仓库 Secrets，以及 Strava 三个密钥的配置写在 [docs/refresh-data.zh.md](../docs/refresh-data.zh.md)。

许可证与 cyc.earth 相同，为 GPL-3.0-only。
