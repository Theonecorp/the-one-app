/* ============================================================
 *  📦 오프라인 준비 — 인터넷이 없는 지역에서도 주문 · 수금을 받을 수 있게 필요한 자료를 미리 폰에 받아 둠
 *    · 화면 파일: sw.js (설치 때 보관) · 사진: sw.js 가 드라이브 썸네일을 본 것부터 보관 + 여기서 미리 받기
 *    · 자료: Firestore 영구 캐시(persistentLocalCache, 크기 제한 없음) — 한 번 읽은 문서 · 조회는 오프라인에서도 그대로 나옴
 *      → 여기서 세일즈맨에게 필요한 조회를 한 번씩 미리 읽음: 설정 · 세일즈맨 · 거래처(localStorage) · 카탈로그(IndexedDB) · 내 AR · 내 미결 인보이스 · 내 주문(2달) · 내 수금(3달) · 내 바운스 · 체크 요청 · 크레딧
 *    · 쓰기: 주문은 폰 보관함(outbox) · 수금 등은 Firestore 대기열 → 인터넷이 되면 자동 전송 (v0.8.72)
 *    · 홈 카드: 마지막 준비 시각 · [지금 준비] · [📷 사진까지]
 *    · 🔄 자동 준비 (v0.8.181, 세일즈맨): 인터넷이 되면 ① 앱을 열 때마다 ② 끊겼다 다시 연결될 때 ③ 다른 앱에 갔다 돌아올 때 · 열어 둔 동안 30분마다
 *      화면 뒤에서 조용히 (주문 입력을 막지 않음). 데이터 절약 · 2G 면 건너뜀. 같은 내용(거래처 · 카탈로그 버전이 같으면)은 다시 받지 않음
 *      사진: 와이파이이거나, 한 번 📷 사진까지를 받은 폰이면 새 사진만 (카탈로그가 바뀌었거나 하루 지났을 때)
 * ============================================================ */
import { $, esc, toast, bt, bi } from './ui.js';
import { loadCatalog, catalog, thumb } from './catalog.js';
import { loadAccounts } from './accounts.js';
import { mySm } from './access.js';

let S = null, RUNNING = false;
const K_AT = 'theone.offline.at', K_PH = 'theone.offline.photos';
export function register(state) { S = state; }
const yms = n => { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; };
const lastAt = () => { try { return localStorage.getItem(K_AT) || ''; } catch (e) { return ''; } };
const ago = iso => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? m + bt('분 전', 'm ago') : m < 1440 ? Math.round(m / 60) + bt('시간 전', 'h ago') : Math.round(m / 1440) + bt('일 전', 'd ago'); };
export function isStale() { const a = lastAt(); return !a || Date.now() - new Date(a).getTime() > 20 * 3600000; }

/** 자료 준비 — 단계별 onStep(text, i, n) */
let RUN_P = null;
export function prepare(onStep, quiet) {
  if (RUN_P) return RUN_P;   /* 이미 돌고 있으면 같은 진행을 기다림 (홈이 두 번 그려져도 한 번만) */
  if (navigator.onLine === false) { if (!quiet) toast(bt('인터넷이 연결되면 준비할 수 있습니다', 'Connect to the internet first'), 'bad'); return Promise.resolve(false); }
  RUN_P = prepareRun(onStep).finally(() => { RUN_P = null; });
  return RUN_P;
}
async function prepareRun(onStep) {
  RUNNING = true; const sm = mySm(), isSales = S.role === 'salesman';
  const steps = [
    [bt('설정 · 세일즈맨', 'Settings · salesmen'), async () => { await S.DB.get('settings', 'app'); await S.DB.list('salesmen'); }],
    [bt('거래처 목록', 'Accounts'), async () => { S.accounts = await loadAccounts(S); }],   /* 버전이 같으면 폰 것 그대로 (다시 받지 않음) */
    [bt('아이템 · 카탈로그 · 사진 목록', 'Items · catalog'), async () => { await loadCatalog(S); }],   /* 목록 버전이 바뀐 경우에만 다시 받음 */
    [bt('내 미수금(AR) · 미결 인보이스', 'My A/R · open invoices'), async () => { if (!sm) return; await S.DB.get('ar', sm).catch(() => null); await S.DB.list('invoices', { where: [['sm', '==', sm], ['st', '==', 'open']] }).catch(() => []); }],
    [bt('내 주문 (2달) · 수금 (3달)', 'My orders · payments'), async () => { if (!sm) return; await S.DB.list('orders', { where: [['sm', '==', sm], ['ym', 'in', yms(2)]] }).catch(() => []); await S.DB.list('entries', { where: [['sm', '==', sm], ['ym', 'in', yms(3)]] }).catch(() => []); }],
    [bt('바운스 · 체크 요청 · 크레딧 · 봉투', 'Bounces · requests · credits'), async () => { if (!sm) return; await Promise.all([S.DB.list('bounces', { where: [['sm', '==', sm]] }).catch(() => []), S.DB.list('checkReq', { where: [['sm', '==', sm]] }).catch(() => []), S.DB.list('envelopes', { where: [['sm', '==', sm]] }).catch(() => []), S.DB.list('invoices', { where: [['sm', '==', sm], ['t', '==', 'CM']] }).catch(() => [])]); }],
    [bt('자주 쓰는 가게 기록', 'Frequent stores'), async () => { if (!sm || !isSales) return; try { const { storeInfo } = await import('./store.js'); const ords = await S.DB.list('orders', { where: [['sm', '==', sm], ['ym', 'in', yms(2)]] }).catch(() => []); const accts = Array.from(new Set(ords.map(o => o.acct).filter(Boolean))).slice(0, 12); for (const a of accts) { try { await storeInfo(a); } catch (e) {} await new Promise(r => setTimeout(r, 150)); } } catch (e) {} }]
  ];
  try { for (let i = 0; i < steps.length; i++) { if (onStep) onStep(steps[i][0], i, steps.length); try { await steps[i][1](); } catch (e) {} } try { localStorage.setItem(K_AT, new Date().toISOString()); } catch (e) {} if (onStep) onStep(bt('완료', 'Done'), steps.length, steps.length); }
  finally { RUNNING = false; }
  return true;
}
/** 사진 미리 받기 — 보이는 아이템의 카드(300) · 줄(160) 썸네일을 sw.js 가 보관하도록 한 번씩 불러옴 */
export async function prefetchPhotos(onStep, limit, quiet) {
  if (RUNNING) return 0; if (navigator.onLine === false) { if (!quiet) toast(bt('인터넷이 연결되면 받을 수 있습니다', 'Connect to the internet first'), 'bad'); return 0; }
  RUNNING = true; let done = 0;
  try {
    await loadCatalog(S); const C = catalog(); if (!C) return 0;
    const urls = []; C.items.filter(x => !x.h && x.ph && !/^data:/.test(x.ph)).slice(0, limit || 2500).forEach(x => { urls.push(thumb(x.ph, 300)); urls.push(thumb(x.ph, 160)); });
    const n = urls.length; let i = 0;
    const one = u => new Promise(res => { const im = new Image(); const fin = () => { done++; res(); }; im.onload = fin; im.onerror = fin; im.src = u; setTimeout(fin, 8000); });
    const worker = async () => { while (i < n) { const u = urls[i++]; await one(u); if (onStep && done % 20 === 0) onStep(bt('사진 받는 중', 'Fetching photos') + ' ' + done + ' / ' + n, done, n); } };
    await Promise.all(Array.from({ length: quiet ? 2 : 6 }, () => worker()));   // 자동(quiet)은 2개씩만 — 휴대폰 데이터에서 주문 · 다른 화면 읽기와 다투지 않게 (v0.8.184)
    try { localStorage.setItem(K_PH, JSON.stringify({ at: new Date().toISOString(), n: done, ver: C.ver || '' })); } catch (e) {}
    if (onStep) onStep(bt('사진 완료', 'Photos done') + ' ' + done, n, n);
  } finally { RUNNING = false; }
  return done;
}
/** 홈 카드 — 상태 · 버튼 · 진행 막대. 하루 넘었고 온라인이면 자료를 조용히 준비 */
export function homeCard(el, auto) {
  if (!el) return;
  let ph = null; try { ph = JSON.parse(localStorage.getItem(K_PH) || 'null'); } catch (e) {}
  const at = lastAt(), stale = isStale();
  el.innerHTML = '<div class="card" style="padding:10px 14px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><div><b>📦 ' + bi('오프라인 준비', 'Offline ready') + '</b> <span class="muted" style="font-size:12px">' + (at ? (stale ? '<span class="warn">' : '<span class="ok">') + bt('자료', 'data') + ' ' + ago(at) + '</span>' : '<span class="warn">' + bt('아직 안 함', 'not yet') + '</span>') + (ph ? ' · 📷 ' + ph.n + bt('장', '') + ' ' + ago(ph.at) : ' · 📷 ' + bt('사진 안 받음', 'no photos')) + '</span></div>' +
    '<div class="btns" style="margin:0"><button class="b-ghost b-sm" id="ofGo">🔄 ' + bt('지금 준비', 'Prepare now') + '</button><button class="b-ghost b-sm" id="ofPh">📷 ' + bt('사진까지', 'Photos too') + '</button></div></div>' +
    '<div class="muted" style="font-size:11.5px;margin-top:4px">' + bt('인터넷이 되면 앱을 열 때마다 자동으로 준비합니다 (거래처 · 아이템 · 내 미수금 · 주문 · 수금). 인터넷이 없거나 약한 곳에서도 주문 · 수금 입력이 되고, 폰에 저장했다가 인터넷이 되면 자동 전송합니다. 사진은 와이파이에서 📷 사진까지를 한 번 받아 두세요.', 'Prepares automatically every time you open the app online (stores · items · your A/R · orders · payments). Orders and payments work with no or weak internet — saved on the phone and sent when online. Fetch photos once on Wi-Fi with 📷 Photos too.') + '</div>' +
    '<div id="ofBar" style="display:none;margin-top:6px"><div class="paybar"><i id="ofFill" style="width:0;background:var(--blue)"></i></div><div class="muted" id="ofTxt" style="font-size:11.5px"></div></div></div>';
  /* 버튼 · 진행 막대는 이 카드(el) 안에서만 찾음 — 다른 화면으로 넘어간 뒤 준비가 끝나도 오류 없이 조용히 */
  const q = id => el.querySelector('#' + id);
  const bar = (t, i, n) => { const b = q('ofBar'); if (!b || !el.isConnected) return; b.style.display = ''; q('ofFill').style.width = Math.round(i / Math.max(1, n) * 100) + '%'; q('ofTxt').textContent = t; };
  const again = () => { const t = el.isConnected ? el : ($('offCard') || $('netOff')); if (t) homeCard(t, false); };   /* 홈이 다시 그려졌으면 새 칸에, 다른 화면이면 아무것도 안 함 */
  const run = async photos => { q('ofGo').disabled = q('ofPh').disabled = true; const ok = await prepare(bar); if (ok && photos) await prefetchPhotos(bar); toast(ok ? '📦 ' + bt('오프라인 준비 완료', 'Offline ready') : bt('준비 못 함', 'Not prepared'), ok ? 'good' : 'bad'); again(); };
  q('ofGo').onclick = () => run(false); q('ofPh').onclick = () => run(true);
  /* 자동 준비가 지금 돌고 있으면 이 카드에 진행 막대 · 끝나면 다시 그림 (자동 준비 자체는 autoStart 가 앱을 열 때 · 다시 연결될 때 돌림) */
  if (RUN_P) { BAR = bar; RUN_P.then(() => { BAR = null; again(); }); }
  else if (auto && stale) autoRun('home');
}

/* ---------- 🔄 자동 준비 (v0.8.181) ---------- */
const GAP_OPEN = 5 * 60000, GAP_TICK = 30 * 60000;   // 앱을 열 때 · 다시 연결될 때: 5분 안에 했으면 건너뜀 · 돌아올 때 · 30분마다: 30분
let BAR = null, AUTO_ON = false;
const conn = () => { try { return navigator.connection || null; } catch (e) { return null; } };
/** 자동 준비해도 되는 연결인가 — 오프라인 · 데이터 절약 · 2G 면 안 함 (약한 연결에서 주문 입력과 다투지 않게) */
export function autoOk() { if (navigator.onLine === false) return false; const c = conn(); return !(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))); }
/** 사진도 자동으로 받을까 — 와이파이 · 유선이거나, 연결 종류를 모르는 폰(아이폰)에서 한 번 📷 사진까지를 받은 적이 있으면 · 카탈로그가 바뀌었거나 하루 지났을 때만 */
function photoDue() {
  let ph = null; try { ph = JSON.parse(localStorage.getItem(K_PH) || 'null'); } catch (e) {}
  const c = conn(), t = c && c.type, wifi = t === 'wifi' || t === 'ethernet';
  if (!wifi && !(ph && (!t || t === 'unknown'))) return false;   // 휴대폰 데이터에서는 사진을 자동으로 받지 않음
  const C = catalog(); if (!ph) return wifi;
  return (C && C.ver && ph.ver !== C.ver) || Date.now() - new Date(ph.at).getTime() > 86400000;
}
/** 지금 자동 준비 — why: open · online · resume · tick · home */
export function autoRun(why) {
  if (!S || S.role !== 'salesman' || RUN_P || RUNNING || !autoOk() || document.visibilityState === 'hidden') return null;
  const a = lastAt(), gap = why === 'resume' || why === 'tick' ? GAP_TICK : GAP_OPEN;
  if (a && Date.now() - new Date(a).getTime() < gap) return null;
  return prepare((t, i, n) => { if (BAR) BAR(t, i, n); }, true).then(async ok => {
    if (ok && photoDue() && autoOk()) { try { await prefetchPhotos((t, i, n) => { if (BAR) BAR(t, i, n); }, 0, true); } catch (e) {} }
    const el = $('offCard'); if (el && el.isConnected) homeCard(el, false);
    return ok;
  });
}
/** 로그인 뒤 한 번 — 앱을 열 때(첫 화면이 뜬 뒤) · 다시 연결될 때 · 돌아올 때 · 열어 둔 동안 30분마다 */
export function autoStart() {
  if (AUTO_ON || typeof window === 'undefined') { setTimeout(() => autoRun('open'), 3000); return; }
  AUTO_ON = true;
  setTimeout(() => autoRun('open'), 3000);
  window.addEventListener('online', () => setTimeout(() => autoRun('online'), 2000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => autoRun('resume'), 1500); });
  setInterval(() => autoRun('tick'), 5 * 60000);
}
