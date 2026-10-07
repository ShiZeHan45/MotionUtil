$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$contentRequest = '{"requestId":"smoke-content","nodeId":"content-runtime","nodeVersion":"0.1.0","type":"request","payload":{"projectId":"m0"}}'
$contentOutput = ($contentRequest | node --experimental-strip-types (Join-Path $root 'workers/content-runtime/src/content-worker.ts')) -join "`n"
if ($contentOutput -notmatch '"type"\s*:\s*"result"') { throw 'content worker did not return result' }
$voiceRequest = '{"requestId":"smoke-voice","nodeId":"voice-runtime","nodeVersion":"0.1.0","type":"request","payload":{"catalogPath":"' + (Join-Path $root 'voice-catalog.json').Replace('\','\\') + '","cacheRoot":"' + (Join-Path $root 'artifacts/voice-cache').Replace('\','\\') + '"}}'
$voiceOutput = ($voiceRequest | py -3.12 (Join-Path $root 'workers/voice-runtime/voice_worker.py')) -join "`n"
if ($voiceOutput -notmatch '"status"\s*:\s*"ready"') { throw 'voice worker did not return ready manifest' }
Write-Output 'worker smoke passed'
