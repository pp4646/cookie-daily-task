# -*- coding: utf-8 -*-
"""煙霧測試：用 Chromium 實際操作一遍 App，把 console 錯誤抓出來。

用法：
    python -m http.server 8765      # 另一個視窗
    pip install playwright && python -m playwright install chromium
    python tools/smoke_test.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8765")
SHOTS = os.path.join(os.path.dirname(__file__), "..", ".screenshots")
# 每次都用新的家庭代碼，否則上一輪留下的設定（例如關掉注音）會影響這一輪
FAMILY = os.environ.get("TEST_FAMILY", "smoketest-" + os.urandom(4).hex())

problems = []
steps = []


def step(name):
    steps.append(name)
    print(f"  ✓ {name}")


def run(page):
    page.goto(BASE, wait_until="domcontentloaded")

    # --- 首次設定 ---
    page.wait_for_selector("#setup:not(.hidden)", timeout=10000)
    page.fill("#setup-code", FAMILY)
    page.click("#setup-go")
    page.wait_for_selector("#app:not(.hidden)", timeout=10000)
    page.wait_for_selector(".task", timeout=10000)
    step("輸入家庭代碼並進入主畫面")

    # --- 注音 ---
    page.wait_for_function(
        "document.querySelectorAll('.task-title .zs').length > 0", timeout=10000
    )
    first = page.locator(".task").first
    title = first.locator(".task-title")
    text = title.inner_text().replace("\n", "")
    syms = title.locator(".zs").all_inner_texts()
    step(f"注音有顯示：{text[:12]} → {' '.join(syms[:4])}")
    if not syms:
        problems.append("任務標題沒有注音")

    # --- 打勾 ---
    before = int(page.inner_text("#points-value"))
    pts = int(first.locator(".task-pts").inner_text().replace("＋", "").replace(" 點", ""))
    first.click()
    page.wait_for_function(
        f"Number(document.querySelector('#points-value').textContent) === {before + pts}",
        timeout=5000,
    )
    if "done" not in (first.get_attribute("class") or ""):
        problems.append("打勾後任務沒有變成完成狀態")
    step(f"打勾加點數 {before} → {before + pts}")

    page.screenshot(path=os.path.join(SHOTS, "01-today.png"))

    # --- 全部完成 ---
    count = page.locator(".task").count()
    for i in range(count):
        node = page.locator(".task").nth(i)
        if "done" not in (node.get_attribute("class") or ""):
            node.click()
            page.wait_for_timeout(150)
    page.wait_for_selector("#all-done:not(.hidden)", timeout=5000)
    step("全部完成會顯示慶祝畫面")
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(SHOTS, "02-all-done.png"))

    # --- 獎品商店 ---
    page.click('.tabbar-btn[data-view="shop"]')
    page.wait_for_selector(".reward", timeout=5000)
    affordable = page.locator(".reward.affordable")
    step(f"獎品商店顯示 {page.locator('.reward').count()} 個獎品，可兌換 {affordable.count()} 個")
    page.screenshot(path=os.path.join(SHOTS, "03-shop.png"))

    if affordable.count():
        affordable.first.locator("button").click()
        page.wait_for_selector("#modal:not(.hidden)", timeout=5000)
        page.click("#modal-ok")
        page.wait_for_selector("#modal", state="hidden", timeout=5000)
        page.wait_for_selector(".redemption", timeout=5000)
        step("兌換獎品並產生待確認紀錄")

    # --- 家長專區 ---
    page.click('.tabbar-btn[data-view="parent"]')
    page.wait_for_selector("#pin-gate:not(.hidden)", timeout=5000)
    for digit in "1234":
        page.click(f'#pin-pad button[data-k="{digit}"]')
    page.wait_for_selector("#parent-body:not(.hidden)", timeout=5000)
    step("PIN 1234 解鎖家長專區")

    for tab, marker in [
        ("tasks", "#tpl-list .admin-row"),
        ("rewards", "#reward-admin-list .admin-row"),
        ("approve", "#approve-list"),
        ("history", "#cal-grid .cal-cell"),
        ("settings", "#kid-admin-list .admin-row"),
    ]:
        page.click(f'.tab[data-tab="{tab}"]')
        page.wait_for_selector(marker, timeout=5000)
        page.wait_for_timeout(200)
        step(f"家長分頁「{tab}」正常顯示")
        page.screenshot(path=os.path.join(SHOTS, f"04-parent-{tab}.png"))

    # --- 版本號 ---
    version = page.inner_text("#info-version")
    if not version or version == "—":
        problems.append("設定頁沒有顯示版本號")
    step(f"版本號顯示：{version}")

    # --- 新增任務（含注音預覽） ---
    page.click('.tab[data-tab="tasks"]')
    page.click("#tpl-add")
    page.wait_for_selector("#modal:not(.hidden)")
    page.fill("#f-title", "幫忙倒垃圾")
    page.wait_for_timeout(300)
    preview = page.locator("#f-preview .zs").all_inner_texts()
    auto = page.inner_text("#f-auto")
    step(f"新增任務注音預覽：{' '.join(preview)}")
    if "ㄌㄜˋ" not in auto:
        problems.append(f"「垃圾」應該讀 ㄌㄜˋ ㄙㄜˋ，實際為：{auto}")
    page.screenshot(path=os.path.join(SHOTS, "05-edit-task.png"))
    page.click("#modal-ok")
    page.wait_for_selector("#modal", state="hidden", timeout=5000)
    page.wait_for_selector("text=幫忙倒垃圾", timeout=5000)
    step("新增每日任務成功")

    # --- 字體與注音開關 ---
    page.click('.tab[data-tab="settings"]')
    page.click('#font-seg button[data-font="kai"]')
    page.wait_for_timeout(200)
    step("切換標楷體")
    page.click("#sw-zhuyin")
    page.wait_for_timeout(300)
    page.click('.tabbar-btn[data-view="today"]')
    page.wait_for_timeout(300)
    if page.locator(".task-title .zs").count() > 0:
        problems.append("關閉注音後仍然顯示注音")
    step("關閉注音後不再顯示注音")
    page.screenshot(path=os.path.join(SHOTS, "06-no-zhuyin.png"))

    # --- 重新整理後資料保留 ---
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".task", timeout=10000)
    kept = page.locator(".task.done").count()
    if kept == 0:
        problems.append("重新整理後完成狀態沒有保留")
    step(f"重新整理後保留 {kept} 個已完成任務")


def main():
    os.makedirs(SHOTS, exist_ok=True)
    print(f"測試家庭代碼：{FAMILY}\n")
    console_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 834, "height": 1112})  # iPad 直向

        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR: {e}"))

        try:
            run(page)
        except Exception as exc:
            problems.append(f"操作中斷：{type(exc).__name__}: {exc}")
            page.screenshot(path=os.path.join(SHOTS, "99-failure.png"))
        finally:
            browser.close()

    print(f"\n完成 {len(steps)} 個步驟")

    if console_errors:
        print(f"\nConsole 錯誤 {len(console_errors)} 筆：")
        for e in dict.fromkeys(console_errors):
            print("  ✗", e[:300])

    if problems:
        print(f"\n問題 {len(problems)} 筆：")
        for pb in problems:
            print("  ✗", pb)

    ok = not problems and not console_errors
    print("\n" + ("全部通過 ✅" if ok else "有問題需要修正 ❌"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
