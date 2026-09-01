// ===========================================================================
//  Firebase 設定
// ===========================================================================
//
//  【現在就想試用】不用改任何東西，直接開啟 index.html 就能用（資料存在瀏覽器）。
//
//  【要跨裝置同步】把下面 firebaseConfig 換成你自己專案的設定，步驟看 README.md。
//  只要 apiKey 有填，App 就會自動切換成雲端模式。
//
// ===========================================================================

export const firebaseConfig = {
  apiKey: 'AIzaSyCRPOEWt6b8QeriXMagUYH9jn5utEMUvCo',
  authDomain: 'cookie-s-daily-task.firebaseapp.com',
  projectId: 'cookie-s-daily-task',
  storageBucket: 'cookie-s-daily-task.firebasestorage.app',
  messagingSenderId: '696121459760',
  appId: '1:696121459760:web:aa61816cea1cacfd1299f5',
};

/** 預設家庭代碼；留空的話第一次開啟會請使用者輸入。 */
export const DEFAULT_FAMILY_CODE = '';

export const isCloudConfigured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
