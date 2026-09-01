# -*- coding: utf-8 -*-
"""快速檢查產生出來的注音字典是否正確。"""
import io
import os

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "js", "zhuyin-data.js")

src = io.open(DATA, encoding="utf-8").read()


def grab(name):
    start = src.index(name + " = ") + len(name) + 4
    end = src.index('";', start)
    return src[start:end].replace("\\n", "\n").replace('\\"', '"')


chars = grab("CHARS")
char_z = grab("CHAR_ZHUYIN").split("|")
char_map = dict(zip(chars, char_z))
phrases = dict(l.split("\t") for l in grab("PHRASES").split("\n") if "\t" in l)

print(f"單字 {len(char_map)}，詞彙 {len(phrases)}\n")

MAX_PHRASE = max(len(p) for p in phrases)


def annotate(text):
    """與 js/zhuyin.js 相同的演算法：最長詞優先，其次逐字。"""
    out, i = [], 0
    while i < len(text):
        hit = None
        for n in range(min(MAX_PHRASE, len(text) - i), 1, -1):
            seg = text[i:i + n]
            if seg in phrases:
                hit = (seg, phrases[seg].split(" "))
                break
        if hit:
            out.extend(hit[1])
            i += len(hit[0])
        else:
            out.append(char_map.get(text[i], ""))
            i += 1
    return " ".join(out)


print("-- 端對端 --")
for t in ["家長", "長大", "很長", "長度", "教室", "教書", "行為", "銀行",
          "為什麼", "還有", "還錢", "倒垃圾", "彈鋼琴", "音樂", "快樂",
          "刷牙洗臉", "整理書包", "閱讀三十分鐘", "自己收玩具", "幫忙倒垃圾",
          "練習彈鋼琴十分鐘", "睡前刷牙", "今天的挑戰", "得到五點"]:
    print(f"  {t:<10} {annotate(t)}")
