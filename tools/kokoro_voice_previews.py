"""Generate cached Kokoro preview WAVs for multiple voices in one model load."""

import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", value)


def main() -> None:
    if len(sys.argv) < 6:
        raise SystemExit("Usage: kokoro_voice_previews.py MODEL DEVICE SPEED OUTPUT_DIR VOICE...")

    model_id, device = sys.argv[1:3]
    speed = float(sys.argv[3])
    output_directory = Path(sys.argv[4]).resolve()
    voices = sys.argv[5:]
    output_directory.mkdir(parents=True, exist_ok=True)

    pipeline = KPipeline(lang_code="z", repo_id=model_id, device=device)
    text = "大家好，今天我们来听听这个音色的效果。"
    for voice in voices:
        audio_parts = [
            result.audio.detach().cpu().numpy().astype(np.float32, copy=False)
            for result in pipeline(text, voice=voice, speed=speed, split_pattern=None)
            if result.audio is not None
        ]
        if not audio_parts:
            raise RuntimeError(f"Kokoro returned no audio for voice {voice}")

        output_path = output_directory / f"{safe_filename(voice)}.wav"
        temporary_path = output_path.with_name(output_path.stem + ".partial.wav")
        sf.write(temporary_path, np.concatenate(audio_parts), 24_000, subtype="PCM_16")
        temporary_path.replace(output_path)
        print(f"KOKORO_PREVIEW_DONE:{voice}", flush=True)


if __name__ == "__main__":
    main()
