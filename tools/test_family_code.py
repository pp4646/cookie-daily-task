# -*- coding: utf-8 -*-
"""驗證家庭代碼會被記住（v1.2.0 的修正）。

測試情境：
  1. 第一次開啟 -> 輸入代碼
  2. 重新整理   -> 不應該再問代碼
  3. 清掉 localStorage 但保留網址 -> 靠網址的 #f= 還原（模擬 iOS 清儲存空間）
  4. 用邀請連結全新開啟 -> 完全不問代碼
  5. 更換家庭代碼 -> 切換到另一份資料

用法：
    python -m http.server 8765 --bind 127.0.0.1
    python tools/test_family_code.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8765")
CODE = "codetest-" + os.urandom(4).hex()
CODE2 = "codetest2-" + os.urandom(4).hex()

problems = []


def ok(msg):
    print(f"  \u2713 {msg}")


def wait_ready(page):
    page.wait_for_selector("#app:not(.hidden)", timeout=25000)
    page.wait_for_selector(".task", timeout=25000)


def asks_for_code(page):
    """回傳 True 表示畫面停在『輸入家庭代碼』"""
    try:
        page.wait_for_selector("#setup:not(.hidden)", timeout=4000)
        return True
    except Exception:
        return False


def unlock_parent(page):
    page.click('.tabbar-btn[data-view="parent"]')
    page.wait_for_selector("#pin-gate:not(.hidden)", timeout=8000)
    for d in "1234":
        page.click(f'#pin-pad button[data-k="{d}"]')
    page.wait_for_selector("#parent-body:not(.hidden)", timeout=8000)
    page.click('.tab[data-tab="settings"]')
    page.wait_for_selector("#info-code", timeout=8000)


def main():
    print(f"測試代碼：{CODE}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 834, "height": 1112})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

        # --- 1. 第一次開啟 ---
        page.goto(BASE, wait_until="domcontentloaded")
        if not asks_for_code(page):
            problems.append("第一次開啟沒有詢問家庭代碼")
        page.fill("#setup-code", CODE)
        page.click("#setup-go")
        wait_ready(page)
        ok("第一次開啟：輸入代碼後正常進入")

        if f"f={CODE}" not in page.evaluate("location.hash"):
            problems.append(f"代碼沒有寫進網址（hash={page.evaluate('location.hash')}）")
        else:
            ok(f"代碼已寫進網址：{page.evaluate('location.hash')}")

        stored = page.evaluate("localStorage.getItem('cookie.familyCode')")
        if stored != CODE:
            problems.append(f"localStorage 沒存到代碼（實際={stored}）")
        else:
            ok("代碼已存進 localStorage")

        # --- 2. 重新整理 ---
        page.reload(wait_until="domcontentloaded")
        if asks_for_code(page):
            problems.append("重新整理後又要求輸入代碼 ← 這就是原本的 bug")
        else:
            wait_ready(page)
            ok("重新整理：沒有再問代碼")

        # --- 3. 模擬 iOS 清掉 localStorage，但主畫面圖示保留網址 ---
        url_with_hash = page.url
        page.evaluate("localStorage.clear()")
        page.goto(url_with_hash, wait_until="domcontentloaded")
        if asks_for_code(page):
            problems.append("localStorage 被清掉後，網址的 #f= 沒有還原代碼")
        else:
            wait_ready(page)
            ok("localStorage 被清空：仍能從網址還原代碼（iOS 情境）")

        # --- 4. 邀請連結：全新瀏覽器狀態 ---
        ctx2 = browser.new_context(viewport={"width": 390, "height": 844})
        page2 = ctx2.new_page()
        page2.goto(f"{BASE}#f={CODE}", wait_until="domcontentloaded")
        if asks_for_code(page2):
            problems.append("用邀請連結開啟時仍要求輸入代碼")
        else:
            wait_ready(page2)
            ok("邀請連結：全新裝置開啟完全不用輸入代碼")

        unlock_parent(page2)
        shown = page2.inner_text("#info-code")
        if shown != CODE:
            problems.append(f"設定頁顯示的代碼不對（{shown} != {CODE}）")
        else:
            ok(f"設定頁顯示正確代碼：{shown}")

        # --- 5. 更換家庭代碼 ---
        page2.click("#btn-change-code")
        page2.wait_for_selector("#modal:not(.hidden)", timeout=8000)
        page2.fill("#f-code", CODE2)
        page2.click("#modal-ok")
        wait_ready(page2)
        unlock_parent(page2)
        shown2 = page2.inner_text("#info-code")
        if shown2 != CODE2:
            problems.append(f"更換代碼失敗（顯示 {shown2}，應為 {CODE2}）")
        else:
            ok(f"更換家庭代碼成功：{CODE} → {CODE2}")

        for e in dict.fromkeys(errors):
            if "favicon" in e.lower():
                continue
            problems.append(f"console 錯誤：{e[:250]}")

        browser.close()

    print()
    if problems:
        print(f"問題 {len(problems)} 筆：")
        for pb in problems:
            print("  ✗", pb)
        print("\n失敗 ❌")
        return 1
    print("家庭代碼記憶功能全部正常 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
