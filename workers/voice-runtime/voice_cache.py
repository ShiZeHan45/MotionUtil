from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class VoiceProfile:
    voiceId: str
    displayName: str
    language: str
    modelId: str
    pythonRuntimePath: str
    modelCachePath: str
    sampleText: str
    speed: float
    sampleRate: int


class TTSAdapter(Protocol):
    def warm(self, profile: VoiceProfile, destination: Path) -> int: ...


class FakeTTSAdapter:
    def warm(self, profile: VoiceProfile, destination: Path) -> int:
        destination.write_bytes((f"FAKE-WAV:{profile.voiceId}:{profile.sampleText}").encode("utf-8"))
        return 2400


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def cache_key(profile: VoiceProfile, runtime_version: str) -> str:
    raw = json.dumps({"profile": asdict(profile), "runtimeVersion": runtime_version}, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def atomic_replace(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    os.replace(source, target)


def preload(catalog_path: Path, cache_root: Path, adapter: TTSAdapter | None = None) -> dict:
    adapter = adapter or FakeTTSAdapter()
    cache_root.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    runtime_version = catalog["runtimeVersion"]
    manifest_path = cache_root / "VoiceCacheManifest.json"
    previous = {}
    if manifest_path.exists():
        try:
            previous = {item["voiceId"]: item for item in json.loads(manifest_path.read_text(encoding="utf-8")).get("profiles", [])}
        except (OSError, json.JSONDecodeError, KeyError):
            previous = {}
    profiles = []
    for raw in catalog["voices"]:
        profile = VoiceProfile(**raw)
        key = cache_key(profile, runtime_version)
        audio = cache_root / f"{profile.voiceId}-{key}.wav"
        status = "ready"
        frame_count = 0
        error = None
        try:
            cached = previous.get(profile.voiceId, {})
            cache_hit = audio.exists() and cached.get("cacheKey") == key and cached.get("status") == "ready" and cached.get("sha256") == sha256_file(audio)
            if not cache_hit:
                with tempfile.NamedTemporaryFile(dir=cache_root, prefix=".preview-", suffix=".tmp", delete=False) as tmp:
                    temp_path = Path(tmp.name)
                try:
                    frame_count = adapter.warm(profile, temp_path)
                    atomic_replace(temp_path, audio)
                finally:
                    temp_path.unlink(missing_ok=True)
            frame_count = frame_count or max(1, audio.stat().st_size)
            digest = sha256_file(audio)
        except Exception as exc:  # noqa: BLE001
            status, digest, error = "failed", "0" * 64, str(exc)
        profiles.append({"voiceId": profile.voiceId, "displayName": profile.displayName, "language": profile.language,
                         "modelCachePath": profile.modelCachePath, "previewAudioPath": str(audio), "cacheKey": key,
                         "sha256": digest, "sampleRate": profile.sampleRate, "frameCount": frame_count,
                         "status": status, "preparedAt": "1970-01-01T00:00:00Z", **({"error": error} if error else {})})
    manifest = {"manifestVersion": "1.0.0", "preloadPolicy": "eager-all-voices", "runtimeVersion": runtime_version,
                "generatedAt": "1970-01-01T00:00:00Z", "profiles": profiles}
    temporary = manifest_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    atomic_replace(temporary, manifest_path)
    return manifest


def preview(manifest_path: Path, voice_id: str) -> bytes:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    profile = next(item for item in manifest["profiles"] if item["voiceId"] == voice_id)
    if profile["status"] != "ready":
        raise RuntimeError(f"voice {voice_id} is not ready")
    return Path(profile["previewAudioPath"]).read_bytes()
