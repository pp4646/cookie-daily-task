// 共用的小工具：DOM、日期、彈窗、音效、動畫、注音包裝。

import * as zhuyin from './zhuyin.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ------------------------------------------------------------------ 日期

export const pad2 = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayName(idx) {
  return WEEK[idx];
}

export function prettyDate(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEK[d.getDay()]}`;
}

export function dayLabel(str) {
  const t = todayStr();
  if (str === t) return '今天';
  if (str === addDays(t, -1)) return '昨天';
  if (str === addDays(t, 1)) return '明天';
  return `${parseDate(str).getMonth() + 1}/${parseDate(str).getDate()}`;
}

// ------------------------------------------------------------------ 注音

let zhuyinOn = true;

export function setZhuyinEnabled(on) {
  zhuyinOn = on;
  if (on) zhuyin.load();
}

export function zhuyinEnabled() {
  return zhuyinOn;
}

/** 產生帶注音的 HTML；注音關閉時回傳純文字 */
export function ruby(text, override) {
  return zhuyin.rubyHTML(text, { override, enabled: zhuyinOn });
}

export const loadZhuyin = zhuyin.load;
export const defaultReadingString = zhuyin.defaultReadingString;

// ------------------------------------------------------------------ 提示

let toastTimer = null;

export function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 2200);
}

// ------------------------------------------------------------------ 彈窗

/**
 * 顯示彈窗。
 * @param {{title: string, bodyHTML: string, okText?: string, cancelText?: string,
 *          onOpen?: (body: HTMLElement) => void,
 *          validate?: (body: HTMLElement) => any}} opts
 * @returns {Promise<any|null>} 按確定時回傳 validate() 的結果，取消則為 null
 */
export function modal(opts) {
  return new Promise((resolve) => {
    const overlay = $('#modal');
    const body = $('#modal-body');
    const ok = $('#modal-ok');
    const cancel = $('#modal-cancel');

    $('#modal-title').textContent = opts.title;
    body.innerHTML = opts.bodyHTML;
    ok.textContent = opts.okText || '確定';
    cancel.textContent = opts.cancelText || '取消';
    overlay.classList.remove('hidden');
    opts.onOpen?.(body);

    const close = (value) => {
      overlay.classList.add('hidden');
      ok.onclick = null;
      cancel.onclick = null;
      overlay.onclick = null;
      resolve(value);
    };

    ok.onclick = () => {
      const value = opts.validate ? opts.validate(body) : true;
      if (value === undefined || value === null) return; // 驗證沒過就不關
      close(value);
    };
    cancel.onclick = () => close(null);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(null);
    };
  });
}

export function confirmBox(title, message, okText = '確定') {
  return modal({
    title,
    bodyHTML: `<p class="hint">${escapeHTML(message)}</p>`,
    okText,
  });
}

// ------------------------------------------------------------------ 音效

let audioCtx = null;

function tone(freq, start, duration, gain = 0.12) {
  const osc = audioCtx.createOscillator();
  const vol = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(0, audioCtx.currentTime + start);
  vol.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + start + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
  osc.connect(vol).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + duration + 0.02);
}

/** 用 Web Audio 即時合成，不需要音檔 */
export function playSound(kind) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (kind === 'check') {
      tone(880, 0, 0.12);
      tone(1320, 0.07, 0.16);
    } else if (kind === 'uncheck') {
      tone(520, 0, 0.1, 0.07);
    } else if (kind === 'win') {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.32, 0.14));
    } else if (kind === 'coin') {
      tone(988, 0, 0.1);
      tone(1319, 0.08, 0.24);
    }
  } catch {
    /* 音效失敗不影響功能 */
  }
}

// ------------------------------------------------------------------ 彩帶

export function confetti(emojis = ['⭐', '🎉', '🎊', '💛', '🌟'], count = 28) {
  const box = $('#confetti');
  for (let i = 0; i < count; i++) {
    const bit = el('i', null, emojis[i % emojis.length]);
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    bit.style.animationDelay = `${Math.random() * 0.5}s`;
    bit.style.fontSize = `${18 + Math.random() * 20}px`;
    box.appendChild(bit);
    setTimeout(() => bit.remove(), 3600);
  }
}
