# -*- coding: utf-8 -*-
"""開啟線上 App 並截圖，用來目視確認實際畫面。

用法：
    python tools/screenshot_live.py cookie-20181025
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "https://pp4646.github.io/cookie-daily-task/"
SHOTS = os.path.join(os.path.dirname(__file__), "..", ".screenshots")

code = sys.argv[1] if len(sys.argv) > 1 else "cookie-20181025"
os.makedirs(SHOTS, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 834, "height": 1112})
    page.goto(f"{BASE}#f={code}", wait_until="domcontentloaded")
    page.wait_for_selector("#app:not(.hidden)", timeout=30000)
    page.wait_for_timeout(3500)

    count = page.locator(".task").count()
    print(f"今日顯示 {count} 個任務：")
    for i in range(count):
        title = page.locator(".task").nth(i).locator(".task-title").inner_text()
        print("   ", title.replace("\n", ""))

    out = os.path.join(SHOTS, "live-today.png")
    page.screenshot(path=out)
    print(f"\n截圖：{os.path.normpath(out)}")
    browser.close()
