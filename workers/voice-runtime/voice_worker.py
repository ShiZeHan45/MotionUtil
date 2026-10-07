from __future__ import annotations

import json
import sys
from pathlib import Path
from voice_cache import preload


def emit(request_id: str, message_type: str, payload: object) -> None:
    sys.stdout.write(json.dumps({"requestId": request_id, "nodeId": "voice-runtime", "nodeVersion": "0.1.0", "type": message_type, "payload": payload}, ensure_ascii=False) + "\n")
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
        catalog = Path(payload["catalogPath"])
        cache_root = Path(payload["cacheRoot"])
        emit(request_id, "progress", {"value": 0.1, "message": "preloading voice catalog"})
        manifest = preload(catalog, cache_root)
        emit(request_id, "result", manifest)
    except Exception as exc:  # noqa: BLE001
        print(f"[voice-runtime] {exc}", file=sys.stderr)
        emit(request_id, "error", {"message": str(exc)})
