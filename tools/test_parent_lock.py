# -*- coding: utf-8 -*-
"""驗證家長專區的上鎖機制。

檢查四件事：
  1. 「完成，鎖定並離開」按鈕會鎖回去並跳回今日頁
  2. 切到別的分頁（今日／獎品）會自動上鎖
  3. App 切到背景會自動上鎖
  4. 密碼錯誤不會解鎖

用法：
    python -m http.server 8765 --bind 127.0.0.1
    python tools/test_parent_lock.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8765")
FAMILY = "locktest-" + os.urandom(4).hex()

problems = []


def ok(msg):
    print(f"  \u2713 {msg}")


def goto_parent(page):
    page.click('.tabbar-btn[data-view="parent"]')
    page.wait_for_timeout(400)


def enter_pin(page, pin):
    for d in pin:
        page.click(f'#pin-pad button[data-k="{d}"]')
    page.wait_for_timeout(600)


def is_locked(page):
    """鎖住 = 看得到 PIN 鍵盤、看不到家長內容"""
    return (
        page.locator("#pin-gate").is_visible()
        and page.locator("#parent-body").is_hidden()
    )


def run(page):
    page.goto(f"{BASE}#f={FAMILY}", wait_until="domcontentloaded")
    page.wait_for_selector("#app:not(.hidden)", timeout=25000)
    page.wait_for_selector(".task", timeout=25000)

    # --- 1. 密碼錯誤不該解鎖 ---
    goto_parent(page)
    enter_pin(page, "9999")
    if not is_locked(page):
        problems.append("輸入錯誤密碼竟然解鎖了")
    else:
        ok("密碼錯誤：維持鎖定")

    # --- 2. 正確密碼可以進入 ---
    enter_pin(page, "1234")
    if is_locked(page):
        problems.append("輸入正確密碼卻沒有解鎖")
        return
    ok("密碼正確：進入家長專區")

    # --- 3. 「完成，鎖定並離開」 ---
    page.click("#parent-done")
    page.wait_for_timeout(600)
    if not page.locator("#view-today").is_visible():
        problems.append("按下「完成」後沒有跳回今日頁")
    else:
        ok("按下「完成」：跳回今日頁")

    goto_parent(page)
    if not is_locked(page):
        problems.append("按下「完成」後再進家長頁，竟然還是解鎖狀態")
    else:
        ok("按下「完成」：家長專區已鎖回去")

    # --- 4. 切到別的分頁會自動上鎖 ---
    enter_pin(page, "1234")
    if is_locked(page):
        problems.append("第二次輸入正確密碼沒有解鎖")
        return
    page.click('.tabbar-btn[data-view="shop"]')
    page.wait_for_timeout(400)
    goto_parent(page)
    if not is_locked(page):
        problems.append("切到獎品頁再回來，家長專區沒有自動上鎖")
    else:
        ok("切換到其他分頁：自動上鎖")

    # --- 5. App 切到背景會自動上鎖 ---
    enter_pin(page, "1234")
    if is_locked(page):
        problems.append("第三次輸入正確密碼沒有解鎖")
        return

    # 模擬切到別的 App / 關螢幕
    page.evaluate("""
      Object.defineProperty(document, 'visibilityState',
        { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    """)
    page.wait_for_timeout(500)
    page.evaluate("""
      Object.defineProperty(document, 'visibilityState',
        { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    """)
    page.wait_for_timeout(500)

    if not is_locked(page):
        problems.append("App 切到背景再回來，家長專區沒有自動上鎖")
    else:
        ok("切到背景再回來：自動上鎖")

    # --- 6. 小孩端功能不受影響 ---
    page.click('.tabbar-btn[data-view="today"]')
    page.wait_for_selector(".task", timeout=8000)
    before = int(page.inner_text("#points-value"))
    page.locator(".task").first.click()
    page.wait_for_function(
        f"Number(document.querySelector('#points-value').textContent) > {before}",
        timeout=8000,
    )
    ok("上鎖後小孩仍然可以正常打勾")


def main():
    print(f"測試代碼：{FAMILY}\n")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 834, "height": 1112})
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

    print()
    if problems:
        print(f"問題 {len(problems)} 筆：")
        for pb in problems:
            print("  ✗", pb)
        print("\n失敗 ❌")
        return 1
    print("家長專區上鎖機制正常 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
