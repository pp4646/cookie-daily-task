// 家長專區：PIN 解鎖、任務／獎品管理、兌換核准、月曆紀錄、設定。

import { rid, store } from './store.js';
import { VERSION, VERSION_DATE } from './version.js';
import {
  $, $$, addDays, confirmBox, defaultReadingString, escapeHTML, modal, pad2,
  parseDate, ruby, setZhuyinEnabled, toast, todayStr, weekdayName,
} from './ui.js';

const TASK_EMOJIS = ['🪥', '🛏️', '🎒', '✏️', '📖', '🧹', '🍚', '🚿', '🎹', '⚽',
  '🏃', '🧩', '🐶', '🌱', '🧸', '💧', '🗑️', '👕', '🧮', '🎨'];
const REWARD_EMOJIS = ['🎁', '📺', '🍦', '🛝', '📚', '🎮', '🍿', '🚲', '🧁', '🎬',
  '🏊', '🎠', '🪀', '🍫', '🦖', '⭐'];
const KID_EMOJIS = ['🐶', '🐱', '🐼', '🦊', '🐯', '🐰', '🐨', '🦁', '🐵', '🐸'];

let unlocked = false;
let activeTab = 'tasks';
let calMonth = null; // {y, m}
let CTX = null;

/** 每一個變更都會馬上寫入，這裡只負責讓家長看得到已經存好了 */
async function save(mutate, message) {
  await CTX.patchConfig(mutate);
  CTX.renderAll();
  renderParent(CTX);
  toast(message);
}

export function initParent(ctx) {
  CTX = ctx;
  wirePinPad();
  $$('#parent-tabs .tab').forEach((tab) => {
    tab.onclick = () => {
      activeTab = tab.dataset.tab;
      renderParent(CTX);
    };
  });
}

export function renderParent(ctx) {
  CTX = ctx;
  if (!ctx.config) return;

  $('#pin-gate').classList.toggle('hidden', unlocked);
  $('#parent-body').classList.toggle('hidden', !unlocked);

  const pending = (ctx.config.redemptions || []).filter((r) => r.status === 'pending').length;
  $('#approve-dot').classList.toggle('hidden', pending === 0);

  if (!unlocked) return;

  $$('#parent-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === activeTab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== activeTab));

  if (activeTab === 'tasks') renderTasksPanel();
  else if (activeTab === 'rewards') renderRewardsPanel();
  else if (activeTab === 'approve') renderApprovePanel();
  else if (activeTab === 'history') renderHistoryPanel();
  else if (activeTab === 'settings') renderSettingsPanel();
}

// ------------------------------------------------------------------ PIN

function wirePinPad() {
  let entered = '';
  const dots = $$('#pin-dots i');

  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < entered.length));

  $('#pin-pad').onclick = (e) => {
    const key = e.target.closest('button')?.dataset.k;
    if (!key) return;
    $('#pin-err').classList.add('hidden');

    if (key === 'clear') entered = '';
    else if (key === 'del') entered = entered.slice(0, -1);
    else if (entered.length < 4) entered += key;
    paint();

    if (entered.length === 4) {
      if (entered === (CTX.config.parentPin || '1234')) {
        unlocked = true;
        entered = '';
        paint();
        renderParent(CTX);
      } else {
        $('#pin-err').classList.remove('hidden');
        entered = '';
        setTimeout(paint, 250);
      }
    }
  };
}

// ------------------------------------------------------------------ 任務

function renderTasksPanel() {
  const cfg = CTX.config;
  const kidId = CTX.kidId;

  const box = $('#tpl-list');
  box.innerHTML = '';
  const templates = cfg.templates.filter((t) => t.kidId === kidId);
  if (!templates.length) box.innerHTML = '<p class="hint small">還沒有每日任務。</p>';

  for (const t of templates) {
    const days = (t.weekdays || []).length === 7
      ? '每天'
      : (t.weekdays || []).map(weekdayName).join('、') || '未設定';
    const row = document.createElement('div');
    row.className = `admin-row${t.active === false ? ' off' : ''}`;
    row.innerHTML =
      `<span style="font-size:26px">${escapeHTML(t.emoji)}</span>` +
      `<span class="grow"><div class="name">${escapeHTML(t.title)}</div>` +
      `<div class="meta">${days} · ${t.points} 點</div></span>` +
      `<button class="icon-btn" title="開啟或關閉">${t.active === false ? '🚫' : '✅'}</button>` +
      `<button class="icon-btn" title="編輯">✏️</button>` +
      `<button class="icon-btn" title="刪除">🗑️</button>`;
    const [toggle, edit, del] = row.querySelectorAll('.icon-btn');

    toggle.onclick = () =>
      save((c) => {
        const item = c.templates.find((x) => x.id === t.id);
        item.active = item.active === false;
      }, t.active === false ? `已開啟「${t.title}」` : `已關閉「${t.title}」`);

    edit.onclick = async () => {
      const result = await taskDialog('編輯每日任務', t, true);
      if (!result) return;
      await save((c) => {
        Object.assign(c.templates.find((x) => x.id === t.id), result);
      }, '已儲存 ✓');
    };

    del.onclick = async () => {
      if (!(await confirmBox('刪除任務', `確定要刪除「${t.title}」嗎？已完成的紀錄會保留。`, '刪除'))) return;
      await save((c) => {
        c.templates = c.templates.filter((x) => x.id !== t.id);
      }, '已刪除');
    };

    box.appendChild(row);
  }

  $('#tpl-add').onclick = async () => {
    const result = await taskDialog('新增每日任務', null, true);
    if (!result) return;
    await save((c) => {
      c.templates.push({ id: rid(), kidId, active: true, ...result });
    }, `已新增「${result.title}」`);
  };

  // 今日臨時任務
  const onceBox = $('#once-list');
  onceBox.innerHTML = '';
  const tasks = CTX.currentTasks();
  const onceTasks = tasks.filter((t) => !t.templateId);
  if (!onceTasks.length) onceBox.innerHTML = '<p class="hint small">今天沒有臨時任務。</p>';

  for (const t of onceTasks) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML =
      `<span style="font-size:26px">${escapeHTML(t.emoji)}</span>` +
      `<span class="grow"><div class="name">${escapeHTML(t.title)}</div>` +
      `<div class="meta">${t.points} 點 · ${t.done ? '已完成' : '未完成'}</div></span>` +
      '<button class="icon-btn" title="刪除">🗑️</button>';
    row.querySelector('.icon-btn').onclick = async () => {
      await CTX.persistTasks(CTX.currentTasks().filter((x) => x.id !== t.id));
      CTX.renderAll();
      renderParent(CTX);
      toast('已刪除');
    };
    onceBox.appendChild(row);
  }

  $('#once-add').onclick = async () => {
    const result = await taskDialog('新增今日臨時任務', null, false);
    if (!result) return;
    await CTX.persistTasks([
      ...CTX.currentTasks(),
      { id: rid(), templateId: null, done: false, doneAt: null, ...result },
    ]);
    CTX.renderAll();
    renderParent(CTX);
    toast(`已新增「${result.title}」`);
  };
}

// ------------------------------------------------------------------ 獎品

function renderRewardsPanel() {
  const box = $('#reward-admin-list');
  box.innerHTML = '';
  const rewards = CTX.config.rewards || [];
  if (!rewards.length) box.innerHTML = '<p class="hint small">還沒有獎品。</p>';

  for (const r of rewards) {
    const row = document.createElement('div');
    row.className = `admin-row${r.active === false ? ' off' : ''}`;
    row.innerHTML =
      `<span style="font-size:26px">${escapeHTML(r.emoji)}</span>` +
      `<span class="grow"><div class="name">${escapeHTML(r.name)}</div>` +
      `<div class="meta">⭐ ${r.cost} 點</div></span>` +
      `<button class="icon-btn">${r.active === false ? '🚫' : '✅'}</button>` +
      '<button class="icon-btn">✏️</button><button class="icon-btn">🗑️</button>';
    const [toggle, edit, del] = row.querySelectorAll('.icon-btn');

    toggle.onclick = () =>
      save((c) => {
        const item = c.rewards.find((x) => x.id === r.id);
        item.active = item.active === false;
      }, r.active === false ? `已開啟「${r.name}」` : `已關閉「${r.name}」`);

    edit.onclick = async () => {
      const result = await rewardDialog('編輯獎品', r);
      if (!result) return;
      await save((c) => Object.assign(c.rewards.find((x) => x.id === r.id), result), '已儲存 ✓');
    };

    del.onclick = async () => {
      if (!(await confirmBox('刪除獎品', `確定要刪除「${r.name}」嗎？`, '刪除'))) return;
      await save((c) => {
        c.rewards = c.rewards.filter((x) => x.id !== r.id);
      }, '已刪除');
    };

    box.appendChild(row);
  }

  $('#reward-add').onclick = async () => {
    const result = await rewardDialog('新增獎品', null);
    if (!result) return;
    await save((c) => c.rewards.push({ id: rid(), active: true, ...result }), `已新增「${result.name}」`);
  };
}

// ------------------------------------------------------------------ 兌換核准

function renderApprovePanel() {
  const all = CTX.config.redemptions || [];
  const kidName = (id) => CTX.config.kids.find((k) => k.id === id)?.name || '?';

  const pendingBox = $('#approve-list');
  pendingBox.innerHTML = '';
  const pending = all.filter((r) => r.status === 'pending').reverse();
  if (!pending.length) pendingBox.innerHTML = '<p class="hint small">目前沒有待處理的兌換。</p>';

  for (const item of pending) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML =
      `<span style="font-size:26px">${escapeHTML(item.emoji || '🎁')}</span>` +
      `<span class="grow"><div class="name">${escapeHTML(item.name)}</div>` +
      `<div class="meta">${kidName(item.kidId)} · ${item.date} · ⭐ ${item.cost} 點</div></span>` +
      '<button class="icon-btn" title="核准">✅</button>' +
      '<button class="icon-btn" title="退回並退還點數">↩️</button>';
    const [approve, reject] = row.querySelectorAll('.icon-btn');

    approve.onclick = async () => {
      await setRedemption(item.id, 'approved');
      toast('已核准 🎉');
    };
    reject.onclick = async () => {
      await setRedemption(item.id, 'rejected', item);
      toast('已退回，點數已退還');
    };
    pendingBox.appendChild(row);
  }

  const histBox = $('#approve-history');
  histBox.innerHTML = '';
  const history = all.filter((r) => r.status !== 'pending').slice(-20).reverse();
  if (!history.length) histBox.innerHTML = '<p class="hint small">還沒有紀錄。</p>';
  const label = { approved: '已兌換', rejected: '已退回' };
  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML =
      `<span style="font-size:22px">${escapeHTML(item.emoji || '🎁')}</span>` +
      `<span class="grow"><div class="name">${escapeHTML(item.name)}</div>` +
      `<div class="meta">${kidName(item.kidId)} · ${item.date}</div></span>` +
      `<span class="tag ${item.status}">${label[item.status]}</span>`;
    histBox.appendChild(row);
  }
}

async function setRedemption(id, status, refundItem) {
  await CTX.patchConfig((c) => {
    const item = c.redemptions.find((x) => x.id === id);
    if (item) item.status = status;
    if (status === 'rejected' && refundItem) {
      c.points[refundItem.kidId] = (c.points[refundItem.kidId] || 0) + refundItem.cost;
    }
  });
  CTX.renderAll();
}

// ------------------------------------------------------------------ 月曆紀錄

async function renderHistoryPanel() {
  if (!calMonth) {
    const now = new Date();
    calMonth = { y: now.getFullYear(), m: now.getMonth() };
  }
  const { y, m } = calMonth;
  $('#cal-title').textContent = `${y} 年 ${m + 1} 月`;

  $('#cal-prev').onclick = () => {
    calMonth = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
    renderHistoryPanel();
  };
  $('#cal-next').onclick = () => {
    const next = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
    if (new Date(next.y, next.m, 1) > new Date()) return;
    calMonth = next;
    renderHistoryPanel();
  };

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) dates.push(`${y}-${pad2(m + 1)}-${pad2(d)}`);

  const docs = await store.getDays(dates);
  const grid = $('#cal-grid');
  grid.innerHTML = '';

  const firstWeekday = new Date(y, m, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) grid.appendChild(cell('blank', ''));

  let fullDays = 0;
  let totalTasks = 0;
  let doneTasks = 0;
  const today = todayStr();

  for (const date of dates) {
    const tasks = docs.get(date)?.kids?.[CTX.kidId]?.tasks || [];
    const done = tasks.filter((t) => t.done).length;
    let cls = 'none';
    if (tasks.length && done === tasks.length) {
      cls = 'full';
      fullDays++;
    } else if (done > 0) {
      cls = 'part';
    }
    totalTasks += tasks.length;
    doneTasks += done;

    const node = cell(cls, `${parseDate(date).getDate()}`);
    if (tasks.length) node.appendChild(Object.assign(document.createElement('small'), {
      textContent: `${done}/${tasks.length}`,
    }));
    if (date === today) node.classList.add('today');
    if (date > today) node.style.opacity = '0.35';
    node.onclick = () => {
      CTX.switchView('today');
      window.dispatchEvent(new CustomEvent('goto-date', { detail: date }));
    };
    grid.appendChild(node);
  }

  const rate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  $('#cal-stats').innerHTML =
    `<p><b>全部完成的天數</b>：${fullDays} 天</p>` +
    `<p><b>任務完成率</b>：${rate}%（${doneTasks} / ${totalTasks}）</p>` +
    `<p><b>目前連續達成</b>：${CTX.streak} 天</p>`;
}

function cell(cls, text) {
  const node = document.createElement('div');
  node.className = `cal-cell ${cls}`;
  if (text) node.appendChild(document.createTextNode(text));
  return node;
}

// ------------------------------------------------------------------ 設定

function renderSettingsPanel() {
  const cfg = CTX.config;

  const kidBox = $('#kid-admin-list');
  kidBox.innerHTML = '';
  for (const kid of cfg.kids) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML =
      `<span style="font-size:26px">${escapeHTML(kid.emoji)}</span>` +
      `<span class="grow"><div class="name">${escapeHTML(kid.name)}</div>` +
      `<div class="meta">⭐ ${cfg.points[kid.id] || 0} 點</div></span>` +
      '<button class="icon-btn">✏️</button>' +
      (cfg.kids.length > 1 ? '<button class="icon-btn">🗑️</button>' : '');
    const buttons = row.querySelectorAll('.icon-btn');

    buttons[0].onclick = async () => {
      const result = await kidDialog('編輯小孩', kid);
      if (!result) return;
      await save((c) => Object.assign(c.kids.find((k) => k.id === kid.id), result), '已儲存 ✓');
    };
    if (buttons[1]) {
      buttons[1].onclick = async () => {
        if (!(await confirmBox('刪除小孩', `確定要刪除「${kid.name}」和相關的任務設定嗎？`, '刪除'))) return;
        await save((c) => {
          c.kids = c.kids.filter((k) => k.id !== kid.id);
          c.templates = c.templates.filter((t) => t.kidId !== kid.id);
          delete c.points[kid.id];
        }, '已刪除');
      };
    }
    kidBox.appendChild(row);
  }

  $('#kid-add').onclick = async () => {
    const result = await kidDialog('新增小孩', null);
    if (!result) return;
    await save((c) => {
      const id = rid();
      c.kids.push({ id, ...result });
      c.points[id] = 0;
    }, `已新增「${result.name}」`);
  };

  $('#adj-go').onclick = async () => {
    const input = $('#adj-points');
    const delta = parseInt(input.value, 10);
    if (Number.isNaN(delta) || delta === 0) return toast('請輸入要加減的點數');
    input.value = '';
    await save((c) => {
      c.points[CTX.kidId] = Math.max(0, (c.points[CTX.kidId] || 0) + delta);
    }, delta > 0 ? `已加 ${delta} 點` : `已扣 ${-delta} 點`);
  };

  $('#pin-save').onclick = async () => {
    const value = $('#new-pin').value.trim();
    if (!/^\d{4}$/.test(value)) return toast('請輸入 4 位數字');
    $('#new-pin').value = '';
    await save((c) => {
      c.parentPin = value;
    }, '密碼已更新 ✓');
  };

  $('#info-mode').textContent = store.mode === 'cloud' ? '雲端同步 (Firebase)' : '本機模式';
  $('#info-code').textContent = store.familyCode;
  $('#info-version').textContent = `${VERSION}（${VERSION_DATE}）`;

  renderSwitches();

  $('#btn-export').onclick = exportBackup;
  $('#btn-logout').onclick = async () => {
    if (!(await confirmBox('切換家庭代碼', '之後要重新輸入代碼。本機模式的資料會留在這台裝置上。', '切換'))) return;
    CTX.resetFamily();
  };
}

function renderSwitches() {
  const cfg = CTX.config;

  const zhuyinBtn = $('#sw-zhuyin');
  zhuyinBtn.classList.toggle('on', cfg.zhuyin !== false);
  zhuyinBtn.onclick = async () => {
    const next = cfg.zhuyin === false;
    setZhuyinEnabled(next);
    await save((c) => {
      c.zhuyin = next;
    }, next ? '已開啟注音' : '已關閉注音');
  };

  $$('#font-seg button').forEach((btn) => {
    btn.classList.toggle('sel', (cfg.kidFont || 'hei') === btn.dataset.font);
    btn.onclick = async () => {
      document.documentElement.style.setProperty(
        '--font-kid',
        btn.dataset.font === 'kai' ? 'var(--font-kai)' : 'var(--font-ui)',
      );
      await save((c) => {
        c.kidFont = btn.dataset.font;
      }, btn.dataset.font === 'kai' ? '已改用標楷體' : '已改用黑體');
    };
  });
}

async function exportBackup() {
  const today = todayStr();
  const dates = [];
  for (let i = 0; i < 400; i++) dates.push(addDays(today, -i));
  const docs = await store.getDays(dates);

  const payload = {
    app: 'cookie-daily-challenge',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    familyCode: store.familyCode,
    config: CTX.config,
    days: Object.fromEntries(docs),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `cookie-backup-${today}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('備份已下載');
}

// ------------------------------------------------------------------ 編輯彈窗

function emojiPickerHTML(list, selected) {
  return `<div class="emoji-picker">${list
    .map((e) => `<button type="button" data-emoji="${e}" class="${e === selected ? 'sel' : ''}">${e}</button>`)
    .join('')}</div>`;
}

function wireEmojiPicker(body) {
  body.querySelector('.emoji-picker').onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    body.querySelectorAll('.emoji-picker button').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel');
  };
}

function selectedEmoji(body, fallback) {
  return body.querySelector('.emoji-picker button.sel')?.dataset.emoji || fallback;
}

/** 標題 + 注音欄位（含即時預覽） */
function titleFieldsHTML(title, zhuyinOverride) {
  return (
    `<div class="field"><label>名稱</label>` +
    `<input class="big-input" id="f-title" value="${escapeHTML(title)}" placeholder="例如：整理書包"></div>` +
    `<div class="field"><label>小孩看到的樣子</label><div class="preview zhuyin-text" id="f-preview"></div></div>` +
    `<div class="field"><label>注音（自動判斷，需要時可以自己改）</label>` +
    `<input class="big-input" id="f-zhuyin" value="${escapeHTML(zhuyinOverride || '')}" ` +
    `placeholder="留空就用自動判斷" autocapitalize="off" spellcheck="false">` +
    `<p class="hint small" id="f-auto"></p></div>`
  );
}

function wireTitleFields(body) {
  const title = body.querySelector('#f-title');
  const override = body.querySelector('#f-zhuyin');
  const preview = body.querySelector('#f-preview');
  const auto = body.querySelector('#f-auto');

  const update = () => {
    preview.innerHTML = ruby(title.value, override.value.trim());
    auto.textContent = title.value ? `自動判斷：${defaultReadingString(title.value)}` : '';
  };
  title.oninput = update;
  override.oninput = update;
  update();
}

function taskDialog(heading, initial, withWeekdays) {
  const weekdays = initial?.weekdays || [0, 1, 2, 3, 4, 5, 6];
  return modal({
    title: heading,
    bodyHTML:
      `<div class="field"><label>圖示</label>${emojiPickerHTML(TASK_EMOJIS, initial?.emoji || '⭐')}</div>` +
      titleFieldsHTML(initial?.title || '', initial?.zhuyin) +
      `<div class="field"><label>完成可得幾點</label>` +
      `<input class="big-input" id="f-points" type="number" inputmode="numeric" min="1" max="99" ` +
      `value="${initial?.points ?? 2}"></div>` +
      (withWeekdays
        ? `<div class="field"><label>星期幾要做</label><div class="weekday-picker">${[0, 1, 2, 3, 4, 5, 6]
            .map((d) => `<button type="button" data-day="${d}" class="${weekdays.includes(d) ? 'sel' : ''}">${weekdayName(d)}</button>`)
            .join('')}</div></div>`
        : ''),
    onOpen: (body) => {
      wireEmojiPicker(body);
      wireTitleFields(body);
      const picker = body.querySelector('.weekday-picker');
      if (picker) {
        picker.onclick = (e) => {
          const btn = e.target.closest('button');
          if (btn) btn.classList.toggle('sel');
        };
      }
    },
    validate: (body) => {
      const title = body.querySelector('#f-title').value.trim();
      if (!title) {
        toast('請輸入名稱');
        return null;
      }
      const points = Math.max(1, parseInt(body.querySelector('#f-points').value, 10) || 1);
      const days = [...body.querySelectorAll('.weekday-picker button.sel')].map((b) => Number(b.dataset.day));
      if (withWeekdays && !days.length) {
        toast('至少要選一天');
        return null;
      }
      const result = {
        title,
        emoji: selectedEmoji(body, '⭐'),
        points,
        zhuyin: body.querySelector('#f-zhuyin').value.trim(),
      };
      if (withWeekdays) result.weekdays = days.sort();
      return result;
    },
  });
}

function rewardDialog(heading, initial) {
  return modal({
    title: heading,
    bodyHTML:
      `<div class="field"><label>圖示</label>${emojiPickerHTML(REWARD_EMOJIS, initial?.emoji || '🎁')}</div>` +
      titleFieldsHTML(initial?.name || '', initial?.zhuyin) +
      `<div class="field"><label>需要幾點才能換</label>` +
      `<input class="big-input" id="f-cost" type="number" inputmode="numeric" min="1" ` +
      `value="${initial?.cost ?? 10}"></div>`,
    onOpen: (body) => {
      wireEmojiPicker(body);
      wireTitleFields(body);
    },
    validate: (body) => {
      const name = body.querySelector('#f-title').value.trim();
      if (!name) {
        toast('請輸入名稱');
        return null;
      }
      return {
        name,
        emoji: selectedEmoji(body, '🎁'),
        cost: Math.max(1, parseInt(body.querySelector('#f-cost').value, 10) || 1),
        zhuyin: body.querySelector('#f-zhuyin').value.trim(),
      };
    },
  });
}

function kidDialog(heading, initial) {
  return modal({
    title: heading,
    bodyHTML:
      `<div class="field"><label>圖示</label>${emojiPickerHTML(KID_EMOJIS, initial?.emoji || '🐶')}</div>` +
      `<div class="field"><label>名字</label>` +
      `<input class="big-input" id="f-name" value="${escapeHTML(initial?.name || '')}" placeholder="例如：Cookie"></div>`,
    onOpen: wireEmojiPicker,
    validate: (body) => {
      const name = body.querySelector('#f-name').value.trim();
      if (!name) {
        toast('請輸入名字');
        return null;
      }
      return { name, emoji: selectedEmoji(body, '🐶') };
    },
  });
}
