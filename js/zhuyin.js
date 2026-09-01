// 注音標注。
// 資料表由 tools/gen_zhuyin.py 產生，體積較大（約 250KB），所以採用動態載入，
// 只有在「注音」開啟時才會下載。

const TONES = '\u02CA\u02C7\u02CB\u02D9'; // ˊ ˇ ˋ ˙
const NEUTRAL = '\u02D9';

let charMap = null;
let phraseMap = null;
let maxPhraseLen = 2;
let loading = null;

export function isReady() {
  return charMap !== null;
}

/** 載入注音資料表，可重複呼叫，只會真正載入一次。 */
export function load() {
  if (charMap) return Promise.resolve();
  if (!loading) {
    loading = import('./zhuyin-data.js')
      .then(({ CHARS, CHAR_ZHUYIN, PHRASES }) => {
        const readings = CHAR_ZHUYIN.split('|');
        charMap = new Map();
        for (let i = 0; i < CHARS.length; i++) charMap.set(CHARS[i], readings[i]);

        phraseMap = new Map();
        for (const line of PHRASES.split('\n')) {
          const tab = line.indexOf('\t');
          if (tab < 1) continue;
          const word = line.slice(0, tab);
          phraseMap.set(word, line.slice(tab + 1).split(' '));
          if (word.length > maxPhraseLen) maxPhraseLen = word.length;
        }
      })
      .catch((err) => {
        console.warn('注音資料載入失敗，將不顯示注音', err);
        charMap = new Map();
        phraseMap = new Map();
      });
  }
  return loading;
}

function isHan(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
}

/**
 * 把一段文字拆成一個個字，並標上注音。
 * @param {string} text
 * @param {string} [override] 家長手動指定的注音，用空白分隔，一個中文字一組
 * @returns {{ch: string, sym: string, tone: string}[]}
 */
export function annotate(text, override) {
  const out = [];
  if (!text) return out;

  const manual = override ? override.trim().split(/\s+/).filter(Boolean) : null;
  let manualIdx = 0;

  // 沒載入資料表時，只有手動注音會生效
  const chars = charMap || new Map();
  const phrases = phraseMap || new Map();

  for (let i = 0; i < text.length; ) {
    const ch = text[i];

    if (!isHan(ch)) {
      out.push({ ch, sym: '', tone: '' });
      i += 1;
      continue;
    }

    // 1. 家長手動指定優先
    if (manual && manualIdx < manual.length) {
      out.push(split(manual[manualIdx++]));
      i += 1;
      continue;
    }

    // 2. 最長詞優先，用來處理破音字
    let matched = null;
    const maxN = Math.min(maxPhraseLen, text.length - i);
    for (let n = maxN; n >= 2; n--) {
      const seg = text.slice(i, i + n);
      const hit = phrases.get(seg);
      if (hit) {
        matched = { seg, hit };
        break;
      }
    }
    if (matched) {
      for (let k = 0; k < matched.seg.length; k++) {
        out.push({ ...split(matched.hit[k]), ch: matched.seg[k] });
      }
      i += matched.seg.length;
      continue;
    }

    // 3. 逐字查表
    out.push({ ...split(chars.get(ch) || ''), ch, fromChar: true });
    i += 1;
  }

  applySandhi(out);
  return out;
}

/** 把「ㄕㄨㄟˋ」拆成注音符號與聲調 */
function split(reading) {
  if (!reading) return { ch: '', sym: '', tone: '' };
  let sym = reading;
  let tone = '';
  for (const t of TONES) {
    if (sym.includes(t)) {
      tone = t;
      sym = sym.split(t).join('');
    }
  }
  return { ch: '', sym, tone };
}

/**
 * 「一」「不」的變調。
 * 只處理逐字查表得到的結果；若已由詞彙表比對出來（例如「一個」），就相信詞彙表。
 */
function applySandhi(items) {
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i];
    if (!cur.fromChar) continue;

    const next = items[i + 1];
    if (!next.sym) continue;

    if (cur.ch === '\u4E0D') {
      // 不：後面是四聲時讀二聲
      cur.tone = next.tone === '\u02CB' ? '\u02CA' : '\u02CB';
    } else if (cur.ch === '\u4E00') {
      // 一：序數（第一、一月）維持原調
      const prev = items[i - 1];
      if (prev && prev.ch === '\u7B2C') continue;
      cur.tone = next.tone === '\u02CB' ? '\u02CA' : '\u02CB';
    }
  }
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 產生帶注音的 HTML。注音為直排、置於國字右方（台灣課本排法）。
 * @param {string} text
 * @param {{override?: string, enabled?: boolean}} [opts]
 */
export function rubyHTML(text, opts = {}) {
  const { override, enabled = true } = opts;
  if (!text) return '';
  if (!enabled) return esc(text);

  return annotate(text, override)
    .map(({ ch, sym, tone }) => {
      if (!sym) return `<span class="zp">${esc(ch)}</span>`;
      // 輕聲的「˙」放在注音正上方，其餘聲調放在注音右下（台灣課本排法）。
      // DOM 順序固定為「注音 → 聲調」，複製或讀屏時才不會錯亂；
      // 視覺位置交給 CSS 的 flex-direction 處理。
      const neutral = tone === NEUTRAL;
      const toneHTML = tone ? `<b class="zt">${tone}</b>` : '';
      return (
        `<span class="z"><span class="zc">${esc(ch)}</span>` +
        `<span class="zb${neutral ? ' zb-neutral' : ''}">` +
        `<span class="zs">${esc(sym)}</span>${toneHTML}</span></span>`
      );
    })
    .join('');
}

/** 產生預設注音字串，供家長編輯時當作起始值 */
export function defaultReadingString(text) {
  return annotate(text)
    .filter((x) => x.sym)
    .map((x) => x.sym + x.tone)
    .join(' ');
}
