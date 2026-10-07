import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[2] / "workers" / "voice-runtime"))
from voice_cache import FakeTTSAdapter, cache_key, preload, preview  # noqa: E402


class VoiceCacheTests(unittest.TestCase):
    def test_preload_and_cached_preview(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as root:
            tmp_path = Path(root)
            catalog = tmp_path / "voice-catalog.json"
            catalog.write_text(json.dumps({"runtimeVersion": "test", "voices": [{"voiceId": "v1", "displayName": "V1", "language": "zh-CN", "modelId": "m", "pythonRuntimePath": "", "modelCachePath": "", "sampleText": "测试", "speed": 1.0, "sampleRate": 24000}]}), encoding="utf-8")
            manifest = preload(catalog, tmp_path / "cache", FakeTTSAdapter())
            self.assertEqual(manifest["profiles"][0]["status"], "ready")
            self.assertTrue(preview(tmp_path / "cache" / "VoiceCacheManifest.json", "v1").startswith(b"FAKE-WAV"))

    def test_cache_key_changes_with_speed(self):
        from voice_cache import VoiceProfile
        base = VoiceProfile("v", "V", "zh-CN", "m", "", "", "x", 1.0, 24000)
        changed = VoiceProfile("v", "V", "zh-CN", "m", "", "", "x", 1.1, 24000)
        self.assertNotEqual(cache_key(base, "r"), cache_key(changed, "r"))
