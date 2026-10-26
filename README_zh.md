<div align="center">
  <p>
    <img src="./readme/images/logo.png" alt="cyc.earth" width="100" style="border-radius: 24px;" />
  </p>
  <h2>创建你的个人骑行主页</h2>

  [English](./README.md) | 简体中文

  <p><a href="https://cyc.earth">https://cyc.earth</a></p>

  <img alt="GitHub License" src="https://img.shields.io/github/license/sun0225SUN/cyc.earth?style=flat">
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/sun0225SUN/cyc.earth?style=flat">
  <img alt="GitHub Repo forks" src="https://img.shields.io/github/forks/sun0225SUN/cyc.earth?style=flat">
  <img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/sun0225SUN/cyc.earth?style=flat">
  <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/sun0225SUN/cyc.earth?style=flat">
  <img alt="Page views" src="https://komarev.com/ghpvc/?username=cyc&label=Views&color=orange&style=flat" />
</div>

## ✨ 功能

- [x] 🌓 深色 / 浅色主题
- [x] 🌐 英文和简体中文
- [x] 🌍 Mapbox 地球上的全部骑行轨迹
- [x] 📅 年度热力图、活动列表、相似轨迹墙
- [x] 📊 按年 / 月 / 周 / 日的 Summary 图表
- [x] 🚴 每天从 iGPSPORT 自动导入新数据

## 🔨 技术栈

- ⚡ 框架 - [Next.js](https://nextjs.org)
- 🧩 语言 - [TypeScript](https://www.typescriptlang.org)
- 🌬️ 样式 - [Tailwind CSS](https://tailwindcss.com)
- 🎛️ UI 库 - [shadcn/ui](https://ui.shadcn.com)
- 🗺️ 地图 - [Mapbox](https://mapbox.com)
- 🌐 多语言 - [next-intl](https://next-intl.dev)
- 📈 图表 - [Recharts](https://recharts.org)
- 🧹 格式化和检查 - [Biome](https://biomejs.dev)
- 🪝 Git 钩子 - [Lefthook](https://lefthook.dev)
- 🧪 测试 - [Vitest](https://vitest.dev)
- 📊 流量分析 - [Umami](https://umami.is)

## 🚀 快速开始

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sun0225SUN/cyc.earth)

> [!warning]
> 运行或部署前，请先配好必要的环境变量。

```bash
# 站点地址。Vercel 上可选。
NEXT_PUBLIC_SITE_URL=https://cyc.earth

# Mapbox。画地球必须有。
NEXT_PUBLIC_MAPBOX_TOKEN=

# Umami。可选。
NEXT_PUBLIC_UMAMI_HOST=
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
```

<details>
<summary><strong>Mapbox</strong></summary>

在 [Mapbox access tokens](https://account.mapbox.com/access-tokens/) 创建一个公开 token。

</details>

## 💻 本地开发

1. 克隆仓库

```bash
git clone https://github.com/sun0225SUN/cyc.earth.git
cd cyc.earth
```

2. 在仓库根目录创建 `.env.local`，按 [快速开始](#-快速开始) 填写变量。

3. 安装依赖

```bash
bun install
```

4. 启动开发服务器

```bash
bun run dev
```

打开 [http://localhost:3000](http://localhost:3000)。默认语言是英文，中文在 `/zh`。

```bash
bun run build
bun run lint
bun run format
bun run test
```

## 🚴 骑行数据

活动文件放在 `backend/`。页面读取 `data/activities.json`。

```bash
cd backend
cp .env.example .env
# 填写 IGPSPORT_PHONE 和 IGPSPORT_PASSWORD
make refresh
```

```bash
make -C backend check
make -C backend test
```

`Refresh rides` Action 会在东八区每天 0 点跑 `make refresh`，`data/activities.json` 有变化就提交到 `main`。需要仓库 Secrets：`IGPSPORT_PHONE`、`IGPSPORT_PASSWORD`，以及能推 `main` 的 `ACTION_TOKEN`。也可以在 Actions 里手动触发。

更细的说明见 [`backend/README_zh.md`](backend/README_zh.md)。英文：[`backend/README.md`](backend/README.md)。

## 📁 目录

界面按 [Feature-Sliced Design](https://feature-sliced.design) v2.1 组织。

```text
app/                 Next.js 路由
messages/            next-intl 文案
data/activities.json 导出的骑行数据
backend/             iGPSPORT 下载、FIT 解析、JSON 导出
src/_app/            provider、样式、i18n
src/_pages/          一个路由一个切片
src/widgets/         跨页面复用的大块界面
src/features/        复用的用户动作
src/entities/        业务实体
src/shared/          UI 和配置
```

Agent 说明在 [`AGENTS.md`](AGENTS.md) 和 [`docs/agent/`](docs/agent/)。

## 👥 贡献者

<!-- readme: collaborators,contributors -start -->
<table>
	<tbody>
		<tr>
            <td align="center">
                <a href="https://github.com/sun0225SUN">
                    <img src="https://avatars.githubusercontent.com/u/79169717?v=4" width="100;" alt="sun0225SUN"/>
                    <br />
                    <sub><b>Guoqi Sun</b></sub>
                </a>
            </td>
		</tr>
	<tbody>
</table>
<!-- readme: collaborators,contributors -end -->

## 📝 许可协议

本项目使用 [GNU General Public License v3.0](LICENSE)。

## 🤝 贡献

欢迎提 issue 和 pull request。

提交标题形如 `:emoji: type(scope): subject`，例如 `:sparkles: feat(map): add activity heatmap`。Lefthook 会格式化已暂存文件，Commitlint 检查说明，`pre-push` 会跑测试。

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=sun0225SUN/cyc.earth&type=Date)](https://www.star-history.com/#sun0225SUN/cyc.earth&Date)
