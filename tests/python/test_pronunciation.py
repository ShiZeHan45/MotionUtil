from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[2] / "workers" / "voice-runtime"))
from pronunciation import build_token, integer_to_zh, normalize_number  # noqa: E402


class PronunciationTests(unittest.TestCase):
    def test_integer_uses_chinese_units(self):
        self.assertEqual(integer_to_zh(12345), "一万两千三百四十五")
        self.assertEqual(integer_to_zh(10000), "一万")
        self.assertEqual(integer_to_zh(10001), "一万零一")
        self.assertEqual(integer_to_zh(120000000), "一亿两千万")

    def test_special_kinds_do_not_use_integer_grouping(self):
        self.assertEqual(normalize_number("1.25", "decimal"), "一点二五")
        self.assertEqual(normalize_number("80%", "percentage"), "百分之八十")
        self.assertEqual(normalize_number("1.2.3", "version"), "一 . 二 . 三")

    def test_unknown_english_is_blocked(self):
        self.assertEqual(build_token("Kokoro", "english-proper-name").status, "blocked")
        self.assertEqual(build_token("Kokoro", "english-proper-name", {"Kokoro": "可可萝"}).status, "verified")
