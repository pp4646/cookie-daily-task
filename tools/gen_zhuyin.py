# -*- coding: utf-8 -*-
"""產生注音字典 js/zhuyin-data.js

用法（只有在需要重新產生字典時才跑）：
    pip install pypinyin opencc-python-reimplemented
    python tools/gen_zhuyin.py

pypinyin 的詞庫是簡體且使用中國大陸讀音，所以這裡做兩件事：
  1. 用 OpenCC 把詞條轉成繁體，才能對應台灣用字。
  2. 套用下方的台灣教育部讀音修正表。
"""
import os
import sys

import opencc
from pypinyin import Style, pinyin
from pypinyin.constants import PHRASES_DICT, PINYIN_DICT

OUT = os.path.join(os.path.dirname(__file__), "..", "js", "zhuyin-data.js")

# ---------------------------------------------------------------------------
# 台灣讀音修正：這些字在台灣只有一種讀音，可以全域覆蓋
# ---------------------------------------------------------------------------
TW_CHAR = {
    "期": "ㄑㄧˊ", "企": "ㄑㄧˋ", "液": "ㄧˋ", "攜": "ㄒㄧ", "熟": "ㄕㄡˊ",
    "誰": "ㄕㄟˊ", "微": "ㄨㄟˊ", "危": "ㄨㄟˊ", "惜": "ㄒㄧˊ", "息": "ㄒㄧˊ",
    "昔": "ㄒㄧˊ", "悉": "ㄒㄧˊ", "夕": "ㄒㄧˋ", "質": "ㄓˊ", "亞": "ㄧㄚˇ",
    "究": "ㄐㄧㄡˋ", "娃": "ㄨㄚˊ", "帆": "ㄈㄢˊ", "癌": "ㄞˊ", "括": "ㄍㄨㄚˋ",
    "誼": "ㄧˋ", "擁": "ㄩㄥ", "蝸": "ㄍㄨㄚ", "檔": "ㄉㄤˇ", "髮": "ㄈㄚˇ",
    "垃": "ㄌㄜˋ", "圾": "ㄙㄜˋ", "鵝": "ㄜˊ", "蔽": "ㄅㄧˋ", "喉": "ㄏㄡˊ",
    "諜": "ㄉㄧㄝˊ", "縫": "ㄈㄥˊ", "頸": "ㄐㄧㄥˇ", "曾": "ㄘㄥˊ",
}

# 詞彙層級的台灣讀音修正
TW_PHRASE = {
    "垃圾": "ㄌㄜˋ ㄙㄜˋ",
    "角色": "ㄐㄩㄝˊ ㄙㄜˋ",
    "番茄": "ㄈㄢ ㄑㄧㄝˊ",
    "蕃茄": "ㄈㄢ ㄑㄧㄝˊ",
    "牛仔": "ㄋㄧㄡˊ ㄗㄞˇ",
    "牛仔褲": "ㄋㄧㄡˊ ㄗㄞˇ ㄎㄨˋ",
    "尷尬": "ㄍㄢ ㄍㄚˋ",
    "流血": "ㄌㄧㄡˊ ㄒㄧㄝˇ",
    "血液": "ㄒㄧㄝˇ ㄧˋ",
    "捐血": "ㄐㄩㄢ ㄒㄧㄝˇ",
    "曝光": "ㄆㄨˋ ㄍㄨㄤ",
    "頭髮": "ㄊㄡˊ ㄈㄚˇ",
    "法國": "ㄈㄚˇ ㄍㄨㄛˊ",
    "星期": "ㄒㄧㄥ ㄑㄧˊ",
    "企鵝": "ㄑㄧˋ ㄜˊ",
    "蝸牛": "ㄍㄨㄚ ㄋㄧㄡˊ",
    "曾經": "ㄘㄥˊ ㄐㄧㄥ",
    "認識": "ㄖㄣˋ ㄕˋ",
    "彈鋼琴": "ㄉㄢˋ ㄍㄤ ㄑㄧㄣˊ",
    "刷牙": "ㄕㄨㄚ ㄧㄚˊ",
    "洗澡": "ㄒㄧˇ ㄗㄠˇ",
    "功課": "ㄍㄨㄥ ㄎㄜˋ",
    "作業": "ㄗㄨㄛˋ ㄧㄝˋ",
    "整理": "ㄓㄥˇ ㄌㄧˇ",
    "書包": "ㄕㄨ ㄅㄠ",
    "閱讀": "ㄩㄝˋ ㄉㄨˊ",
    "運動": "ㄩㄣˋ ㄉㄨㄥˋ",
    "家事": "ㄐㄧㄚ ㄕˋ",
    "點數": "ㄉㄧㄢˇ ㄕㄨˋ",
    "獎品": "ㄐㄧㄤˇ ㄆㄧㄣˇ",
    "兌換": "ㄉㄨㄟˋ ㄏㄨㄢˋ",
    "挑戰": "ㄊㄧㄠˇ ㄓㄢˋ",
    "任務": "ㄖㄣˋ ㄨˋ",
    "完成": "ㄨㄢˊ ㄔㄥˊ",
    "連續": "ㄌㄧㄢˊ ㄒㄩˋ",
}


def is_cjk(ch: str) -> bool:
    return 0x4E00 <= ord(ch) <= 0x9FFF


def bopomofo(text: str):
    return [x[0] for x in pinyin(text, style=Style.BOPOMOFO)]


def main() -> int:
    # ---- 單字表 ----
    chars = []
    readings = []
    for cp in sorted(PINYIN_DICT):
        ch = chr(cp)
        if not is_cjk(ch):
            continue
        z = TW_CHAR.get(ch) or bopomofo(ch)[0]
        if not z or z == ch:
            continue
        chars.append(ch)
        readings.append(z)
    char_default = dict(zip(chars, readings))
    print(f"單字 {len(chars)} 個")

    # ---- 詞彙表：轉繁體，只保留與「逐字預設讀音」不同的詞 ----
    s2t = opencc.OpenCC("s2t")
    phrases = {}
    skipped = 0
    for p in PHRASES_DICT:
        if len(p) < 2 or not all(is_cjk(c) for c in p):
            continue
        r = bopomofo(p)
        if len(r) != len(p):
            continue

        trad = s2t.convert(p)
        # 轉換後字數必須一致，否則無法逐字對應注音
        if len(trad) != len(p) or not all(is_cjk(c) for c in trad):
            skipped += 1
            continue

        r = [TW_CHAR.get(c) or r[i] for i, c in enumerate(trad)]
        if all(char_default.get(c) == r[i] for i, c in enumerate(trad)):
            continue  # 逐字預設讀音就對了，不需要收錄
        phrases.setdefault(trad, " ".join(r))

    before = len(phrases)
    phrases.update(TW_PHRASE)
    print(f"詞彙 {before} 個（+{len(phrases) - before} 個台灣修正，略過 {skipped} 個無法對應的）")

    # ---- 輸出 ----
    lines = "\n".join(f"{k}\t{v}" for k, v in sorted(phrases.items()))
    body = (
        "// 自動產生，請勿手動編輯。重新產生：python tools/gen_zhuyin.py\n"
        f"export const CHARS = {js_str(''.join(chars))};\n"
        f"export const CHAR_ZHUYIN = {js_str('|'.join(readings))};\n"
        f"export const PHRASES = {js_str(lines)};\n"
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print(f"已寫入 {os.path.normpath(OUT)}  ({len(body) / 1024:.0f} KB)")
    return 0


def js_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


if __name__ == "__main__":
    sys.exit(main())
