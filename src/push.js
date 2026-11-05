/* ============================================================
 *  📱💻 팝업 알림 (웹 푸시) — 앱을 닫아도 컴퓨터 · 폰 화면에 알림이 뜨게
 *    🔔 알림 켜기를 누른 기기마다 FCM 토큰을 pushTokens/{id} = { email, token, ua, at } 에 적어 둠
 *    → Apps Script(notifyRun_, 1분마다)가 알림 대기열(notifyq)의 받는 사람 기기로 보냄 → sw.js 의 push 가 화면에 띄움
 *    앱이 열려 있을 때는 지금처럼 바로 (notify.js phone) — 같은 tag 라 1분 뒤 푸시가 와도 두 번 울리지 않음
 *    컴퓨터: Chrome · Edge (브라우저가 켜져 있으면 앱 창을 닫아도) · 안드로이드: Chrome · 아이폰: 홈 화면에 설치한 앱(iOS 16.4+)
 * ============================================================ */
import { firebaseConfig, MOCK } from './db.js';

let S = null;
const LS = 'theone.push';   // 이 기기에서 푸시를 등록한 { email, id, at }
export function register(state) { S = state; }
export const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'T' + (h >>> 0).toString(36) + s.length.toString(36); };
const read = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } };
/** 이 기기가 푸시를 받는 중인가 (같은 사람으로 등록돼 있음) */
export const enabledHere = () => { const r = read(); return !!(r && S && S.user && r.email === String(S.user.email || '').toLowerCase()); };

/** 🔔 허락을 받은 뒤 — 이 기기를 등록 (하루에 한 번은 토큰을 새로 확인). 실패해도 앱은 그대로 */
export async function enable(force) {
  if (!S || !S.user || !supported() || Notification.permission !== 'granted') return false;
  const email = String(S.user.email || '').toLowerCase(), r = read();
  if (!force && r && r.email === email && Date.now() - (r.at || 0) < 86400000) return true;
  try {
    let token = '';
    if (MOCK) token = (window.__MOCK_PUSH_TOKEN__ || 'mock-token-') + email;   // 시험: 실제 FCM 대신
    else {
      const reg = await navigator.serviceWorker.ready;
      const [{ getApps, initializeApp }, M] = await Promise.all([import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'), import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js')]);
      if (!(await M.isSupported())) return false;
      const app = getApps()[0] || initializeApp(firebaseConfig);
      token = await M.getToken(M.getMessaging(app), { serviceWorkerRegistration: reg });
    }
    if (!token) return false;
    const id = hash(token);
    if (r && r.id && r.id !== id && r.email === email) { try { await S.DB.del('pushTokens', r.id); } catch (e) {} }   // 토큰이 바뀌면 옛 것 지움
    await S.DB.set('pushTokens', id, { email, token, ua: String(navigator.userAgent || '').slice(0, 160), at: new Date().toISOString() });
    localStorage.setItem(LS, JSON.stringify({ email, id, at: Date.now() }));
    return true;
  } catch (e) { console.warn('push', e); return false; }
}
/** 로그아웃 · 다른 사람으로 바뀔 때 — 이 기기 등록을 지움 (남의 알림이 이 기기에 뜨지 않게) */
export async function disable() {
  const r = read(); if (!r) return;
  try { if (S && S.DB && r.id) await S.DB.del('pushTokens', r.id); } catch (e) {}
  try { localStorage.removeItem(LS); } catch (e) {}
}
