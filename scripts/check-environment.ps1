$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$checks = [ordered]@{}
foreach ($name in @('dotnet','node','pnpm','py')) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  $checks[$name] = if ($command) { @{ available = $true; path = $command.Source } } else { @{ available = $false; path = $null } }
}
$model = Join-Path $env:USERPROFILE '.cache\huggingface\hub\models--hexgrad--Kokoro-82M-v1.1-zh'
$checks['kokoroModelCache'] = @{ available = Test-Path -LiteralPath $model; path = $model }
$configuredFfmpeg = if ($env:MVP_FFMPEG_PATH) { $env:MVP_FFMPEG_PATH } else { $null }
$remotionFfmpeg = Get-ChildItem -LiteralPath (Join-Path $root 'node_modules\.pnpm') -Filter 'ffmpeg.exe' -File -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match 'compositor-win32-x64-msvc' } | Select-Object -First 1
$pathCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
$pathFfmpeg = if ($pathCommand) { $pathCommand.Source } else { $null }
$ffmpegPath = if ($configuredFfmpeg -and (Test-Path -LiteralPath $configuredFfmpeg)) { (Resolve-Path -LiteralPath $configuredFfmpeg).Path }
  elseif ($remotionFfmpeg) { $remotionFfmpeg.FullName }
  else { $pathFfmpeg }
$checks['ffmpeg'] = @{ available = -not [string]::IsNullOrWhiteSpace($ffmpegPath); path = $ffmpegPath; source = if ($configuredFfmpeg -and $ffmpegPath -eq $configuredFfmpeg) { 'MVP_FFMPEG_PATH' } elseif ($remotionFfmpeg -and $ffmpegPath -eq $remotionFfmpeg.FullName) { 'project-remotion-runtime' } else { 'PATH' } }
$checks['newProjectDependencyPolicy'] = 'independent-manifest-no-copy'
$checks['status'] = if ($checks.dotnet.available -and $checks.node.available -and $checks.pnpm.available -and $checks.py.available) { 'ready-with-diagnostics' } else { 'blocked-missing-runtime' }
$output = Join-Path $root 'artifacts\environment-diagnostics.json'
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
$checks | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $output -Encoding UTF8
Write-Output (Get-Content -Raw -LiteralPath $output)
