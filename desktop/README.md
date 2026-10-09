# GitHub Trending Video · WinForms 桌面端

此目录是项目的 Windows Forms 桌面入口。它复用根目录已经跑通的 Node.js、Remotion 和 Kokoro 流程，不改变现有视频模板。

## 功能

- 主界面显示 5 个节点：采集周榜、收集项目资料、生成讲稿、生成中文配音、渲染视频。
- 每个节点显示等待中、运行中、已完成或失败；可以从失败节点继续，也可以单独重试节点。
- 运行日志实时接收 Node.js/Python/Remotion 的标准输出和错误输出。
- 环境页检查 Node.js、项目依赖、Python/Kokoro、语音模型和 Remotion Headless Chrome，并提供下载、安装、重试按钮。
- 设置页覆盖模型服务、API Key、GitHub Token、节点 2 周榜项目数量、Kokoro 音色/设备/语速、浏览器路径和输出目录。
- API Key 与 GitHub Token 使用 Windows 当前用户 DPAPI 加密保存于 `%LOCALAPPDATA%\GitHubTrendingVideo\settings.json`。

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

节点 3 会在日志中显示实际服务地址与模型名称，流式接收讲稿并每 15 秒显示等待或接收进度。网络中断、429 和临时网关错误最多请求三次；格式不合要求时向同一模型修复一次。完成一个项目就保存讲稿及缓存，失败后从节点 3 继续即可复用已经完成的项目。

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
