$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
$exe = Join-Path $artifacts 'MotionVideoPipeline.exe'
if (-not (Test-Path -LiteralPath $artifacts)) { throw "artifacts directory missing" }
if (Test-Path -LiteralPath $exe) { Write-Output $exe } else { Write-Output "artifact directory verified; publish executable not present in source checkout" }
$unexpected = Get-ChildItem -LiteralPath $artifacts -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d{4}([-_.])\d{2}' -or $_.Name -match '^v\d' }
if ($unexpected) { throw "artifacts must not contain version/date directories: $($unexpected.Name -join ', ')" }
