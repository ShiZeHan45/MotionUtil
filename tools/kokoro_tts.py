"""Generate all narration WAVs for one run with the local Kokoro model."""

import json
import os
import re
import sys
import traceback
from pathlib import Path


def main() -> None:
    request = json.load(sys.stdin)
    model_id = request["model"]
    voice = request["voice"]
    device = request["device"]
    speed = float(request["speed"])
    pause_ms = float(request["pauseMs"])
    sample_rate = int(request.get("sampleRate", 24_000))
    output_directory = Path(request["outputDirectory"]).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    print(f"Loading Kokoro model {model_id} on {device}...", file=sys.stderr, flush=True)
    en_pipeline = KPipeline(lang_code="a", repo_id=model_id, model=False)

    def english_phonemes(text: str) -> str:
        result = next(en_pipeline(text), None)
        return "" if result is None else result.phonemes

    pipeline = KPipeline(lang_code="z", repo_id=model_id, device=device, en_callable=english_phonemes)
    pause_samples = round(pause_ms * sample_rate / 1_000)
    results = []

    for project_index, script in enumerate(request["scripts"]):
        slug = re.sub(r"[^a-z0-9_.-]", "_", script["repo"].lower().replace("/", "__"))
        segments = script["narrationSegments"]
        rendered_segments = []
        for segment_index, segment in enumerate(segments):
            text = segment.get("spokenText", segment["text"])
            audio_parts = [
                result.audio.detach().cpu().numpy().astype(np.float32, copy=False)
                for result in pipeline(text, voice=voice, speed=speed, split_pattern=None)
                if result.audio is not None
            ]
            if not audio_parts:
                raise RuntimeError(f"Kokoro returned no audio for {script['repo']} / {segment['scene']}")
            audio = np.concatenate(audio_parts)
            if pause_samples and segment_index < len(segments) - 1:
                audio = np.concatenate((audio, np.zeros(pause_samples, dtype=np.float32)))

            filename = f"{slug}-{segment_index + 1:02d}-{segment['scene']}.wav"
            audio_path = (output_directory / filename).resolve()
            sf.write(audio_path, audio, sample_rate, subtype="PCM_16")
            duration_ms = round(len(audio) * 1_000 / sample_rate)
            rendered_segments.append({
                **segment,
                "audio": str(audio_path),
                "durationMs": duration_ms,
                "spokenText": text,
            })
            print(
                f"{script['repo']} {segment['scene']}: {duration_ms / 1_000:.1f}s",
                file=sys.stderr,
                flush=True,
            )

        results.append({**script, "narrationSegments": rendered_segments})
        print(f"Completed {project_index + 1}/{len(request['scripts'])}: {script['repo']}", file=sys.stderr, flush=True)

    print("KOKORO_RESULT:" + json.dumps({"projects": results}, ensure_ascii=False, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
