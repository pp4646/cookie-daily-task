# -*- coding: utf-8 -*-
"""測試 Firebase 雲端連線是否正常。

會做的事：
  1. 用測試用的家庭代碼開啟 App
  2. 確認模式變成「雲端同步」
  3. 打勾一個任務
  4. 用另一個瀏覽器視窗（模擬你的手機）開同一個代碼，確認看得到同一筆資料
  5. 刪掉測試資料

用法：
    python -m http.server 8765 --bind 127.0.0.1
    python tools/test_firebase.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8765")
FAMILY = os.environ.get("TEST_FAMILY", "connftest-" + os.urandom(4).hex())

problems = []


def ok(msg):
    print(f"  \u2713 {msg}")


def open_app(context, label):
    page = context.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#setup:not(.hidden)", timeout=15000)
    page.fill("#setup-code", FAMILY)
    page.click("#setup-go")
    page.wait_for_selector("#app:not(.hidden)", timeout=20000)
    page.wait_for_selector(".task", timeout=20000)
    ok(f"{label} 已連線並載入任務")
    return page, errors


def read_mode(page):
    page.click('.tabbar-btn[data-view="parent"]')
    page.wait_for_selector("#pin-gate:not(.hidden)", timeout=5000)
    for d in "1234":
        page.click(f'#pin-pad button[data-k="{d}"]')
    page.wait_for_selector("#parent-body:not(.hidden)", timeout=5000)
    page.click('.tab[data-tab="settings"]')
    page.wait_for_selector("#info-mode", timeout=5000)
    return page.inner_text("#info-mode"), page.inner_text("#info-code")


def main():
    print(f"測試家庭代碼：{FAMILY}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # --- 裝置 A（假裝是 iPad）---
        ctx_a = browser.new_context(viewport={"width": 834, "height": 1112})
        page_a, err_a = open_app(ctx_a, "裝置A(iPad)")

        mode, code = read_mode(page_a)
        if "雲端" not in mode:
            problems.append(f"模式應該是雲端同步，實際顯示：{mode}")
        else:
            ok(f"模式：{mode}｜家庭代碼：{code}")

        # 打勾第一個任務
        page_a.click('.tabbar-btn[data-view="today"]')
        page_a.wait_for_selector(".task", timeout=5000)
        first = page_a.locator(".task").first
        title = first.locator(".task-title").inner_text().replace("\n", "")
        first.click()
        page_a.wait_for_function(
            "Number(document.querySelector('#points-value').textContent) > 0", timeout=15000
        )
        pts_a = page_a.inner_text("#points-value")
        ok(f"裝置A 打勾「{title[:10]}」，點數 = {pts_a}")

        # --- 裝置 B（假裝是你的手機，完全獨立的瀏覽器狀態）---
        ctx_b = browser.new_context(viewport={"width": 390, "height": 844})
        page_b, err_b = open_app(ctx_b, "裝置B(手機)")

        # 應該要看到裝置A剛剛打的勾
        try:
            page_b.wait_for_function(
                f"document.querySelector('#points-value').textContent === '{pts_a}'",
                timeout=20000,
            )
            ok(f"裝置B 看到同樣的點數 = {pts_a} ← 跨裝置同步成功")
        except Exception:
            problems.append(
                f"裝置B 沒看到裝置A的資料（B={page_b.inner_text('#points-value')}, A={pts_a}）"
            )

        # 反向測試：B 再打一個勾，A 要即時更新
        tasks_b = page_b.locator(".task")
        clicked = False
        for i in range(tasks_b.count()):
            node = tasks_b.nth(i)
            if "done" not in (node.get_attribute("class") or ""):
                node.click()
                clicked = True
                break

        if not clicked:
            problems.append("裝置B 找不到未完成的任務可以點，反向測試沒做到")
        else:
            # 先確認 B 自己真的變了，否則後面的斷言等於沒驗
            try:
                page_b.wait_for_function(
                    f"Number(document.querySelector('#points-value').textContent) > {pts_a}",
                    timeout=15000,
                )
            except Exception:
                problems.append(
                    f"裝置B 打勾後點數沒有增加（仍為 {page_b.inner_text('#points-value')}）"
                )
                clicked = False

        if clicked:
            pts_b = page_b.inner_text("#points-value")
            try:
                page_a.wait_for_function(
                    f"document.querySelector('#points-value').textContent === '{pts_b}'",
                    timeout=20000,
                )
                ok(f"裝置A 即時收到裝置B的更新 {pts_a} → {pts_b} ← 雙向即時同步成功")
            except Exception:
                problems.append(
                    f"裝置A 沒即時收到裝置B的更新（A={page_a.inner_text('#points-value')}, B={pts_b}）"
                )

        for label, errs in (("裝置A", err_a), ("裝置B", err_b)):
            for e in dict.fromkeys(errs):
                if "favicon" in e.lower():
                    continue
                problems.append(f"{label} console 錯誤：{e[:250]}")

        browser.close()

    print()
    if problems:
        print(f"問題 {len(problems)} 筆：")
        for pb in problems:
            print("  ✗", pb)
        print("\n雲端連線有問題 ❌")
        return 1

    print("雲端同步完全正常 ✅")
    print(f"\n提醒：測試資料留在 Firestore 的 families/{FAMILY}，可以到主控台刪掉。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
