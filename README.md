# Cookie 的每日挑戰 🌟

**線上網址：<https://pp4646.github.io/cookie-daily-task/>**

給小朋友用的每日任務打勾 App。iPad 加入主畫面之後，用起來就跟一般 App 一樣。

- ✅ 每天的任務清單，點一下打勾，有動畫和音效
- 🔤 **國字旁邊有注音**，方便正在認字的小朋友閱讀
- ⭐ 完成任務集點數，可以兌換家長設定的獎品
- 🔥 連續達成天數、月曆檢視每天的完成狀況
- 👨‍👩‍👧 家長專區用 4 位數密碼進入，可以自訂任務和獎品
- 📱 iPad、手機、電腦都能用，**同一組家庭代碼即時同步**
- ✈️ 支援離線，沒網路也能打勾，連上網會自動補傳

---

## 目錄

1. [馬上試用（30 秒）](#1-馬上試用30-秒)
2. [設定雲端同步（讓手機也能看）](#2-設定雲端同步讓手機也能看)
3. [部署到網路上](#3-部署到網路上)
4. [加到 iPad 主畫面](#4-加到-ipad-主畫面)
5. [日常使用](#5-日常使用)
6. [改版與版本號](#6-改版與版本號)
7. [檔案結構](#7-檔案結構)
8. [常見問題](#8-常見問題)

---

## 1. 馬上試用（30 秒）

**最簡單的方式**：直接雙擊 **`start.cmd`**。
它會自動啟動伺服器並開啟瀏覽器。

或是在這個資料夾打開終端機（PowerShell）執行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

然後用瀏覽器打開 <http://localhost:8000>。

> 💡 **為什麼要加 `--bind 127.0.0.1`？**
> 不加的話 Python 會對整個區域網路開放，Windows 防火牆就會跳出
> 「是否允許公用和私人網路存取這個應用程式？」的視窗。
> 公司電腦常常會顯示「此設定由您的組織管理」而無法勾選。
>
> 加上 `--bind 127.0.0.1` 之後只有這台電腦連得到，**不會跳防火牆視窗，
> 也完全不受公司政策影響**。`localhost` 走的是回送介面，不經過防火牆。

> ⚠️ 請不要直接用滑鼠雙擊 `index.html`。這個 App 用了 ES 模組，
> 用 `file://` 開啟會被瀏覽器的安全限制擋下來。

第一次會請你輸入**家庭代碼**，隨便打一個就好（例如 `test-family`）。
現在還沒設定 Firebase，所以是**本機模式**，資料只存在這台電腦的瀏覽器裡。

- 家長密碼預設是 **`1234`**
- 進「家長」頁就可以改任務、改獎品、改密碼

---

## 2. 設定雲端同步（讓手機也能看）

要在 iPad 打勾、你手機上馬上看到，就需要這一步。**全部免費**，
以一個家庭的用量來說，遠遠用不完 Firebase 的免費額度。

### 2-1 建立 Firebase 專案

1. 用 Google 帳號登入 <https://console.firebase.google.com>
2. 點「建立專案」，名稱隨意（例如 `cookie-tasks`）
3. Google Analytics 可以**關掉**，用不到

### 2-2 開啟匿名登入

1. 左邊選單 →「**Authentication**」→「開始使用」
2. 「Sign-in method」分頁 → 選「**匿名**」→ 啟用 → 儲存

> 匿名登入是為了讓安全規則有東西可以驗證，小朋友不用記帳號密碼。

### 2-3 建立資料庫

1. 左邊選單 →「**Firestore Database**」→「建立資料庫」
2. 位置選 **asia-east1（台灣）** 速度最快
3. 模式先選「**以正式版模式啟動**」（規則等一下會換掉）

### 2-4 取得設定並填進去

1. 左上齒輪 →「**專案設定**」
2. 往下捲到「你的應用程式」→ 點 **`</>`**（網頁）圖示
3. 暱稱隨意，**不要**勾「Firebase Hosting」，按註冊
4. 會看到一段 `firebaseConfig = { ... }`，把裡面的值複製到本專案的
   **`js/config.js`**：

```js
export const firebaseConfig = {
  apiKey: 'AIza............',
  authDomain: 'cookie-tasks.firebaseapp.com',
  projectId: 'cookie-tasks',
  storageBucket: 'cookie-tasks.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef123456',
};
```

> 這些值放在前端是正常的，不是密碼。真正的保護來自下一步的安全規則。

存檔後重新整理，設定頁的「模式」就會變成 **雲端同步**。

### 2-5 套用安全規則

Firestore →「規則」分頁，把內容換成本專案 **`firestore.rules`** 的內容，按「發布」。

規則要求：**必須登入** + **家庭代碼至少 8 個字**。

> 🔑 **請把家庭代碼取得難猜一點**，例如 `chou-cookie-8f3a2b`。
> 知道代碼的人就能看到、改到資料。不要用 `test`、`family`、`12345`。

---

## 3. 部署到網路上

放到網路上之後，iPad 和手機只要開同一個網址就好。

### 方法 A：Firebase Hosting（推薦，同一個專案搞定）

需要先安裝 [Node.js](https://nodejs.org)，然後：

```powershell
npm install -g firebase-tools
firebase login
firebase use --add          # 選剛剛建立的專案
firebase deploy
```

完成後會給你一個網址，例如 `https://cookie-tasks.web.app`。

以後改完程式，只要再跑一次 `firebase deploy` 就好。

### 方法 B：GitHub Pages

把整個資料夾推上 GitHub，到 Repo 的 Settings → Pages，
Source 選 `main` 分支的根目錄即可。

> 兩種方法都是 HTTPS，這是 PWA（加到主畫面、離線功能）的必要條件。

---

## 4. 加到 iPad 主畫面

1. 用 **Safari** 開啟你的網址（一定要 Safari，Chrome 不行）
2. 輸入家庭代碼（要和你手機上輸入的**完全一樣**）
3. 點下方的「**分享**」按鈕 <kbd>⬆️</kbd>
4. 選「**加入主畫面**」
5. 名稱可以改成「每日挑戰」，按「新增」

完成！主畫面會出現一個星星圖示，點開就是全螢幕，看不到網址列。

你自己的手機也用同一個網址、同一組家庭代碼，就能隨時查看 Cookie 的完成狀況。

---

## 5. 日常使用

### 小孩（Cookie）

| 畫面 | 做什麼 |
| --- | --- |
| **今日** | 點任務卡片打勾，上面看得到完成度和連續天數 |
| **獎品** | 點數夠了就可以兌換，會送出給家長確認 |

用 `‹` `›` 可以回頭看前幾天做了什麼。

### 家長

進「家長」頁，輸入密碼（預設 `1234`，請記得改掉）。

| 分頁 | 做什麼 |
| --- | --- |
| **任務** | 設定每日固定任務（可指定星期幾）、加今天的臨時任務 |
| **獎品** | 新增／修改獎品和所需點數 |
| **兌換** | 核准或退回小孩的兌換申請（退回會自動退還點數） |
| **紀錄** | 月曆看每天的完成狀況、完成率、連續天數 |
| **設定** | 注音開關、字體、小孩管理、手動加減點數、改密碼、家庭代碼、匯出備份 |

**變更都是自動儲存的**，沒有儲存按鈕。每個動作完成後畫面下方會跳出確認訊息。

**用完記得鎖回去**：按底部的「**✓ 完成，鎖定並離開**」。
另外這些情況也會自動上鎖，避免忘記：

- 切到「今日」或「獎品」分頁
- 切換到別的 App 或關螢幕
- 在家長頁閒置 3 分鐘

**注音怎麼來的？**
App 內建注音對照表，會**優先用詞彙比對**來判斷破音字。
例如「倒垃圾」會標成 `ㄉㄠˋ ㄌㄜˋ ㄙㄜˋ`，「彈鋼琴」會標成 `ㄉㄢˋ`。
如果哪個字標錯了，在編輯任務的視窗裡有「**注音**」欄位可以自己改，
一個中文字一組、用空白分開，例如：

```
ㄉㄠˋ ㄌㄜˋ ㄙㄜˋ
```

---

## 6. 改版與版本號

版本號只有**一個地方**要改：`js/version.js`。

```js
export const VERSION = '1.1.0';
export const VERSION_DATE = '2026-09-01';
```

改完之後：

1. 在 [`CHANGELOG.md`](CHANGELOG.md) 最上面加一段，寫這版改了什麼
2. 重新部署

Service Worker 的快取名稱會帶上版本號，所以**版本號一變，
iPad 上的 App 下次開啟時就會自動更新**，不用手動清快取。

版本號規則（[語意化版本](https://semver.org/lang/zh-TW/)）：

| 位置 | 什麼時候要加 | 例子 |
| --- | --- | --- |
| 主版本 | 大改版，舊資料需要轉換 | 1.4.2 → 2.0.0 |
| 次版本 | 新增功能，舊資料照常可用 | 1.1.0 → 1.2.0 |
| 修訂號 | 只修 bug 或調整外觀 | 1.1.0 → 1.1.1 |

---

## 7. 檔案結構

```
start.cmd                一鍵啟動本機預覽
index.html              主頁面
manifest.json           PWA 設定（App 名稱、圖示）
sw.js                   Service Worker，負責離線與自動更新
firebase.json           Firebase Hosting 設定
firestore.rules         資料庫安全規則

css/style.css           全部樣式（含注音排版、繁體字型設定）

js/version.js           ★ 版本號（唯一來源）
js/config.js            ★ Firebase 設定（要自己填）
js/app.js               開機流程、狀態管理、小孩端畫面
js/parent.js            家長專區
js/store.js             資料層（本機 / Firestore 雙模式）
js/ui.js                共用工具（日期、彈窗、音效、動畫、注音包裝）
js/zhuyin.js            注音標注邏輯（詞彙優先、一／不變調）
js/zhuyin-data.js       注音對照表（自動產生，勿手改）

icons/                  App 圖示

tools/gen_zhuyin.py     產生注音對照表
tools/check_zhuyin.py   驗證注音對照表
tools/gen_icons.py      產生 App 圖示
tools/smoke_test.py     自動測試（實際操作一遍 App）
```

`tools/` 底下的程式**平常不用跑**，只有要修改注音字典或圖示時才需要：

```powershell
pip install pypinyin opencc-python-reimplemented pillow
python tools/gen_zhuyin.py
python tools/check_zhuyin.py
python tools/gen_icons.py
```

改完程式想確認沒壞掉，可以跑自動測試（會開一個瀏覽器操作一遍，並截圖到 `.screenshots/`）：

```powershell
pip install playwright
python -m playwright install chromium

# 一個視窗開伺服器
python -m http.server 8765
# 另一個視窗跑測試
python tools/smoke_test.py
```

---

## 8. 常見問題

**Q：跑伺服器時跳出防火牆視窗，但公司電腦顯示「此設定由您的組織管理」？**
不影響，**本機依然可以正常使用**。那個視窗只關乎「別台電腦能不能連進來」，
而 `localhost` 走的是回送介面，不經過防火牆。

直接雙擊 `start.cmd`，或加上 `--bind 127.0.0.1`，就不會再跳出那個視窗：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

**Q：打不開，畫面卡在「載入中」？**
確認是用 `http://localhost:8000` 這種網址開啟，不是直接雙擊 `index.html`。

**Q：iPad 和手機看到的資料不一樣？**
1. 確認 `js/config.js` 已經填好且已重新部署
2. 確認兩邊輸入的**家庭代碼一字不差**（設定頁最下面可以看到目前的代碼）

**Q：改了程式，但 iPad 上還是舊的？**
改 `js/version.js` 的版本號再重新部署。若還是不行，
把主畫面圖示刪掉，用 Safari 重開一次再重新加入。

**Q：某個字的注音標錯了？**
編輯該任務／獎品，在「注音」欄位手動填正確的讀音。
如果是很常見的詞，也可以加到 `tools/gen_zhuyin.py` 的 `TW_PHRASE` 再重新產生字典。

**Q：忘記家長密碼？**
本機模式：清掉瀏覽器的網站資料就會回到預設值。
雲端模式：到 Firebase Console → Firestore →
`families / <你的代碼> / state / config`，直接改 `parentPin` 欄位。

**Q：資料會不會不見？**
雲端模式的資料存在 Firestore，不會因為換裝置而消失。
另外建議偶爾到「設定 → 匯出備份」下載一份 JSON 留存。
