"""Download and verify the configured Kokoro Hugging Face model in HF_HOME."""

import sys

from huggingface_hub import snapshot_download


def main() -> None:
    model_id = sys.argv[1] if len(sys.argv) > 1 else "hexgrad/Kokoro-82M-v1.1-zh"
    mode = sys.argv[2] if len(sys.argv) > 2 else "download"
    local_only = mode == "check"
    snapshot = snapshot_download(repo_id=model_id, local_files_only=local_only)
    print(f"KOKORO_MODEL_READY:{snapshot}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if len(sys.argv) > 2 and sys.argv[2] == "check":
            print("KOKORO_MODEL_MISSING")
            sys.exit(2)
        raise
