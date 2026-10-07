$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$checks = [ordered]@{}
foreach ($name in @('dotnet','node','pnpm','py')) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  $checks[$name] = if ($command) { @{ available = $true; path = $command.Source } } else { @{ available = $false; path = $null } }
}
$model = Join-Path $env:USERPROFILE '.cache\huggingface\hub\models--hexgrad--Kokoro-82M-v1.1-zh'
$checks['kokoroModelCache'] = @{ available = Test-Path -LiteralPath $model; path = $model }
$checks['ffmpeg'] = @{ available = $null -ne (Get-Command ffmpeg -ErrorAction SilentlyContinue); path = $null }
$checks['newProjectDependencyPolicy'] = 'independent-manifest-no-copy'
$checks['status'] = if ($checks.dotnet.available -and $checks.node.available -and $checks.pnpm.available -and $checks.py.available) { 'ready-with-diagnostics' } else { 'blocked-missing-runtime' }
$output = Join-Path $root 'artifacts\environment-diagnostics.json'
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
$checks | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $output -Encoding UTF8
Write-Output (Get-Content -Raw -LiteralPath $output)
