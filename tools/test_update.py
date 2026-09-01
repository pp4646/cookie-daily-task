# -*- coding: utf-8 -*-
"""驗證「有新版本」提示與一鍵更新（端對端）。

不用假造網路回應，而是真的去改磁碟上的 js/version.js，
完整重現「我推了新版上去，但使用者手上還是舊版快取」的情境：

  1. 開啟 App -> Service Worker 把 1.3.0 的檔案快取起來
  2. 把磁碟上的 version.js 改成 99.0.0（模擬部署新版）
  3. 重新開啟 -> 執行中的仍是快取的舊版，但版本檢查會拿到 99.0.0 -> 應跳出提示
  4. 點下提示 -> 清快取、重新載入 -> 這次真的變成新版，提示不該再出現

不論成功失敗，最後都會把 version.js 還原。

用法：
    python -m http.server 8765 --bind 127.0.0.1
    python tools/test_update.py
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8765")
VERSION_FILE = os.path.join(os.path.dirname(__file__), "..", "js", "version.js")
SHOTS = os.path.join(os.path.dirname(__file__), "..", ".screenshots")
FAMILY = "updtest-" + os.urandom(4).hex()
NEWER = "99.0.0"

problems = []


def ok(msg):
    print(f"  \u2713 {msg}")


def read_version():
    src = open(VERSION_FILE, encoding="utf-8").read()
    return re.search(r"VERSION\s*=\s*'([^']+)'", src).group(1)


def open_app(page):
    page.goto(f"{BASE}#f={FAMILY}", wait_until="domcontentloaded")
    _wait_ready(page)


def reopen_app(page):
    """重新啟動 App。

    不能用 goto 同一個網址：hash 沒變的話瀏覽器會當成同頁導覽，
    頁面不會重新載入，開機流程也就不會再跑一次。
    """
    page.reload(wait_until="domcontentloaded")
    _wait_ready(page)


def _wait_ready(page):
    page.wait_for_selector("#app:not(.hidden)", timeout=25000)
    page.wait_for_selector(".task", timeout=25000)


def run(page):
    # --- 1. 第一次開啟，版本一致 ---
    open_app(page)
    page.wait_for_timeout(3000)
    if not page.locator("#update-bar").is_hidden():
        problems.append("版本相同時卻跳出了更新提示")
    else:
        ok("版本相同：沒有跳出更新提示")

    cached = page.evaluate("caches.keys().then(k => k.length)")
    ok(f"Service Worker 已建立 {cached} 個快取")

    # --- 2. 模擬部署新版 ---
    original = open(VERSION_FILE, encoding="utf-8").read()
    open(VERSION_FILE, "w", encoding="utf-8", newline="\n").write(
        re.sub(r"VERSION = '[^']+'", f"VERSION = '{NEWER}'", original, count=1)
    )
    ok(f"已把磁碟上的版本改成 {NEWER}（模擬部署）")

    # --- 3. 重新開啟，應該偵測到新版 ---
    reopen_app(page)
    try:
        page.wait_for_selector("#update-bar:not(.hidden)", timeout=20000)
    except Exception:
        problems.append("有新版本時沒有跳出更新提示")
        return

    shown = page.inner_text("#update-version")
    ok(f"偵測到新版本，跳出提示：{shown}")
    if shown != NEWER:
        problems.append(f"提示的版本號不對（{shown} != {NEWER}）")

    os.makedirs(SHOTS, exist_ok=True)
    page.screenshot(path=os.path.join(SHOTS, "07-update.png"))

    # --- 4. 點下去更新 ---
    page.click("#update-bar")
    page.wait_for_selector("#app:not(.hidden)", timeout=25000)
    page.wait_for_selector(".task", timeout=25000)
    page.wait_for_timeout(4000)

    if not page.locator("#update-bar").is_hidden():
        problems.append("更新完成後提示仍然出現，代表沒有真的換到新版")
    else:
        ok("更新完成：已是最新版，提示不再出現")

    if page.locator(".task").count() == 0:
        problems.append("更新後看不到任務，資料可能被清掉了")
    else:
        ok(f"更新後資料完整，仍有 {page.locator('.task').count()} 個任務")

    regs = page.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
    if regs < 1:
        problems.append("更新後 Service Worker 沒有重新註冊，離線功能會失效")
    else:
        ok(f"Service Worker 已重新註冊（{regs} 個），離線功能正常")


def main():
    version = read_version()
    print(f"目前版本 {version}，將模擬部署 {NEWER}\n")
    original = open(VERSION_FILE, encoding="utf-8").read()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 834, "height": 1112})
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

            try:
                run(page)
            except Exception as exc:
                problems.append(f"操作中斷：{type(exc).__name__}: {exc}")

            for e in dict.fromkeys(errors):
                if "favicon" in e.lower():
                    continue
                problems.append(f"console 錯誤：{e[:250]}")

            browser.close()
    finally:
        # 一定要還原，否則 repo 裡的版本號會被測試改掉
        open(VERSION_FILE, "w", encoding="utf-8", newline="\n").write(original)
        print(f"\n已還原 js/version.js（{read_version()}）")

    print()
    if problems:
        print(f"問題 {len(problems)} 筆：")
        for pb in problems:
            print("  ✗", pb)
        print("\n失敗 ❌")
        return 1
    print("自動更新機制正常 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
