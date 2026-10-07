$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$specs = Get-ChildItem -LiteralPath (Join-Path $root 'specs') -Filter '*.json'
foreach ($spec in $specs) {
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" -- $spec.FullName
  if ($LASTEXITCODE -ne 0) { throw "invalid JSON: $($spec.Name)" }
}
Write-Output "validated $($specs.Count) JSON specifications"
