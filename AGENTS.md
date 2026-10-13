# 项目协作约定

## 验收分工（2026-10-13 更新）

- 用户自己操作桌面应用并做最终观看；有问题会提供截图或日志。用户不想让 Agent 用电脑控制工具（computer-use）点应用，因为过程很慢。
- 默认不要使用电脑控制工具，不要自行点击运行、重试、停止或重启，不要关闭、启动或控制用户正在使用的应用，不要擅自启动生成流程，不要覆盖用户现有的输出视频；只有用户明确要求 Agent 操作应用时才执行。
- 但 Agent 必须自己做抽帧验收，这是保证交付质量的必要步骤，不能因为“用户验收”而省略。涉及画面、布局、动画的改动，交付前都要用命令行渲染静帧（或从产物中抽帧），逐帧查看并修复问题（文字越界、裁切、重叠、遮挡等）。
- 抽帧结果写到临时目录或被忽略的 `.cache/`，不要放进输出目录。验证用的示例数据要覆盖较长列表和较长文字等边界情况。
- 最后向用户说明：验证了哪些帧、没验证到什么、用户应从哪个节点重跑。
- Agent 负责读取源码和产物、修复问题、完成必要构建和源码提交推送。此约定覆盖知识库旧记录中的“Agent 必须打开应用验收”，也纠正“全部验收交给用户”的宽泛理解。

## 运行环境（WSL 与 Windows）

- Agent 常运行在 WSL（Linux）里，而 `node_modules` 是在 Windows 上安装的，只有 win32 原生二进制（rspack、Remotion compositor）。在 WSL 里直接运行 `pnpm remotion ...`、`npx remotion ffmpeg` 会报 `Cannot find native binding`，不要在这里重装依赖，以免破坏用户的 `node_modules`。
- 需要渲染或抽帧时，通过 WSL 互操作调用 Windows 侧的 Node：`cmd.exe /c "cd /d E:\AI\github-trending-video && node <脚本>"`。脚本可用 `@remotion/bundler` 的 `bundle` 加 `@remotion/renderer` 的 `selectComposition`、`renderStill`，渲染 `ProjectVideo` 合成，一次打包后渲染多帧；输出 PNG 再用 Read 工具查看。
- `pnpm typecheck` 在 WSL 里可以正常运行。
- 工作区文件多为 CRLF，而 HEAD 中是 LF。直接提交会造成全文行尾改动，提交前先用 `git diff --ignore-space-at-eol` 区分真实改动和行尾噪音。用脚本编辑 CRLF 文件时要保持 `\r\n`，不要混用行尾。

## 交付与配置

- 遵循 CONTRIBUTING.md 的提交与推送约定，每次源码改动完成后提交并推送。
- 桌面发布只使用 desktop/publish.ps1 和 desktop/publish/GitHubTrendingVideo.exe，不新增 publish-* 目录。正在使用的 EXE 无法覆盖时，说明限制，交由用户关闭后再发布。
- Node.js / Remotion 由桌面直接调用项目源码；只修改这些源码时无需重启或重新编译 EXE。
- 保留用户的 Buzz 服务、模型、密钥、语速、音色和背景配置；不输出密钥。
- 不删除用户素材 assets/weekly-grid.mp4。

## 视频布局

- 2026-10-14 起视频不再有操作相关段落（setup / workflow / requirements），固定六段：开场、问题、原理、案例、结果、总结。旧的九段数据仍可渲染。
- 开场榜单显示星形图标和累计 Star 数字，不显示“总 Star”文字标签；开场口播的累计 Star 由程序生成固定句式：字幕写“累计 142K+ Star”（向下取整到 K，不足 1000 写原数），配音读中文数；当期新增数口播不说，只在榜单卡片显示。
