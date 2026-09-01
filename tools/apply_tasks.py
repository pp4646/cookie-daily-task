# -*- coding: utf-8 -*-
"""把 js/store.js 裡的 COOKIE_TASKS 寫進線上的家庭資料。

預設是唯讀的預覽模式，加上 --apply 才會真的寫入。

用法：
    python tools/apply_tasks.py --code cookie-20181025            # 只看現況
    python tools/apply_tasks.py --code cookie-20181025 --apply    # 實際寫入
"""
import argparse
import json
import sys

from playwright.sync_api import sync_playwright

DEFAULT_BASE = "https://pp4646.github.io/cookie-daily-task/"

# 在瀏覽器裡執行：直接用 App 已經初始化好的 store 模組讀寫，
# 不透過 UI 點擊，比較穩定。
READ_JS = """
async () => {
  const { store } = await import('./js/store.js');
  const cfg = await new Promise((resolve) => {
    let off = null;
    off = store.onConfig((c) => { if (off) off(); resolve(c); });
  });
  return { familyCode: store.familyCode, mode: store.mode, config: cfg };
}
"""

WRITE_JS = """
async (tasks) => {
  const { store, rid } = await import('./js/store.js');
  const cfg = await new Promise((resolve) => {
    let off = null;
    off = store.onConfig((c) => { if (off) off(); resolve(c); });
  });
  const kidId = cfg.kids[0].id;
  cfg.templates = tasks.map((t) => ({
    id: rid(),
    kidId,
    title: t.title,
    emoji: t.emoji,
    points: t.points,
    zhuyin: '',
    weekdays: t.weekdays,
    active: true,
  }));
  await store.saveConfig(cfg);
  return cfg.templates.length;
}
"""

WEEK = "日一二三四五六"


def describe(templates):
    for t in templates:
        days = "每天" if len(t.get("weekdays", [])) == 7 else "、".join(
            WEEK[d] for d in t.get("weekdays", [])
        )
        print(f"    {t.get('emoji', '?')} {t['title']}")
        print(f"       {days} · {t['points']} 點")


def load_tasks():
    """從 js/store.js 解析 COOKIE_TASKS，避免兩邊各寫一份容易不同步。"""
    import os
    import re

    path = os.path.join(os.path.dirname(__file__), "..", "js", "store.js")
    src = open(path, encoding="utf-8").read()
    block = src[src.index("export const COOKIE_TASKS"):]
    block = block[block.index("["):block.index("];") + 1]
    block = block.replace("EVERYDAY", "[0,1,2,3,4,5,6]")
    # 轉成合法 JSON
    block = re.sub(r"(\w+):", r'"\1":', block)
    block = block.replace("'", '"')
    block = re.sub(r",\s*([\]}])", r"\1", block)
    return json.loads(block)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", required=True, help="家庭代碼")
    ap.add_argument("--base", default=DEFAULT_BASE, help="App 網址")
    ap.add_argument("--apply", action="store_true", help="實際寫入（預設只預覽）")
    args = ap.parse_args()

    tasks = load_tasks()
    print(f"要寫入的任務（{len(tasks)} 個）：")
    describe(tasks)

    url = f"{args.base}#f={args.code}"
    print(f"\n連線到 {url}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector("#app:not(.hidden)", timeout=30000)
        page.wait_for_selector(".task, #today-empty:not(.hidden)", timeout=30000)

        state = page.evaluate(READ_JS)
        print(f"目前狀態：模式={state['mode']}｜代碼={state['familyCode']}")
        current = state["config"]["templates"]
        print(f"\n現有的每日任務（{len(current)} 個）：")
        describe(current)

        if not args.apply:
            print("\n--- 預覽模式，沒有寫入任何東西 ---")
            print("確認無誤後加上 --apply 才會實際覆蓋。")
            browser.close()
            return 0

        count = page.evaluate(WRITE_JS, tasks)
        page.wait_for_timeout(2500)  # 等 Firestore 寫入完成

        after = page.evaluate(READ_JS)["config"]["templates"]
        print(f"\n已寫入 {count} 個任務。重新讀取確認：")
        describe(after)

        # 回到今日頁，確認畫面真的長出來了
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#app:not(.hidden)", timeout=30000)
        page.wait_for_timeout(2000)
        shown = page.locator(".task-title").all_inner_texts()
        print(f"\n今天（星期{WEEK[__import__('datetime').date.today().isoweekday() % 7]}）"
              f"實際顯示 {len(shown)} 個任務")

        browser.close()

    if errors:
        print("\n頁面錯誤：")
        for e in dict.fromkeys(errors):
            print("  ✗", e[:200])
        return 1

    print("\n完成 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
