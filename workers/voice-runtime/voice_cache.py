from __future__ import annotations

import hashlib
import json
import os
import tempfile
import sys
import wave
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
        # Deterministic silent PCM keeps fixture mode compatible with real WAV validation.
        frame_count = max(2400, len(profile.sampleText) * 240)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(destination), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(profile.sampleRate)
            output.writeframes(b"\x00\x00" * frame_count)
        return frame_count


def wav_metadata(path: Path) -> dict:
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        frame_count = source.getnframes()
    return {"sampleRate": sample_rate, "channels": channels, "bitsPerSample": sample_width * 8,
            "frameCount": frame_count, "durationMs": round(frame_count * 1000 / sample_rate)}


class RealKokoroAdapter:
    _pipelines: dict[tuple[str, str], object] = {}

    def _pipeline(self, profile: VoiceProfile):
        import os
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        self._add_runtime_paths(profile.pythonRuntimePath)
        key = (profile.modelCachePath or profile.modelId, profile.language)
        if key not in self._pipelines:
            try:
                from kokoro import KPipeline
            except ImportError as exc:
                raise RuntimeError("Kokoro 未安装在当前新项目 Python Runtime 中") from exc
            lang_code = "z" if profile.language.startswith("zh") else "a"
            repo = profile.modelCachePath or profile.modelId
            self._pipelines[key] = KPipeline(lang_code=lang_code, repo_id=repo)
        return self._pipelines[key]

    @staticmethod
    def _add_runtime_paths(runtime_path: str) -> None:
        """Allow the catalog to point at an installed Runtime without copying its environment."""
        if not runtime_path:
            return
        candidate = Path(os.path.expandvars(runtime_path)).expanduser()
        paths = [candidate]
        if candidate.is_file():
            paths.extend([candidate.parent, candidate.parent / "Lib" / "site-packages"])
        elif candidate.is_dir():
            paths.append(candidate / "Lib" / "site-packages")
        for path in paths:
            value = str(path)
            if path.exists() and value not in sys.path:
                sys.path.insert(0, value)

    def warm(self, profile: VoiceProfile, destination: Path) -> int:
        import numpy as np
        import soundfile as sf
        pipeline = self._pipeline(profile)
        chunks = [audio for _, _, audio in pipeline(profile.sampleText, voice=profile.voiceId, speed=profile.speed)]
        if not chunks:
            raise RuntimeError(f"Kokoro 未为音色 {profile.voiceId} 生成试听音频")
        audio = np.concatenate(chunks)
        sf.write(destination, audio, profile.sampleRate, format="WAV")
        return int(len(audio))


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


def _resolve_profile(raw: dict) -> VoiceProfile:
    values = dict(raw)
    values["pythonRuntimePath"] = os.path.expandvars(values.get("pythonRuntimePath") or os.environ.get("MVP_KOKORO_PYTHON_RUNTIME", ""))
    values["modelCachePath"] = os.path.expandvars(values.get("modelCachePath") or os.environ.get("MVP_KOKORO_MODEL_CACHE", ""))
    return VoiceProfile(**values)


def preload(catalog_path: Path, cache_root: Path, adapter: TTSAdapter | None = None, fixture_mode: bool = False) -> dict:
    adapter = adapter or (FakeTTSAdapter() if fixture_mode else RealKokoroAdapter())
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
        profile = _resolve_profile(raw)
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
            frame_count = frame_count or wav_metadata(audio)["frameCount"]
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


def synthesize_beat(catalog_path: Path, manifest_path: Path, voice_id: str, text: str, output_path: Path, fixture_mode: bool = False) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    profiles = manifest.get("profiles", [])
    if not profiles or any(item.get("status") != "ready" for item in profiles):
        raise RuntimeError("所有配置音色必须预缓存 ready 后才能开始配音")
    if not any(item.get("voiceId") == voice_id for item in profiles):
        raise RuntimeError(f"音色 {voice_id} 不在已预热清单中")
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    raw = next((voice for voice in catalog["voices"] if voice["voiceId"] == voice_id), None)
    if raw is None:
        raise KeyError(f"voice not found: {voice_id}")
    profile = _resolve_profile(raw)
    adapter = FakeTTSAdapter() if fixture_mode else RealKokoroAdapter()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output_path.parent, prefix=".beat-", suffix=".wav", delete=False) as tmp:
        temporary = Path(tmp.name)
    try:
        # Keep caller text while reusing the profile's warmed pipeline and audio format.
        render_profile = VoiceProfile(**{**asdict(profile), "sampleText": text})
        frame_count = adapter.warm(render_profile, temporary)
        atomic_replace(temporary, output_path)
    finally:
        temporary.unlink(missing_ok=True)
    digest = sha256_file(output_path)
    metadata = wav_metadata(output_path)
    return {"audioPath": str(output_path), "sampleRate": metadata["sampleRate"], "frameCount": metadata["frameCount"],
            "durationMs": metadata["durationMs"], "sha256": digest, "engine": "kokoro"}
