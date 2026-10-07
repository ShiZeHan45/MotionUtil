$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
Get-ChildItem -LiteralPath $artifacts -Filter '*.exe' -File -ErrorAction SilentlyContinue | Remove-Item -Force
dotnet publish (Join-Path $root 'src/App/MotionVideoPipeline.App.csproj') -c Release -r win-x64 --self-contained false -o $artifacts
$published = Join-Path $artifacts 'MotionVideoPipeline.exe'
if (-not (Test-Path -LiteralPath $published)) { throw "expected fixed executable missing: $published" }
Write-Output $published
