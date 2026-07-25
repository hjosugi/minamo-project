// Minimal, framework-free runtime i18n for the product UIs (#267).
//
// EN/JA string tables selected by navigator.language, with a manual override
// persisted in localStorage. Every key must exist in both languages — this is
// enforced by a structure test (mirroring the docs i18n checker). Apply to
// markup with `data-i18n="key"` (textContent) and
// `data-i18n-attr="placeholder:key;aria-label:key2"` (attributes).

export const SUPPORTED_LANGUAGES = ['en', 'ja'];
const STORAGE_KEY = 'minamo.lang';

export const MESSAGES = {
  en: {
    'lang.toggle': '日本語',
    'lang.toggle.aria': 'Switch to Japanese',
    'landing.nav.tryIt': 'How to try',
    'landing.nav.signals': 'Signals shown',
    'landing.nav.tracker': 'Real tracker',
    'landing.nav.docs': 'Docs',
    'landing.hero.eyebrow': 'Camera optional · mock signal demo',
    'landing.hero.title1': 'Face, fingers, drums.',
    'landing.hero.title2': 'See it move in 30 seconds.',
    'landing.hero.lead': 'A UI demo that visualizes the face, hand, and drum signals Minamo handles. Allow the camera and it overlays your video; deny it and the mock animation still runs.',
    'landing.hero.disclosurePre': 'This page’s skeleton and numbers are simulated. Real MediaPipe inference is in the ',
    'landing.hero.disclosurePost': '.',
    'landing.hero.startDemo': 'Start the demo',
    'landing.hero.openTracker': 'Open the real tracker',
    'landing.hero.readSteps': 'Read the steps',
    'landing.metrics.fps': 'demo fps',
    'landing.metrics.confidence': 'mock confidence',
    'landing.metrics.hits': 'mock drum hits',
    'landing.demo.note': 'Camera video is shown only on your device — never uploaded or stored.',
    'landing.quickstart.eyebrow': 'Three ways to try',
    'landing.quickstart.heading': 'After the demo, send real data to the Viewer.',
    'landing.quickstart.step1.title': 'UI demo',
    'landing.quickstart.step1.body': 'Just press “Start the demo” above. The camera is optional.',
    'landing.quickstart.step2.title': 'Tracker',
    'landing.quickstart.step2.body': 'Start the camera and Connect in local mode.',
    'landing.quickstart.step3.title': 'Viewer',
    'landing.quickstart.step3.body': 'Open it in another tab of the same browser and drive the built-in bot or your own avatar.',
    'landing.quickstart.toTracker': 'To the Tracker',
    'landing.quickstart.toViewer': 'To the Viewer',
    'landing.cards.hands.title': 'Hands & fingers',
    'landing.cards.hands.body': 'Left/right hands, per-finger joints, curl, spread, pinch, velocity, and occlusion state.',
    'landing.cards.face.title': 'Face, eyes, mouth',
    'landing.cards.face.body': 'Head pose, blink, gaze, mouth open/width/pucker, and smile — all stabilized.',
    'landing.cards.drums.title': 'Drums',
    'landing.cards.drums.body': 'Stick trajectory, drum heads, hit velocity, audio onsets, and pedal fusion.',
    'landing.cards.stability.title': 'Anti-breakage',
    'landing.cards.stability.body': 'One Euro filtering, outlier rejection, velocity limits, anatomy constraints, and occlusion recovery.',
    'landing.privacy.eyebrow': 'Privacy',
    'landing.privacy.heading': 'Designed to never upload your video.',
    'landing.privacy.bodyPre': 'This demo and the Tracker process camera video in the browser. Even over the network, only motion parameters go to the Viewer. See the ',
    'landing.privacy.link': 'privacy design',
    'landing.privacy.bodyPost': ' for details.',
    'landing.footer.tagline': 'Local-first, privacy-first, streamer-first.',
    'landing.demo.running': 'Demo running',
    'tracker.camera.denied': 'Camera permission was denied. Allow camera access in the browser settings and try again.',
    'tracker.camera.notFound': 'No camera device was found. Connect a camera and press refresh/start again.',
    'tracker.camera.https': 'Camera requires HTTPS or localhost. See docs/DEV_HTTPS.md for local HTTPS setup.',
    'tracker.camera.failed': 'Camera startup failed.',
    'tracker.capability.insecureContext': 'Camera access requires HTTPS or localhost. See docs/DEV_HTTPS.md.',
    'tracker.capability.noCameraApi': 'Camera API unavailable in this browser/context.',
    'tracker.capability.noWebgl2': 'WebGL2 unavailable; GPU MediaPipe will not start.',
    'tracker.capability.noWebtransport': 'WebTransport unsupported; wt mode is disabled.',
  },
  ja: {
    'lang.toggle': 'English',
    'lang.toggle.aria': '英語に切り替える',
    'landing.nav.tryIt': '試し方',
    'landing.nav.signals': '表示する信号',
    'landing.nav.tracker': '実トラッカー',
    'landing.nav.docs': 'Docs',
    'landing.hero.eyebrow': 'Camera optional · mock signal demo',
    'landing.hero.title1': '顔、指、ドラム。',
    'landing.hero.title2': 'まずは動くところを30秒で。',
    'landing.hero.lead': 'Minamoが扱う顔・手・ドラム信号を可視化するUIデモです。カメラを許可すると映像の上に重なり、許可しなくてもモックアニメーションだけで動きます。',
    'landing.hero.disclosurePre': 'このページの骨格と数値はシミュレーションです。実際のMediaPipe推論は',
    'landing.hero.disclosurePost': 'で試せます。',
    'landing.hero.startDemo': 'デモを開始',
    'landing.hero.openTracker': '実トラッカーを開く',
    'landing.hero.readSteps': '手順を読む',
    'landing.metrics.fps': 'demo fps',
    'landing.metrics.confidence': 'mock confidence',
    'landing.metrics.hits': 'mock drum hits',
    'landing.demo.note': 'カメラ映像は端末内だけで表示され、送信・保存されません。',
    'landing.quickstart.eyebrow': 'Three ways to try',
    'landing.quickstart.heading': 'デモの次は、実データをViewerへ。',
    'landing.quickstart.step1.title': 'UIデモ',
    'landing.quickstart.step1.body': '上の「デモを開始」を押すだけ。カメラは任意です。',
    'landing.quickstart.step2.title': 'Tracker',
    'landing.quickstart.step2.body': 'カメラを開始し、localモードでConnectします。',
    'landing.quickstart.step3.title': 'Viewer',
    'landing.quickstart.step3.body': '同じブラウザの別タブで開き、内蔵ボットや自分のアバターを動かします。',
    'landing.quickstart.toTracker': 'Trackerへ',
    'landing.quickstart.toViewer': 'Viewerへ',
    'landing.cards.hands.title': '手と指',
    'landing.cards.hands.body': '左右の手、指ごとの関節、curl、spread、pinch、速度、遮蔽状態を扱います。',
    'landing.cards.face.title': '顔・目・口',
    'landing.cards.face.body': '頭部姿勢、blink、gaze、口の開き・幅・丸め、smileなどを安定化します。',
    'landing.cards.drums.title': 'ドラム',
    'landing.cards.drums.body': 'スティック軌道、打面、hit velocity、音声onset、ペダルの統合を目指します。',
    'landing.cards.stability.title': '破綻防止',
    'landing.cards.stability.body': 'One Euro Filter、外れ値除去、速度制限、解剖学的制約、遮蔽復帰を重ねます。',
    'landing.privacy.eyebrow': 'Privacy',
    'landing.privacy.heading': '映像をアップロードしない設計。',
    'landing.privacy.bodyPre': 'このデモとTrackerのカメラ映像はブラウザ内で処理されます。ネットワーク接続を使う場合も、Viewerへ渡すのはモーションパラメータです。詳しくは',
    'landing.privacy.link': 'プライバシー設計',
    'landing.privacy.bodyPost': 'を参照してください。',
    'landing.footer.tagline': 'Local-first, privacy-first, streamer-first.',
    'landing.demo.running': 'デモ実行中',
    'tracker.camera.denied': 'カメラのアクセスが拒否されました。ブラウザ設定でカメラを許可して、もう一度お試しください。',
    'tracker.camera.notFound': 'カメラが見つかりませんでした。カメラを接続して、更新／開始をもう一度押してください。',
    'tracker.camera.https': 'カメラにはHTTPSまたはlocalhostが必要です。ローカルHTTPSの設定は docs/DEV_HTTPS.md を参照してください。',
    'tracker.camera.failed': 'カメラの起動に失敗しました。',
    'tracker.capability.insecureContext': 'カメラのアクセスにはHTTPSまたはlocalhostが必要です。docs/DEV_HTTPS.md を参照してください。',
    'tracker.capability.noCameraApi': 'このブラウザ／コンテキストではカメラAPIを利用できません。',
    'tracker.capability.noWebgl2': 'WebGL2が利用できません。GPU版MediaPipeは起動しません。',
    'tracker.capability.noWebtransport': 'WebTransport非対応のため、wtモードは無効です。',
  },
};

export function normalizeLanguage(value) {
  const base = String(value || '').toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : '';
}

export function detectLanguage({ stored = '', navigatorLanguage = '' } = {}) {
  return normalizeLanguage(stored) || normalizeLanguage(navigatorLanguage) || 'en';
}

export function createI18n({ messages = MESSAGES, lang = 'en' } = {}) {
  let current = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
  function t(key, fallback) {
    const table = messages[current] || {};
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    const en = messages.en || {};
    if (Object.prototype.hasOwnProperty.call(en, key)) return en[key];
    return fallback ?? key;
  }
  return {
    get lang() { return current; },
    setLang(next) {
      if (SUPPORTED_LANGUAGES.includes(next)) current = next;
      return current;
    },
    t,
  };
}

// Apply the current language to a DOM subtree via data-i18n / data-i18n-attr.
export function applyTranslations(root, t) {
  if (!root) return;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
      const [attr, key] = pair.split(':').map((part) => (part || '').trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}

export function loadLanguage(storage, navigatorLanguage) {
  let stored = '';
  try {
    stored = storage?.getItem?.(STORAGE_KEY) || '';
  } catch {
    stored = '';
  }
  return detectLanguage({ stored, navigatorLanguage });
}

export function saveLanguage(storage, lang) {
  try {
    storage?.setItem?.(STORAGE_KEY, lang);
  } catch {
    /* storage may be unavailable (private mode); ignore */
  }
}
