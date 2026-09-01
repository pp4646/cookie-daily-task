// 主程式：開機流程、狀態管理、小孩端畫面。

import { DEFAULT_CONFIG, rememberFamilyCode, rid, savedFamilyCode, store } from './store.js';
import { isCloudConfigured } from './config.js';
import { initParent, lockParent, renderParent } from './parent.js';
import { VERSION } from './version.js';
import {
  $, $$, addDays, confetti, dayLabel, escapeHTML, loadZhuyin, modal, parseDate,
  playSound, prettyDate, ruby, setZhuyinEnabled, toast, todayStr,
} from './ui.js';

const state = {
  config: null,
  dayDoc: null,
  date: todayStr(),
  kidId: null,
  view: 'today',
  unsubDay: null,
  streak: 0,
};

// =========================================================== 開機

/** 從網址的 #f= 取得家庭代碼。加到主畫面的圖示會把網址一起記住，
 * 所以即使 iOS 清掉瀏覽器儲存空間，下次開啟依然拿得到代碼。 */
function codeFromUrl() {
  const m = location.hash.match(/[#&]f=([A-Za-z0-9-]{3,64})/);
  return m ? m[1].toLowerCase() : '';
}

function writeCodeToUrl(code) {
  const target = `#f=${code}`;
  if (location.hash !== target) history.replaceState(null, '', target);
}

async function boot() {
  registerServiceWorker();

  let code = codeFromUrl() || savedFamilyCode();
  if (!code) code = await askFamilyCode();

  // 先記住再連線。舊版本是連線成功才記，一旦 Firebase 慢或失敗
  // 就等於沒存到，下次開啟又要重新輸入。
  rememberFamilyCode(code);
  writeCodeToUrl(code);

  await store.init(code);

  store.onConfig(async (cfg) => {
    if (!cfg) {
      // 第一次使用，建立預設資料
      cfg = DEFAULT_CONFIG();
      await store.saveConfig(cfg);
      return; // 存檔會再觸發一次 onConfig
    }
    state.config = cfg;
    if (!state.kidId || !cfg.kids.some((k) => k.id === state.kidId)) {
      state.kidId = cfg.kids[0]?.id ?? null;
    }
    applyPreferences(cfg);
    watchDay(state.date);
    renderAll();
  });

  $('#boot').classList.add('hidden');
  $('#app').classList.remove('hidden');
  wireEvents();
  initParent(ctx);
  checkForUpdate();
}

function askFamilyCode() {
  return new Promise((resolve) => {
    const box = $('#setup');
    const input = $('#setup-code');
    const err = $('#setup-err');
    $('#boot').classList.add('hidden');
    box.classList.remove('hidden');
    $('#setup-mode').textContent = isCloudConfigured()
      ? '這組代碼會用來同步資料，在 iPad 和你的手機上要輸入一樣的。'
      : '目前是本機模式，資料只會存在這台裝置。要跨裝置同步請參考 README.md 設定 Firebase。';

    const submit = () => {
      const code = input.value.trim().toLowerCase().replace(/\s+/g, '-');
      if (code.length < 3) {
        err.textContent = '代碼太短了，請至少 3 個字';
        err.classList.remove('hidden');
        return;
      }
      if (!/^[a-z0-9-]+$/.test(code)) {
        err.textContent = '只能使用英文字母、數字和減號';
        err.classList.remove('hidden');
        return;
      }
      box.classList.add('hidden');
      resolve(code);
    };

    $('#setup-go').onclick = submit;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
    };
    input.focus();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // 直接開檔時不支援
  // 帶上版本號：改版本就會抓到新的 Service Worker
  navigator.serviceWorker
    .register(`sw.js?v=${VERSION}`)
    .then((reg) => reg.update().catch(() => {}))
    .catch(() => {});
}

// ------------------------------------------------------- 自動偵測新版本
//
// Service Worker 為了離線功能會優先給快取，所以光靠它，新版通常要開第二、
// 三次才會生效。這裡每次開啟時直接跟伺服器問一次目前的版本號（不走快取），
// 發現不一樣就跳出提示，讓使用者點一下立刻換成新版。

async function checkForUpdate() {
  if (location.protocol === 'file:' || !navigator.onLine) return;
  try {
    const res = await fetch(`js/version.js?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const latest = (await res.text()).match(/VERSION\s*=\s*'([^']+)'/)?.[1];
    if (latest && latest !== VERSION) showUpdateBar(latest);
  } catch {
    /* 離線或連不上就當作沒有新版 */
  }
}

function showUpdateBar(latest) {
  const bar = $('#update-bar');
  if (!bar || !bar.classList.contains('hidden')) return;
  $('#update-version').textContent = latest;
  bar.classList.remove('hidden');
  bar.onclick = applyUpdate;
}

/** 清掉所有快取與 Service Worker 再重新載入，確保拿到全新的檔案 */
async function applyUpdate() {
  $('#update-bar').classList.add('hidden');
  toast('更新中…');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* 清不掉也還是重新載入，至少 index.html 會是新的 */
  }
  location.reload();
}

function applyPreferences(cfg) {
  setZhuyinEnabled(cfg.zhuyin !== false);
  document.documentElement.style.setProperty(
    '--font-kid',
    cfg.kidFont === 'kai' ? 'var(--font-kai)' : 'var(--font-ui)',
  );
  if (cfg.zhuyin !== false) loadZhuyin().then(renderAll);
}

// =========================================================== 當日資料

function watchDay(date) {
  if (state.unsubDay) state.unsubDay();
  state.date = date;
  state.unsubDay = store.onDay(date, (doc) => {
    state.dayDoc = doc;
    renderAll();
    refreshStreak();
  });
}

/** 依模板與已存紀錄，組出某一天要顯示的任務清單 */
function buildTasks(date, cfg, kidId) {
  if (!cfg || !kidId) return [];
  const weekday = parseDate(date).getDay();
  const templates = cfg.templates.filter(
    (t) => t.kidId === kidId && t.active !== false && (t.weekdays || []).includes(weekday),
  );
  const stored = state.dayDoc?.kids?.[kidId]?.tasks;

  if (!stored) return templates.map(taskFromTemplate);

  const isPast = date < todayStr();
  if (isPast) return stored; // 過去的紀錄保持原樣，不要被之後的模板改動

  const out = stored.map((task) => {
    if (!task.templateId) return task;
    const t = templates.find((x) => x.id === task.templateId);
    // 模板內容有改就同步過來，但保留完成狀態
    return t ? { ...task, title: t.title, emoji: t.emoji, points: t.points, zhuyin: t.zhuyin || '' } : task;
  });

  for (const t of templates) {
    if (!out.some((x) => x.templateId === t.id)) out.push(taskFromTemplate(t));
  }
  return out.filter((x) => !x.templateId || x.done || templates.some((t) => t.id === x.templateId));
}

function taskFromTemplate(t) {
  return {
    // 用模板 id 當作任務 id，重新渲染時才不會變動
    id: t.id,
    templateId: t.id,
    title: t.title,
    emoji: t.emoji,
    points: t.points,
    zhuyin: t.zhuyin || '',
    done: false,
    doneAt: null,
  };
}

function currentTasks() {
  return buildTasks(state.date, state.config, state.kidId);
}

async function persistTasks(tasks) {
  const doc = {
    date: state.date,
    kids: { ...(state.dayDoc?.kids || {}), [state.kidId]: { tasks } },
  };
  state.dayDoc = doc;
  await store.saveDay(state.date, doc);
}

async function patchConfig(mutate) {
  const next = structuredClone(state.config);
  mutate(next);
  state.config = next;
  await store.saveConfig(next);
}

// =========================================================== 打勾

async function toggleTask(taskId) {
  const tasks = currentTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const wasAllDone = tasks.length > 0 && tasks.every((t) => t.done);
  task.done = !task.done;
  task.doneAt = task.done ? Date.now() : null;
  const delta = task.done ? task.points : -task.points;

  playSound(task.done ? 'check' : 'uncheck');
  await persistTasks(tasks);
  await patchConfig((cfg) => {
    cfg.points[state.kidId] = Math.max(0, (cfg.points[state.kidId] || 0) + delta);
  });

  $('#points-badge').classList.remove('bump');
  void $('#points-badge').offsetWidth;
  $('#points-badge').classList.add('bump');

  const nowAllDone = tasks.length > 0 && tasks.every((t) => t.done);
  if (nowAllDone && !wasAllDone) {
    playSound('win');
    confetti();
  }
  renderAll();
  refreshStreak();
}

// =========================================================== 連續達成

async function refreshStreak() {
  if (!state.config || !state.kidId) return;
  const today = todayStr();
  const dates = [];
  for (let i = 0; i < 60; i++) dates.push(addDays(today, -i));

  const docs = await store.getDays(dates);
  let streak = 0;
  for (let i = 0; i < dates.length; i++) {
    const tasks = docs.get(dates[i])?.kids?.[state.kidId]?.tasks || [];
    const complete = tasks.length > 0 && tasks.every((t) => t.done);
    if (complete) {
      streak += 1;
    } else if (i === 0) {
      continue; // 今天還沒做完不算中斷
    } else {
      break;
    }
  }
  state.streak = streak;
  const node = $('#streak-text');
  if (node) node.textContent = `🔥 連續達成 ${streak} 天`;
}

// =========================================================== 畫面

function renderAll() {
  if (!state.config) return;
  renderTopbar();
  renderToday();
  renderShop();
  if (state.view === 'parent') renderParent(ctx);
}

function currentKid() {
  return state.config.kids.find((k) => k.id === state.kidId) || state.config.kids[0];
}

function points() {
  return state.config.points?.[state.kidId] || 0;
}

function renderTopbar() {
  const kid = currentKid();
  if (!kid) return;
  $('#kid-emoji').textContent = kid.emoji;
  $('#kid-name').textContent = kid.name;
  $('#points-value').textContent = points();
  $('#kid-switch').disabled = state.config.kids.length < 2;
}

function renderToday() {
  const tasks = currentTasks();
  const list = $('#task-list');
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  $('#day-label').textContent = dayLabel(state.date);
  $('#day-date').textContent = prettyDate(state.date);
  $('#day-next').disabled = state.date >= todayStr();

  const circumference = 2 * Math.PI * 52;
  $('#ring-fg').style.strokeDashoffset = String(circumference * (1 - pct / 100));
  $('#ring-pct').textContent = `${pct}%`;
  $('#progress-count').textContent = tasks.length
    ? `完成 ${done} / ${tasks.length} 項`
    : '今天沒有任務';

  list.innerHTML = '';
  for (const task of tasks) {
    const btn = document.createElement('button');
    btn.className = `task${task.done ? ' done' : ''}`;
    btn.innerHTML =
      `<span class="task-emoji">${escapeHTML(task.emoji || '⭐')}</span>` +
      `<span class="task-main">` +
      `<span class="task-title zhuyin-text">${ruby(task.title, task.zhuyin)}</span>` +
      `<span class="task-pts">＋${task.points} 點</span>` +
      `</span>` +
      `<span class="task-check">✓</span>`;
    btn.onclick = () => {
      btn.classList.add('pop');
      setTimeout(() => btn.classList.remove('pop'), 460);
      toggleTask(task.id);
    };
    list.appendChild(btn);
  }

  $('#today-empty').classList.toggle('hidden', tasks.length > 0);
  $('#all-done').classList.toggle('hidden', !(tasks.length > 0 && done === tasks.length));
}

function renderShop() {
  const cfg = state.config;
  const box = $('#reward-list');
  const balance = points();
  $('#shop-points').textContent = balance;

  const rewards = (cfg.rewards || []).filter((r) => r.active !== false);
  box.innerHTML = '';
  for (const r of rewards) {
    const affordable = balance >= r.cost;
    const card = document.createElement('div');
    card.className = `reward${affordable ? ' affordable' : ''}`;
    card.innerHTML =
      `<div class="reward-emoji">${escapeHTML(r.emoji || '🎁')}</div>` +
      `<div class="reward-name zhuyin-text">${ruby(r.name, r.zhuyin)}</div>` +
      `<div class="reward-cost">⭐ ${r.cost} 點</div>` +
      (affordable
        ? '<button class="btn btn-primary">兌換</button>'
        : `<div class="reward-short">還差 ${r.cost - balance} 點</div>`);
    if (affordable) card.querySelector('button').onclick = () => redeem(r);
    box.appendChild(card);
  }
  $('#shop-empty').classList.toggle('hidden', rewards.length > 0);

  const mine = (cfg.redemptions || [])
    .filter((x) => x.kidId === state.kidId)
    .slice(-8)
    .reverse();
  const listBox = $('#redemption-list');
  listBox.innerHTML = '';
  const label = { pending: '等家長確認', approved: '已兌換', rejected: '已退回' };
  for (const item of mine) {
    const row = document.createElement('div');
    row.className = 'redemption';
    row.innerHTML =
      `<span>${escapeHTML(item.emoji || '🎁')}</span>` +
      `<span class="grow zhuyin-text">${ruby(item.name)}</span>` +
      `<span class="tag ${item.status}">${label[item.status]}</span>`;
    listBox.appendChild(row);
  }
}

async function redeem(reward) {
  const ok = await modal({
    title: '要兌換嗎？',
    bodyHTML:
      `<p style="text-align:center;font-size:52px;margin:0">${escapeHTML(reward.emoji || '🎁')}</p>` +
      `<p style="text-align:center;font-size:22px;font-weight:700" class="zhuyin-text">${ruby(reward.name)}</p>` +
      `<p class="hint" style="text-align:center">會用掉 ⭐ ${reward.cost} 點，並送出給家長確認。</p>`,
    okText: '兌換',
  });
  if (!ok) return;

  if (points() < reward.cost) {
    toast('點數不夠了');
    return;
  }

  playSound('coin');
  confetti(['🎁', '🎉', '⭐'], 20);
  await patchConfig((cfg) => {
    cfg.points[state.kidId] = Math.max(0, (cfg.points[state.kidId] || 0) - reward.cost);
    cfg.redemptions = [
      ...(cfg.redemptions || []),
      {
        id: rid(),
        kidId: state.kidId,
        rewardId: reward.id,
        name: reward.name,
        emoji: reward.emoji,
        cost: reward.cost,
        date: todayStr(),
        at: Date.now(),
        status: 'pending',
      },
    ].slice(-100);
  });
  toast('已送出，等家長確認 🎉');
  renderAll();
}

// =========================================================== 導覽

function switchView(view) {
  // 離開家長頁就鎖回去，避免 iPad 交給小孩時設定還是開著的
  if (state.view === 'parent' && view !== 'parent') lockParent();

  state.view = view;
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${view}`).classList.remove('hidden');
  $$('.tabbar-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('main').scrollTop = 0;
  if (view === 'parent') renderParent(ctx);
}

function wireEvents() {
  $$('.tabbar-btn').forEach((btn) => {
    btn.onclick = () => switchView(btn.dataset.view);
  });

  $('#day-prev').onclick = () => watchDay(addDays(state.date, -1));
  $('#day-next').onclick = () => {
    if (state.date < todayStr()) watchDay(addDays(state.date, 1));
  };

  $('#kid-switch').onclick = () => {
    const kids = state.config.kids;
    if (kids.length < 2) return;
    const idx = kids.findIndex((k) => k.id === state.kidId);
    state.kidId = kids[(idx + 1) % kids.length].id;
    renderAll();
    refreshStreak();
  };

  // 從月曆點某一天，跳到今日頁並顯示那天
  window.addEventListener('goto-date', (e) => watchDay(e.detail));

  // 從背景切回來時，如果已經跨日就自動跳到新的一天
  let lastKnownToday = todayStr();
  const checkRollover = () => {
    const now = todayStr();
    if (now === lastKnownToday) return;
    const wasOnToday = state.date === lastKnownToday;
    lastKnownToday = now;
    if (wasOnToday) watchDay(now);
  };
  setInterval(checkRollover, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkRollover();
      checkForUpdate(); // App 一直開著也要能發現新版
    }
  });
}

// =========================================================== 提供給家長頁

const ctx = {
  get config() { return state.config; },
  get kidId() { return state.kidId; },
  get date() { return state.date; },
  get streak() { return state.streak; },
  currentTasks,
  persistTasks,
  patchConfig,
  renderAll,
  switchView,
  switchFamily(code) {
    rememberFamilyCode(code);
    location.hash = `f=${code}`;
    location.reload();
  },
};

boot().catch((err) => {
  console.error(err);
  $('#boot').innerHTML =
    `<p style="padding:24px;text-align:center">啟動失敗 😢<br><span class="small">${escapeHTML(err.message)}</span></p>`;
  $('#boot').classList.remove('hidden');
});
