$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$contentRequest = '{"requestId":"smoke-content","nodeId":"content-runtime","nodeVersion":"0.1.0","type":"request","payload":{"projectId":"m0"}}'
$contentOutput = ($contentRequest | node --experimental-strip-types (Join-Path $root 'workers/content-runtime/src/content-worker.ts')) -join "`n"
if ($contentOutput -notmatch '"type"\s*:\s*"result"') { throw 'content worker did not return result' }
$voiceRequest = '{"requestId":"smoke-voice","nodeId":"voice-runtime","nodeVersion":"0.1.0","type":"request","payload":{"operation":"preload_catalog","fixtureMode":true,"catalogPath":"' + (Join-Path $root 'voice-catalog.json').Replace('\','\\') + '","cacheRoot":"' + (Join-Path $root 'artifacts/voice-cache').Replace('\','\\') + '"}}'
$voiceOutput = ($voiceRequest | py -3.12 (Join-Path $root 'workers/voice-runtime/voice_worker.py')) -join "`n"
$voiceJson = $voiceOutput -split "`n" | Where-Object { $_.TrimStart().StartsWith('{') } | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.type -eq 'result' } | Select-Object -Last 1
$profiles = @($voiceJson.payload.profiles)
if ($null -eq $voiceJson -or $profiles.Count -eq 0 -or @($profiles | Where-Object { $_.status -ne 'ready' }).Count -gt 0) { throw 'voice worker did not return a ready manifest for every configured voice' }
Write-Output 'worker smoke passed'
