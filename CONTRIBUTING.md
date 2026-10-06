# 贡献与发布约定

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
