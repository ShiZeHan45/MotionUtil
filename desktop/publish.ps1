$ErrorActionPreference = 'Stop'
$desktopProjectPath = Join-Path $PSScriptRoot 'GithubTrendingVideo.WinForms\GithubTrendingVideo.WinForms.csproj'
$desktopPublishPath = Join-Path $PSScriptRoot 'publish'

dotnet publish $desktopProjectPath -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $desktopPublishPath
if ($LASTEXITCODE -ne 0) { throw '桌面应用构建失败，未完成发布。' }
Write-Host "应用启动位置：$(Join-Path $desktopPublishPath 'GitHubTrendingVideo.exe')"
