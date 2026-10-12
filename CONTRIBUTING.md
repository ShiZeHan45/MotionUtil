# 贡献与发布约定

## 验收分工（2026-10-12 更新）

应用操作和视频验收由用户完成，用户会提供问题截图或日志。Agent 默认不使用电脑控制工具，不自行点击生成、重试、停止或重启，不关闭或启动用户应用，也不为了验收自行重跑生成流程、覆盖视频。Agent 负责代码修复、必要构建、提交和推送，并说明重跑节点；仅在用户明确要求时操作应用。此约定覆盖旧文档中要求 Agent 打开应用验收的记录，长期入口为 AGENTS.md。

## 提交前检查

- 不提交 `.env`、API Key、Token、证书、虚拟环境、模型缓存、生成视频、运行日志或本地发布目录。
- 修改 WinForms 后运行 `dotnet test desktop/GithubTrendingVideo.WinForms.Tests/GithubTrendingVideo.WinForms.Tests.csproj -c Release`。
- 修改 Node/Remotion 流程后运行 `pnpm typecheck`。
- 提交前检查 `git status` 和 `git diff --cached`，确认没有本机密钥和生成物。

## 提交与推送

每次代码改动完成并验证后，使用一条说明清楚的 commit，然后推送到远程默认分支：

```text
git add <changed-files>
git commit -m "说明改动和原因"
git push origin main
```

推送凭据只通过 Git 的临时认证方式提供，不写入远程 URL、源码或配置文件。
