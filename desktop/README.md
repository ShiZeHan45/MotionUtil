# GitHub Trending Video · WinForms 桌面端

此目录是项目的 Windows Forms 桌面入口。它复用根目录已经跑通的 Node.js、Remotion 和 Kokoro 流程，不改变现有视频模板。

## 功能

- 主界面显示 5 个节点：采集周榜、收集项目资料、生成讲稿、生成中文配音、渲染视频。
- 每个节点显示等待中、运行中、已完成或失败；可以从失败节点继续，也可以单独重试节点。
- 节点 3 直接显示生成、修复、压缩、网络重试与已接收字符数；未知进度显示活动指示，新一期保留历史耗时供预计剩余参考。没有可靠预估时显示已用时间与当前活动。
- 超长讲稿自动压缩，无需确认弹窗；压缩期间节点 3 运行，节点 4 显示“等待讲稿压缩”，配音进度暂停显示。
- 运行日志实时接收 Node.js/Python/Remotion 的标准输出和错误输出。
- 环境页检查 Node.js、项目依赖、Python/Kokoro、语音模型和 Remotion Headless Chrome，并提供下载、安装、重试按钮。
- 设置页覆盖模型服务、API Key、模型思考强度（自动、低、中、高、极高）、GitHub Token、节点 2 周榜项目数量、Kokoro 音色/设备/语速、浏览器路径和输出目录。
- API Key 与 GitHub Token 使用 Windows 当前用户 DPAPI 加密保存于 `%LOCALAPPDATA%\GitHubTrendingVideo\settings.json`。
- “视频动态背景”可选择 MP4 或 GIF；留空时使用白底，动态素材在节点 5 预解码为可循环的帧缓存。

## 开发构建

需要 Windows 10/11、Visual Studio 2022（安装“.NET 桌面开发”工作负载）或 .NET 8 SDK：

```powershell
cd E:\AI\github-trending-video
dotnet restore .\desktop\GithubTrendingVideo.WinForms\GithubTrendingVideo.WinForms.csproj
dotnet build .\desktop\GithubTrendingVideo.WinForms\GithubTrendingVideo.WinForms.csproj -c Release
```

发布成不依赖目标电脑 .NET 安装的单文件 Windows x64 程序：

```powershell
& .\desktop\publish.ps1
```

当前工作区已经生成可直接运行的发布文件：`desktop\\publish\\GitHubTrendingVideo.exe`（Windows x64，自包含）。

发布脚本始终更新 `desktop\publish`，这是唯一启动入口；不要新增其他 `publish-*` 目录。模型服务默认为 `https://api.buzzai.cc/v1`，使用 `sk-buzz-` 密钥时会自动纠正旧设置中的其他服务地址。密钥仍由 Windows DPAPI 加密保存，配音默认语速为 1.0。

每次发布应用后，都要提交对应源码并推送到 `origin/main`，记录提交编号。发布文件、本机设置、密钥、缓存和运行产物不加入源码提交。

节点 3 会在日志中显示实际服务地址与模型名称，流式接收讲稿并每 15 秒显示等待或接收进度。网络中断、429 和临时网关错误最多重试五次；格式不合要求时向同一模型修复一次。完成一个项目就保存讲稿及缓存，失败后从节点 3 继续即可复用已经完成的项目。

讲稿时长按实际配音时间线预算：原理 beats 替代 concept 原始段，优先统计 spokenText，并包含发音替换、音色、语速和段间停顿。目标约 180 秒，允许上限 200 秒；节点 3 在配音前自动压缩预计超长的内容，节点 4 用 WAV 实测时长兜底并最多自动压缩、重配音三轮。实测语速记录在 `.cache\narration-timing`，按语音模型、音色和倍速分别校准。讲稿缓存版本已升级，旧缓存及配音设置不匹配的缓存不会复用。

原理图由 ELK 根据完整关系图、卡片实际尺寸和标签实际尺寸自动排版，后续 beat 出现时已有对象位置保持稳定。连线使用绕开无关卡片的正交路径，标签水平换行；路径交叉时用跨线弧区分关系，重合路径及无法安全绘制跨线弧的布局会被拒绝。节点 5 在编码前预检每个原理 beat 的末帧，并在渲染过程中检查文字越界、卡片重叠、连线穿过无关卡片、标签遮挡卡片或其他连线、标签互相重叠。自动调整仍不合格或必须缩小到 80% 以下时明确报错，避免输出难以阅读的图形。此逻辑复用现有讲稿和音频，从节点 5 重渲即可生效，无需重启或重新构建桌面程序。

启动后在“设置”里选择根项目目录（例如 `E:\AI\github-trending-video`）。首次使用进入“环境与下载”，按顺序安装 Node.js、项目组件、Kokoro 配音环境、语音模型和 Remotion 浏览器。所有安装操作都由软件启动，日志会显示进度和失败原因。

## 从哪里开始执行

1. 点击左侧 **开始生成**。
2. 如果首次使用，先点击 **设置**，填写项目目录、模型服务和 API Key。
3. 回到 **开始生成** 页面，点击右侧蓝色的 **▶ 开始生成本周视频**。
4. 软件会按节点 1 到节点 5 执行；下方卡片显示每一步状态。失败时可点击对应节点的“重试此节点”。

## 首次运行的实际下载

- Node.js 22 Windows x64 压缩包约 35 MB，安装到当前用户的应用目录。
- Python 3.12 Windows x64 安装程序约 26 MB，安装到当前用户的应用目录，然后在项目里创建 `.venv-kokoro`。
- CPU 版 PyTorch、Kokoro、misaki 和 soundfile 由 pip 安装，体积和耗时取决于网络。
- Kokoro 模型默认放在项目 `.cache\kokoro`，下载约 350 MB（实际以 Hugging Face 返回为准）。
- Remotion Headless Chrome 由 Remotion 官方下载器放在项目 `node_modules\.remotion`。

下载失败时不会把不完整文件标记为可用；重新点击同一按钮即可继续。模型服务和 GitHub 访问仍需要用户自己的网络和凭据。
