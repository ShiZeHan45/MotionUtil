from __future__ import annotations

from dataclasses import dataclass
import re

_DIGITS = "零一二三四五六七八九"
_UNITS = ((10**8, "亿"), (10**4, "万"), (10**3, "千"), (10**2, "百"), (10, "十"))


def _under_10000(value: int) -> str:
    if value == 0:
        return "零"
    result = ""
    zero_pending = False
    places = ((1000, "千"), (100, "百"), (10, "十"), (1, ""))
    for divisor, unit in places:
        digit, value = divmod(value, divisor)
        if digit:
            if zero_pending and result:
                result += "零"
            numeral = "两" if digit == 2 and unit in {"千", "百"} else _DIGITS[digit]
            if not (unit == "十" and digit == 1 and not result):
                result += numeral
            result += unit
            zero_pending = False
        elif result and value:
            zero_pending = True
    return result


def integer_to_zh(value: int) -> str:
    if value < 0:
        return "负" + integer_to_zh(-value)
    if value == 0:
        return "零"
    groups: list[tuple[int, str]] = []
    remainder = value
    for divisor, unit in ((10**8, "亿"), (10**4, "万"), (1, "")):
        group, remainder = divmod(remainder, divisor)
        groups.append((group, unit))
    output = ""
    previous_index = -1
    for index, (group, unit) in enumerate(groups):
        if group == 0:
            continue
        if output and (index - previous_index > 1 or group < 1000):
            output += "零"
        numeral = _under_10000(group)
        if group == 2 and unit in {"万", "亿"}:
            numeral = "两"
        output += numeral + unit
        previous_index = index
    return output


def normalize_number(value: str, kind: str = "integer") -> str:
    if kind == "integer":
        return integer_to_zh(int(value.replace(",", "")))
    if kind == "percentage":
        raw = value.rstrip("%")
        return "百分之" + normalize_number(raw, "decimal" if "." in raw else "integer")
    if kind == "decimal":
        integer, _, fraction = value.partition(".")
        return integer_to_zh(int(integer)) + "点" + "".join(_DIGITS[int(char)] for char in fraction)
    if kind in {"version", "code", "date", "url"}:
        return " ".join(_DIGITS[int(char)] if char.isdigit() else char for char in value)
    raise ValueError(f"unsupported pronunciation kind: {kind}")


@dataclass(frozen=True)
class PronunciationToken:
    source: str
    displayText: str
    pronunciationText: str
    kind: str
    status: str
    dictionaryRef: str | None = None


def build_token(source: str, kind: str, dictionary: dict[str, str] | None = None) -> PronunciationToken:
    dictionary = dictionary or {}
    if kind in {"english-proper-name", "acronym", "url"}:
        spoken = dictionary.get(source)
        if not spoken:
            return PronunciationToken(source, source, source, kind, "blocked")
        return PronunciationToken(source, source, spoken, kind, "verified", f"dictionary:{source}")
    return PronunciationToken(source, source, normalize_number(source, kind) if kind != "plain" else source, kind, "verified")
