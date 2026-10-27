# 自动同步骑行数据

[English](./refresh-data.md)

每天东八区 0 点，[`.github/workflows/refresh-data.yml`](../.github/workflows/refresh-data.yml) 会读取仓库变量 `DATA_SOURCE`，执行 `make refresh igpsport` 或 `make refresh strava`。有变化时，它把 `data/activities.json` 和 `data/rides/*.json` 提交到 `main`。

手动触发时，页面上的「数据来源」优先于这个变量。一次运行只导出一份库，所以换成另一个来源会用那一份库覆盖网站上的 JSON。

## 仓库变量

定时任务没有手动输入，数据来源放在 **Repository variables**。不要配在上面的 Environment variables。那一块是给某个 GitHub Environment 用的，这个 workflow 不会读它。

1. 打开仓库的 **Settings → Secrets and variables → Actions**。
2. 切到 **Variables**。
3. 在 **Repository variables** 里点 **New repository variable**。
4. Name 填 `DATA_SOURCE`。Value 只能是 `igpsport` 或 `strava`。

没填、或填了别的值，定时任务会失败，并提示要设置 `DATA_SOURCE`。

## 仓库 Secrets

密钥放在同一个页面的 **Secrets** 标签，点 **New repository secret**。同样是仓库级，不是 Environment secrets。

没被 `DATA_SOURCE` 选中的来源可以留空。workflow 只会检查当前来源缺的那几项。

| Name | 何时需要 | 值 |
| --- | --- | --- |
| `ACTION_TOKEN` | 每次都要 | 能向 `main` 推送的 personal access token。创建步骤见下一节 |
| `IGPSPORT_PHONE` | `DATA_SOURCE=igpsport` | iGPSPORT 登录手机号 |
| `IGPSPORT_PASSWORD` | `DATA_SOURCE=igpsport` | iGPSPORT 登录密码 |
| `STRAVA_CLIENT_ID` | `DATA_SOURCE=strava` | 下面拿到的 Client ID |
| `STRAVA_CLIENT_SECRET` | `DATA_SOURCE=strava` | 下面拿到的 Client Secret |
| `STRAVA_REFRESH_TOKEN` | `DATA_SOURCE=strava` | 下面拿到的 refresh token |

本地开发把同样的名字写进 `backend/.env`，不要提交这个文件。本地还可以用 `IGPSPORT_ACCESS_TOKEN` 跳过登录。workflow 没有把这个 secret 传进去，定时同步 iGPSPORT 时用手机号和密码。

## 配置 ACTION_TOKEN

workflow 用 `secrets.ACTION_TOKEN` 拉取代码并提交导出结果。默认的 `GITHUB_TOKEN` 推不上受保护的 `main`。这个 token 每次运行都要有，和 `DATA_SOURCE` 选哪个来源无关。

1. 打开 GitHub 头像 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**。地址是 <https://github.com/settings/personal-access-tokens>。
2. 点 **Generate new token**。
3. Token name 填一个能认出用途的名字，例如 `cyc-earth-refresh`。Expiration 选一个期限。到期前要重新生成，并更新下面的 Secret。
4. Resource owner 选这个仓库所属的账号。Repository access 选 **Only select repositories**，只勾选本仓库。
5. Permissions 里把 **Contents** 设为 **Read and write**。其余权限不用开。
6. 生成后立刻复制 token。页面关掉就看不到了。
7. 回到本仓库的 **Settings → Secrets and variables → Actions → Secrets**，点 **New repository secret**。
8. Name 必须是 `ACTION_TOKEN`。Value 粘贴刚才的 token。

如果账号或组织不允许 fine-grained token，改用 **Tokens (classic)**，勾选 `repo`，再按第 7、8 步存成同名 Secret。拥有这个 token 的账号必须有向 `main` 直接推送的权限。

## 手动运行

打开 **Actions → Refresh data → Run workflow**。数据来源必选，只能是 `igpsport` 或 `strava`。这一次的选择会盖过仓库变量。

另外两个开关：

- **Ignore downloaded rides cache for this run**：这次不恢复已下载的文件和数据库，重新拉取。
- **Delete downloaded rides cache from GitHub Actions**：删掉 Actions 里保存的下载缓存。

任务最长 6 小时。Strava 遇到 429 时，下载会停并打印警告，已经保存的骑行仍会解析和导出，这次运行按成功结束。15 分钟额度在每个小时的 0、15、30、45 分重置，每天额度在 UTC 午夜重置。

## 获取 Strava 的三个密钥

步骤和 [running_page 的 Strava 说明](https://github.com/yihong0618/running_page/blob/master/README-CN.md#strava) 相同。那边的截图可以直接对照。这个项目只读骑行，授权范围用 `read,activity:read_all`，不需要 running_page 里的写入权限。

Strava 在 2026 年 6 月改了开发者计划。Standard 应用要有 Strava 订阅才能调 API。先在 [API 设置](https://www.strava.com/settings/api) 看自己的应用等级。说明见 [Strava 公告](https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428)。

1. 登录 [Strava](https://www.strava.com/)。
2. 打开 [Create & Manage Your App](https://www.strava.com/settings/api)，创建应用。**Authorization Callback Domain** 填 `localhost`，不要加 `http://`。
3. 创建成功后，页面上的 **Client ID** 就是 `STRAVA_CLIENT_ID`，**Client Secret** 就是 `STRAVA_CLIENT_SECRET`。
4. 把下面链接里的 `YOUR_CLIENT_ID` 换成你的 Client ID，在浏览器里打开，并同意授权：

   ```text
   https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=read,activity:read_all
   ```

5. 浏览器会停在打不开的 `localhost` 页面。从地址栏复制 `code`。例如地址是 `http://localhost/exchange_token?code=YOUR_CODE&scope=read,activity:read_all`，`YOUR_CODE` 那一段就是要复制的值。这个 code 只能用一次，而且很快过期。
6. 用 Client ID、Client Secret 和这个 code 换 refresh token：

   ```bash
   curl -X POST https://www.strava.com/oauth/token \
     -F client_id=YOUR_CLIENT_ID \
     -F client_secret=YOUR_CLIENT_SECRET \
     -F code=YOUR_CODE \
     -F grant_type=authorization_code
   ```

   返回 JSON 里的 `refresh_token` 就是 `STRAVA_REFRESH_TOKEN`。把它和前两个值一起放进 `backend/.env`，或者放进上面的三个仓库 Secrets。

Strava 有时会换发新的 refresh token。本地同步会写回 `.env`。GitHub Actions 不会改仓库 Secret。如果定时任务开始报 refresh token 无效，用同一步骤重新授权，并更新 `STRAVA_REFRESH_TOKEN`。
