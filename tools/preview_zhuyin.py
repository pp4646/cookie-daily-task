# -*- coding: utf-8 -*-
"""檢查指定文字的注音標注結果（用與前端相同的演算法）。

用法：
    python tools/preview_zhuyin.py "整理書包" "上51英文課"
"""
import io
import os
import sys

SRC = io.open(
    os.path.join(os.path.dirname(__file__), "..", "js", "zhuyin-data.js"), encoding="utf-8"
).read()


def grab(name):
    start = SRC.index(name + " = ") + len(name) + 4
    end = SRC.index('";', start)
    return SRC[start:end].replace("\\n", "\n").replace('\\"', '"')


CHAR_MAP = dict(zip(grab("CHARS"), grab("CHAR_ZHUYIN").split("|")))
PHRASES = dict(l.split("\t") for l in grab("PHRASES").split("\n") if "\t" in l)
MAX_PHRASE = max(len(p) for p in PHRASES)


def is_han(ch):
    return 0x4E00 <= ord(ch) <= 0x9FFF


def annotate(text):
    out, i = [], 0
    while i < len(text):
        if not is_han(text[i]):
            out.append(text[i])
            i += 1
            continue
        hit = None
        for n in range(min(MAX_PHRASE, len(text) - i), 1, -1):
            seg = text[i:i + n]
            if seg in PHRASES:
                hit = (seg, PHRASES[seg].split(" "))
                break
        if hit:
            out.extend(f"{hit[0][k]}({hit[1][k]})" for k in range(len(hit[0])))
            i += len(hit[0])
        else:
            out.append(f"{text[i]}({CHAR_MAP.get(text[i], '???')})")
            i += 1
    return " ".join(out)


DEFAULT = [
    "上51英文課",
    "整理書包(文、聯、國、資、古、作)",
    "說出3件今天發生的好事",
    "閱讀一本書",
    "幫忙做家事",
    "說出今天控制住自己的一件事",
]

for t in (sys.argv[1:] or DEFAULT):
    print(f"{t}\n  {annotate(t)}\n")
