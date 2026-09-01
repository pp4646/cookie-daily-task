// 資料層。對外只暴露一組 API，內部依照有沒有填 Firebase 設定切換實作：
//   - local：資料存在瀏覽器 localStorage，開檔即用，不能跨裝置
//   - cloud：資料存在 Firestore，多裝置即時同步，並支援離線
//
// 資料結構
//   config  families/{code}/state/config
//   day     families/{code}/days/{YYYY-MM-DD}

import { DEFAULT_FAMILY_CODE, firebaseConfig, isCloudConfigured } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export const DEFAULT_CONFIG = () => ({
  schema: 1,
  parentPin: '1234',
  zhuyin: true,
  kidFont: 'hei',
  kids: [{ id: 'k1', name: 'Cookie', emoji: '🐶' }],
  points: { k1: 0 },
  templates: [
    tpl('k1', '刷牙洗臉', '🪥', 1),
    tpl('k1', '整理書包', '🎒', 2),
    tpl('k1', '寫功課', '✏️', 3),
    tpl('k1', '閱讀二十分鐘', '📖', 2),
    tpl('k1', '幫忙做家事', '🧹', 2),
  ],
  rewards: [
    { id: rid(), name: '看一集卡通', emoji: '📺', cost: 10, active: true },
    { id: rid(), name: '去公園玩', emoji: '🛝', cost: 20, active: true },
    { id: rid(), name: '選一本新書', emoji: '📚', cost: 40, active: true },
  ],
  redemptions: [],
});

function tpl(kidId, title, emoji, points) {
  return {
    id: rid(),
    kidId,
    title,
    emoji,
    points,
    zhuyin: '',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    active: true,
  };
}

export function rid() {
  return Math.random().toString(36).slice(2, 10);
}

export const store = {
  mode: 'local',
  familyCode: '',
  _impl: null,

  async init(code) {
    this.familyCode = code;
    this.mode = isCloudConfigured() ? 'cloud' : 'local';
    this._impl = this.mode === 'cloud' ? await cloudImpl(code) : localImpl(code);
  },

  onConfig(cb) { return this._impl.onConfig(cb); },
  onDay(date, cb) { return this._impl.onDay(date, cb); },
  saveConfig(cfg) { return this._impl.saveConfig(cfg); },
  saveDay(date, day) { return this._impl.saveDay(date, day); },
  getDays(dates) { return this._impl.getDays(dates); },
};

export function savedFamilyCode() {
  return localStorage.getItem('cookie.familyCode') || DEFAULT_FAMILY_CODE || '';
}

export function rememberFamilyCode(code) {
  localStorage.setItem('cookie.familyCode', code);
}

export function forgetFamilyCode() {
  localStorage.removeItem('cookie.familyCode');
}

// ---------------------------------------------------------------- 本機模式

function localImpl(code) {
  const key = (suffix) => `cookie.${code}.${suffix}`;
  const listeners = { config: new Set(), day: new Map() };

  const read = (k, fallback) => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (k, value) => localStorage.setItem(k, JSON.stringify(value));

  // 讓同一台裝置的不同分頁也能同步
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(`cookie.${code}.`)) return;
    if (e.key === key('config')) {
      const cfg = read(key('config'), null);
      listeners.config.forEach((cb) => cb(cfg));
    } else if (e.key.startsWith(key('day.'))) {
      const date = e.key.slice(key('day.').length);
      const set = listeners.day.get(date);
      if (set) set.forEach((cb) => cb(read(e.key, null)));
    }
  });

  return {
    onConfig(cb) {
      listeners.config.add(cb);
      queueMicrotask(() => cb(read(key('config'), null)));
      return () => listeners.config.delete(cb);
    },
    onDay(date, cb) {
      if (!listeners.day.has(date)) listeners.day.set(date, new Set());
      listeners.day.get(date).add(cb);
      queueMicrotask(() => cb(read(key(`day.${date}`), null)));
      return () => listeners.day.get(date)?.delete(cb);
    },
    async saveConfig(cfg) {
      write(key('config'), cfg);
      listeners.config.forEach((cb) => cb(cfg));
    },
    async saveDay(date, day) {
      write(key(`day.${date}`), day);
      listeners.day.get(date)?.forEach((cb) => cb(day));
    },
    async getDays(dates) {
      const out = new Map();
      for (const d of dates) {
        const v = read(key(`day.${d}`), null);
        if (v) out.set(d, v);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- 雲端模式

async function cloudImpl(code) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);

  // 離線也能開，回到網路會自動補傳
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });

  const a = auth.getAuth(app);
  await new Promise((resolve, reject) => {
    auth.onAuthStateChanged(a, (user) => {
      if (user) resolve(user);
    });
    auth.signInAnonymously(a).catch(reject);
  });

  const configRef = fs.doc(db, 'families', code, 'state', 'config');
  const dayRef = (date) => fs.doc(db, 'families', code, 'days', date);

  return {
    onConfig(cb) {
      return fs.onSnapshot(
        configRef,
        (snap) => cb(snap.exists() ? snap.data() : null),
        (err) => console.error('讀取設定失敗', err),
      );
    },
    onDay(date, cb) {
      return fs.onSnapshot(
        dayRef(date),
        (snap) => cb(snap.exists() ? snap.data() : null),
        (err) => console.error('讀取當日資料失敗', err),
      );
    },
    saveConfig(cfg) {
      return fs.setDoc(configRef, cfg);
    },
    saveDay(date, day) {
      return fs.setDoc(dayRef(date), day);
    },
    async getDays(dates) {
      if (!dates.length) return new Map();
      const sorted = [...dates].sort();
      const snap = await fs.getDocs(
        fs.query(
          fs.collection(db, 'families', code, 'days'),
          fs.orderBy(fs.documentId()),
          fs.startAt(sorted[0]),
          fs.endAt(sorted[sorted.length - 1]),
        ),
      );
      const out = new Map();
      snap.forEach((d) => out.set(d.id, d.data()));
      return out;
    },
  };
}
