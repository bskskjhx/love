# Telegram 群聊存档

把 Telegram 群聊定时抓取成静态 JSON，并以 iOS 风格的 PWA 发布到 GitHub Pages。

- **抓取**：Python + Telethon，在 GitHub Actions 中接力运行（每轮约 1 小时，结束 1 分钟后开始下一轮），抓取消息、用户资料、头像和媒体，按块（默认每块 500 条）提交到单独的**数据仓库**（默认 `<本仓库名>-data`）的 `data/`。
- **两个仓库**：本仓库放代码，只在代码变化时构建前端；数据仓库放存档并负责接力抓取，抓到新内容后直接用 GitHub Pages 发布，不必重新构建前端。
  两个站点同在 `<用户名>.github.io` 下（`/love/` 与 `/love-data/data/`），属于同一来源，前端直接读取，离线缓存照常工作。
- **前端**：Vite + React + TypeScript + Tailwind，移动端优先，支持群列表、消息懒加载、深链接、搜索、日期跳转、看图、深色模式和离线浏览。
  功能对齐 Telegram 官方 App：置顶消息横幅、回复数与回复串、阅读进度与未读、语音播放器（波形/倍速/连播）、共享媒体、
  消息多选与分享、动画贴纸、论坛话题、字号与聊天背景、自动播放与省流量设置等。

> ⚠️ **隐私提醒**：GitHub Pages 站点是公开的（私有仓库的 Pages 也需要付费计划并额外设置访问控制）。请确认你有权公开这些聊天内容。`TG_SESSION` 等同于账号的登录凭据，只能放在 GitHub Secrets 里。

## 快速开始

### 1. 申请 Telegram API

在 <https://my.telegram.org> → API development tools 创建应用，得到 `api_id` 和 `api_hash`。

### 2. 生成会话字符串（本地运行一次）

```bash
pip install -r scraper/requirements.txt
python scraper/login.py
```

按提示输入手机号和验证码，最后会打印一行 StringSession。

### 3. 创建数据仓库

新建一个**公开**仓库，名字为本仓库名加 `-data`（如 `love-data`；用别的名字时在本仓库的 Variables 里设置 `DATA_URL`，例如 `/my-archive/data/`）。

在**数据仓库**的 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 说明 |
| --- | --- |
| `TG_API_ID` | 第 1 步的 api_id |
| `TG_API_HASH` | 第 1 步的 api_hash |
| `TG_SESSION` | 第 2 步生成的字符串 |
| `TG_CHATS` | 可选，逗号分隔的群组列表；不想把群组写进公开仓库时用它 |

两个仓库的 **Settings → Pages** 都把 Source 设为 **GitHub Actions**。

数据仓库里放两个工作流：接力抓取 `scrape.yml` 与发布 `pages.yml`，可以从 [love-data](https://github.com/bskskjhx/love-data/tree/main/.github/workflows) 复制。数据仓库不需要预先放任何数据，第一次运行时会自动创建 `data/`。

编辑 [scraper/config.json](scraper/config.json)，在 `chats` 中填入要存档的群：

```json
"chats": ["@some_public_group", "https://t.me/another_group", -1001234567890]
```

私有群请用数字 id（账号必须是群成员）。

### 4. 运行

到**数据仓库**的 **Actions → Scrape → Run workflow** 手动触发一次，之后会一直接力运行：每轮抓取约 1 小时（能抓多少抓多少），结束后提交 `data/`、发布数据站点，并在 1 分钟后自动开始下一轮。
抓取时会拉取本仓库最新的 `scraper/`（本仓库名不是数据仓库名去掉 `-data` 时，在数据仓库的 Variables 里设置 `APP_REPO`，如 `me/love`）。

- 每小时第 17 分钟的定时触发是“看门狗”：接力正在进行时直接跳过；接力中断（例如某一轮失败）时把它重新拉起来。
- 部分群抓取失败只记警告，接力照常继续；`TG_SESSION` 失效、缺少配置等致命错误会让接力停止，修好后等下一次看门狗或手动触发即可。
- 在数据仓库的 **Settings → Secrets and variables → Actions → Variables** 中可设置：
  - `SCRAPE_LOOP` 设为 `false`：停止接力，只保留每小时一次的定时运行；
  - `SCRAPE_MINUTES`：每轮抓取的分钟数，默认 `57`。

## 配置项（scraper/config.json）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `siteTitle` | `群聊存档` | 首页标题 |
| `timezone` | `Asia/Shanghai` | 日期分组、日历使用的时区（所有访客看到的日期一致） |
| `chunkSize` | `500` | 每个消息块的条数 |
| `maxMessagesPerRun` | `0` | 单次最多抓取的新消息数，`0` 表示不限制，只受每轮时间限制；大群首次存档会分多轮完成 |
| `refreshRecent` | `200` | 每次重新拉取最近多少条消息，用于同步编辑、表情回应和浏览数 |
| `downloadMedia` | `true` | 是否下载媒体 |
| `maxMediaSizeMB` | `20` | 超过此大小的文件只记录信息不下载 |
| `mediaTypes` | 全部 | 要下载的媒体类型：`photo` `sticker` `gif` `video` `round` `voice` `audio` `file` |
| `convertVoice` | `true` | 用 ffmpeg 把语音转成 m4a，保证 iOS Safari 能播放 |
| `maxProfilesPerRun` | `100` | 每个群每次最多获取多少位成员的个人简介（每位一次请求），`0` 表示不获取 |
| `profileRefreshDays` | `7` | 个人简介多少天刷新一次 |
| `chatConcurrency` | `3` | 同时抓取几个群 |
| `downloadConcurrency` | `6` | 媒体、头像、缩略图同时下载的数量（所有群共用） |
| `profileConcurrency` | `4` | 同时获取几位成员的个人简介 |
| `batchSize` | `100` | 新消息每批最多多少条一起处理（批内媒体并发下载，写入仍按原顺序） |

并发调得越高越容易触发 Telegram 的限流（FloodWait）；300 秒以内的限流会自动等待后继续，更长的会让这一轮提前结束，下次运行接着抓。

环境变量 `MAX_RUNTIME_MIN`（本地默认 40，Actions 中默认 57，可用变量 `SCRAPE_MINUTES` 修改）限制单次抓取时间，超时后保存进度，下一轮继续。

> 仓库和 Pages 都有体积限制（Pages 站点建议小于 1 GB）。数据仓库超过建议值后，可以调低 `maxMediaSizeMB`、精简 `mediaTypes`，或把数据仓库的历史压缩成一个提交后强制推送（只影响数据仓库）。

## 本地开发

```bash
npm install
npm run demo:data   # 生成演示数据到 .demo-data/
npm run dev:demo    # 使用演示数据启动
npm run dev         # 使用本地的 data/ 启动（DATA_DIR=../love-data/data 可指向数据仓库的克隆）
npm run build       # 类型检查并构建到 dist/（未设置 VITE_DATA_URL 时会把 data/ 复制进去）
npm test            # 前端单元测试（vitest）
npm run test:scraper  # 抓取脚本单元测试（需先安装 scraper/requirements.txt）
```

本地抓取：

```bash
export TG_API_ID=... TG_API_HASH=... TG_SESSION=...
DATA_DIR=../love-data/data python scraper/scrape.py
```

## 功能

- **群列表**：大标题导航栏、搜索过滤、最后一条消息预览
- **消息**：按块懒加载（向上/向下滚动自动加载，DOM 中最多保留 4 块），保持滚动锚点不跳动；相册、回复、转发、表情回应、服务消息、富文本（粗体、代码块、引用、剧透、链接、话题标签等）
- **媒体**：图片（尺寸预先占位）、视频、GIF、贴纸、语音、视频消息、文件、投票、位置、链接预览
- **深链接**：`#/c/<群 id 或 username>/<消息 id>`，长按/右键消息可复制链接
- **搜索**：群内全文搜索（文字、文件名、链接标题、投票），可按成员筛选；点击话题标签直接搜索
- **日期跳转**：日历按天显示消息热度，点击跳到当天第一条
- **看图**：左右滑动切换、双指/双击/滚轮缩放、下滑关闭
- **深色模式**：跟随系统或手动切换
- **PWA**：可添加到主屏幕，浏览过的内容可离线查看

## 数据结构

```
data/
  index.json                      站点信息与群列表
  avatars/<peerId>_<photoId>.jpg  头像（换头像后文件名会变）
  chats/<chatId>/
    meta.json                     群资料、块索引 chunks[]、日期索引 days{}、置顶 pins[]、论坛话题 topics[]
    replies.json                  回复索引：被回复消息 id → 回复它的消息 id（旧存档首次运行时自动重建）
    users.json                    发言者资料与发言数
    messages/<n>.json             第 n 块消息，按 id 升序，每行一条
    media/<YYYY-MM>/<分组>/<msgId>.<ext>  媒体文件；分组 = msgId // 200 * 200，保证单个目录不超过 GitHub 网页的 1000 个文件上限
```

单条消息的字段见 [src/lib/types.ts](src/lib/types.ts)。存档只增不减：Telegram 中被删除的消息会保留在存档里。

## 目录

```
scraper/        抓取脚本（scrape.py）、登录脚本（login.py）、演示数据（demo.py）
src/            前端源码
public/         PWA 清单、图标（Service Worker 由 vite-plugin-pwa 在构建时生成）
.github/        Actions：deploy.yml（构建部署前端）
```
