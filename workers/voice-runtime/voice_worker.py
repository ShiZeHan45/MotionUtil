from __future__ import annotations

import json
import sys
from pathlib import Path
from voice_cache import preload, preview, synthesize_beat, wav_metadata, sha256_file
from pronunciation import build_token


def emit(request_id: str, message_type: str, payload: object) -> None:
    sys.stdout.write(json.dumps({"requestId": request_id, "nodeId": "voice-runtime", "nodeVersion": "0.1.0", "type": message_type, "payload": payload}, ensure_ascii=True) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    if not line.strip():
        continue
    request = json.loads(line.lstrip("\ufeff"))
    request_id = request["requestId"]
    if request["type"] == "cancel":
        emit(request_id, "cancelled", {"checkpoint": "voice-preload"})
        continue
    try:
        payload = request.get("payload", {})
        operation = payload.get("operation", "preload_catalog")
        if operation == "preload_catalog":
            catalog = Path(payload["catalogPath"])
            cache_root = Path(payload["cacheRoot"])
            fixture_mode = bool(payload.get("fixtureMode", False))
            emit(request_id, "progress", {"value": 0.1, "message": "preloading voice catalog"})
            manifest = preload(catalog, cache_root, fixture_mode=fixture_mode)
            emit(request_id, "result", manifest)
        elif operation in {"preview", "synthesize_preview"}:
            data = preview(Path(payload["manifestPath"]), payload["voiceId"])
            emit(request_id, "result", {"voiceId": payload["voiceId"], "bytes": len(data), "source": "local-cache"})
        elif operation == "pronunciation_token":
            emit(request_id, "result", build_token(payload["source"], payload["kind"], payload.get("dictionary", {})).__dict__)
        elif operation == "synthesize_beat":
            result = synthesize_beat(
                Path(payload["catalogPath"]),
                Path(payload["manifestPath"]),
                payload["voiceId"],
                payload["pronunciationText"],
                Path(payload["outputPath"]),
                fixture_mode=bool(payload.get("fixtureMode", False)),
            )
            emit(request_id, "result", result)
        elif operation == "validate_cache":
            manifest_path = Path(payload["manifestPath"])
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            invalid = []
            for profile in manifest.get("profiles", []):
                path = Path(profile["previewAudioPath"])
                if (profile.get("status") != "ready" or not path.exists()
                        or wav_metadata(path)["frameCount"] != profile.get("frameCount")
                        or sha256_file(path) != profile.get("sha256")):
                    invalid.append(profile.get("voiceId"))
            emit(request_id, "result", {"valid": not invalid, "invalidVoiceIds": invalid, "manifestPath": str(manifest_path)})
        elif operation == "resume":
            emit(request_id, "result", {"resumed": True, "checkpoint": payload.get("checkpoint")})
        else:
            raise ValueError(f"unsupported voice operation: {operation}")
    except Exception as exc:  # noqa: BLE001
        print(f"[voice-runtime] {exc}", file=sys.stderr)
        emit(request_id, "error", {"message": str(exc)})
