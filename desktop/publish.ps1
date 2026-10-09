$ErrorActionPreference = 'Stop'
$desktopProjectPath = Join-Path $PSScriptRoot 'GithubTrendingVideo.WinForms\GithubTrendingVideo.WinForms.csproj'
$desktopPublishPath = Join-Path $PSScriptRoot 'publish'

dotnet publish $desktopProjectPath -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $desktopPublishPath
if ($LASTEXITCODE -ne 0) { throw 'Desktop application publish failed.' }
Write-Host "Application path: $(Join-Path $desktopPublishPath 'GitHubTrendingVideo.exe')"
