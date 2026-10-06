# GitHub Trending 项目视频生成器

这是一个读取 GitHub 本周热门项目榜单、为前 5 个项目准备介绍稿、生成中文配音并制作竖屏视频的工具。现在提供 Windows Forms 桌面端，常见操作不需要打开 PowerShell。

## 桌面软件（推荐）

桌面端源码在 [`desktop/GithubTrendingVideo.WinForms`](desktop/GithubTrendingVideo.WinForms)。打开 [`desktop/README.md`](desktop/README.md) 按说明构建或发布。软件内有四个页面：

- **运行流程**：可视化查看五个节点、进度、错误和最近输出；失败后从指定节点继续。
- **环境与下载**：检查并安装 Node.js、项目依赖、Python/Kokoro、语音模型和 Remotion 浏览器。
- **设置**：填写模型服务、GitHub Token、Kokoro 音色/语速、输出目录和浏览器路径；密钥使用 Windows 当前用户 DPAPI 加密保存。
- **运行日志**：保留 Node.js、Python 和 Remotion 的实时输出，便于排查下载或渲染问题。

首次打开软件，在“设置”选择本项目目录（例如 `E:\AI\github-trending-video`），然后在“环境与下载”按缺少项安装即可。

当前工作区已生成可直接运行的 Windows x64 文件：`desktop\publish\GitHubTrendingVideo.exe`。

你每周只需要启动一次完整流程，完成后到 `output` 文件夹里检查视频，再手动发布。

## 生成的视频包含什么

- 每个项目单独生成一个视频，最长 3 分钟。
- 视频会介绍项目是什么、解决什么问题、实际例子、怎么使用，以及运行条件。
- 视频带动画、字幕和 Kokoro 中文配音，尺寸为手机竖屏。
- 程序不会自动发布视频，也不会定时启动；需要你手动运行和发布。

## 第一次使用：安装一次就好

下面的命令都在项目文件夹中运行。比如项目放在 `E:\AI\github-trending-video`，先打开 PowerShell 并进入这个文件夹：

```powershell
cd E:\AI\github-trending-video
```

### 1. 安装 Node.js 和 pnpm

安装 Node.js 22 或更新版本。安装后关闭并重新打开 PowerShell，然后检查：

```powershell
node --version
npm --version
```

如果显示“无法识别 node 或 npm”，说明 Node.js 没装好，或 PowerShell 还没重新打开。

安装 pnpm 和项目依赖：

```powershell
npm install --global pnpm
pnpm install
```

### 2. 安装 Kokoro 中文配音

先确认 Python 3.12 已安装；如果 PowerShell 找不到 `python`，先安装 Python 3.12 并重新打开 PowerShell。然后在项目文件夹里逐行运行：

```powershell
python -m venv .venv-kokoro
& '.\.venv-kokoro\Scripts\python.exe' -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& '.\.venv-kokoro\Scripts\python.exe' -m pip install 'kokoro>=0.9.4' 'misaki[zh]>=0.8.2' soundfile
```

第一次生成配音时，程序还会下载 Kokoro 的语音模型。下载完成后会留在本机，之后不用重复下载。

### 3. 填写必要设置

复制设置样例，并用记事本打开：

这一步只做一次。如果已经有 `.env` 文件，不要再次复制，以免覆盖里面的设置。

```powershell
Copy-Item .env.example .env
notepad .env
```

至少填写下面两项。它们用于生成项目介绍稿：

```text
OPENAI_API_KEY=你的模型服务密钥
OPENAI_MODEL=你要使用的模型名称
```

如果你用的不是 OpenAI 官方接口，还要把 `OPENAI_BASE_URL` 改成模型服务提供的网址。读取 GitHub 公开资料不需要 Token；如果 GitHub 请求次数受限，可以填写 `GITHUB_TOKEN`。

通常不需要改其他设置。只要 Kokoro 是按上一步装在项目里的 `.venv-kokoro` 文件夹中，`KOKORO_PYTHON` 默认值就能使用。不要把含有密钥的 `.env` 文件发给别人。

## 每周生成新视频

以后每周需要生成新的一期时，在项目文件夹中运行：

```powershell
pnpm run run
```

程序会自动按顺序完成：

1. 读取 GitHub Trending 本周榜单。
2. 收集前 5 个项目的资料。
3. 生成项目介绍稿。
4. 用本机 Kokoro 生成配音。
5. 制作带字幕和动画的竖屏视频。

只有“生成项目介绍稿”会调用你配置的模型服务。它会一次处理榜单里还没有讲稿缓存的项目；同样的项目资料和设置再次处理时，会优先使用保存好的讲稿。配音和视频由本机程序生成。

首次运行可能需要下载语音模型和浏览器，等待命令完成即可。运行期间不要关闭 PowerShell。

## 去哪里找视频

所有内容都放在项目文件夹里的 `output` 下。每次运行会新建一个带日期和时间的文件夹：

```text
output\运行日期和时间\renders\
```

打开 `renders` 文件夹，里面的 `.mp4` 就是生成的视频。文件名前面的 `rank-01`、`rank-02` 表示它在本周榜单上的名次。每个项目各有一个视频。

同一期的讲稿、配音和项目资料也保存在这个日期文件夹里：

- `scripts`：项目介绍稿。
- `audio`：每段配音，以及渲染视频使用的资料。
- `trending.json`：本次榜单记录。
- `run-report.json`：流程完成情况；如果流程中断，可查看停在哪一步。

## 需要修改后重新生成

修改最近一期的讲稿时，打开该期 `scripts\index.json`，修改对应项目的文字，然后在项目文件夹运行：

只改屏幕文字就改 `text`。如果这一段还有 `spokenText`，它控制实际配音；想改读出来的话也要修改它。没有 `spokenText` 时，配音会直接使用 `text`。

```powershell
pnpm run tts
pnpm run render
```

这会重新配音并重新制作视频，不会重新收集榜单或重新生成讲稿。只调整动画画面时，运行：

```powershell
pnpm run render
```

这些命令默认处理最近一期。讲稿资料没有变化时，生成步骤会优先使用缓存，减少重复的模型调用。

如果要重做较早一期，把命令里的 `pnpm run tts` 和 `pnpm run render` 改成下面这样，并把最后的文件夹名换成那一期的实际名称：

```powershell
pnpm run tts -- --run-id 2026-10-05T12-30-00-000Z
pnpm run render -- --run-id 2026-10-05T12-30-00-000Z
```

## 发布前检查

建议至少完整看一遍视频，重点听项目名和数字的读音，并检查字幕是否跟当前内容对应。视频确认无误后，再手动上传到短视频平台。

## 常见问题

**PowerShell 提示找不到 `pnpm`、`node` 或 `npm`**

先安装 Node.js，关闭并重新打开 PowerShell，再按上面的步骤安装 pnpm。

**提示没有配置 `OPENAI_API_KEY` 或 `OPENAI_MODEL`**

检查项目根目录下的 `.env` 是否存在，并确认这两项已经填写。改完后重新运行命令。

**Kokoro 配音启动失败**

确认 `.venv-kokoro\Scripts\python.exe` 存在，且已经成功安装了上面的三个配音依赖。首次使用也需要网络下载语音模型。

**GitHub 请求失败或次数受限**

检查网络连接；如果提示请求次数受限，在 `.env` 中填写 `GITHUB_TOKEN` 后再试。

**视频渲染时提示找不到浏览器**

保持网络连接后重试，让 Remotion 下载所需浏览器。如果仍失败，可在 `.env` 中把 `REMOTION_BROWSER_EXECUTABLE` 填成电脑上 Chrome 的完整路径。

## 预览动画样式

如需单独打开样片预览，在项目文件夹运行：

```powershell
pnpm run dev
```

样片只用于看动画排版，不含本周真实项目讲稿和配音。
