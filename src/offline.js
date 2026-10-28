/* ============================================================
 *  📦 오프라인 준비 — 인터넷이 없는 지역에서도 주문 · 수금을 받을 수 있게 필요한 자료를 미리 폰에 받아 둠
 *    · 화면 파일: sw.js (설치 때 보관) · 사진: sw.js 가 드라이브 썸네일을 본 것부터 보관 + 여기서 미리 받기
 *    · 자료: Firestore 영구 캐시(persistentLocalCache, 크기 제한 없음) — 한 번 읽은 문서 · 조회는 오프라인에서도 그대로 나옴
 *      → 여기서 세일즈맨에게 필요한 조회를 한 번씩 미리 읽음: 설정 · 세일즈맨 · 거래처(localStorage) · 카탈로그(IndexedDB) · 내 AR · 내 미결 인보이스 · 내 주문(2달) · 내 수금(3달) · 내 바운스 · 체크 요청 · 크레딧
 *    · 쓰기: 주문은 폰 보관함(outbox) · 수금 등은 Firestore 대기열 → 인터넷이 되면 자동 전송 (v0.8.72)
 *    · 홈 카드: 마지막 준비 시각 · [지금 준비] · [📷 사진까지] · 하루 넘었으면 온라인일 때 자료만 자동 준비
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
export function prepare(onStep) {
  if (RUN_P) return RUN_P;   /* 이미 돌고 있으면 같은 진행을 기다림 (홈이 두 번 그려져도 한 번만) */
  if (navigator.onLine === false) { toast(bt('인터넷이 연결되면 준비할 수 있습니다', 'Connect to the internet first'), 'bad'); return Promise.resolve(false); }
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
export async function prefetchPhotos(onStep, limit) {
  if (RUNNING) return 0; if (navigator.onLine === false) { toast(bt('인터넷이 연결되면 받을 수 있습니다', 'Connect to the internet first'), 'bad'); return 0; }
  RUNNING = true; let done = 0;
  try {
    await loadCatalog(S); const C = catalog(); if (!C) return 0;
    const urls = []; C.items.filter(x => !x.h && x.ph && !/^data:/.test(x.ph)).slice(0, limit || 2500).forEach(x => { urls.push(thumb(x.ph, 300)); urls.push(thumb(x.ph, 160)); });
    const n = urls.length; let i = 0;
    const one = u => new Promise(res => { const im = new Image(); const fin = () => { done++; res(); }; im.onload = fin; im.onerror = fin; im.src = u; setTimeout(fin, 8000); });
    const worker = async () => { while (i < n) { const u = urls[i++]; await one(u); if (onStep && done % 20 === 0) onStep(bt('사진 받는 중', 'Fetching photos') + ' ' + done + ' / ' + n, done, n); } };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    try { localStorage.setItem(K_PH, JSON.stringify({ at: new Date().toISOString(), n: done })); } catch (e) {}
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
    '<div class="muted" style="font-size:11.5px;margin-top:4px">' + bt('인터넷이 없는 곳에서도 주문 · 수금 입력이 됩니다 (폰에 저장 → 인터넷이 되면 자동 전송). 거래처 · 아이템 · 내 미수금을 미리 받아 두면 오프라인에서도 그대로 보입니다. 사진은 와이파이에서 받으세요.', 'Orders and payments work without internet (saved on the phone, sent when online). Preparing stores, items and your A/R in advance makes them available offline. Fetch photos on Wi-Fi.') + '</div>' +
    '<div id="ofBar" style="display:none;margin-top:6px"><div class="paybar"><i id="ofFill" style="width:0;background:var(--blue)"></i></div><div class="muted" id="ofTxt" style="font-size:11.5px"></div></div></div>';
  /* 버튼 · 진행 막대는 이 카드(el) 안에서만 찾음 — 다른 화면으로 넘어간 뒤 준비가 끝나도 오류 없이 조용히 */
  const q = id => el.querySelector('#' + id);
  const bar = (t, i, n) => { const b = q('ofBar'); if (!b || !el.isConnected) return; b.style.display = ''; q('ofFill').style.width = Math.round(i / Math.max(1, n) * 100) + '%'; q('ofTxt').textContent = t; };
  const again = () => { const t = el.isConnected ? el : ($('offCard') || $('netOff')); if (t) homeCard(t, false); };   /* 홈이 다시 그려졌으면 새 칸에, 다른 화면이면 아무것도 안 함 */
  const run = async photos => { q('ofGo').disabled = q('ofPh').disabled = true; const ok = await prepare(bar); if (ok && photos) await prefetchPhotos(bar); toast(ok ? '📦 ' + bt('오프라인 준비 완료', 'Offline ready') : bt('준비 못 함', 'Not prepared'), ok ? 'good' : 'bad'); again(); };
  q('ofGo').onclick = () => run(false); q('ofPh').onclick = () => run(true);
  /* 자동 준비는 홈이 다 그려진 뒤 조용히 (8초 뒤 · 화면이 보일 때만 · 느린 연결 · 데이터 절약이면 건너뜀) — 앱 여는 속도를 늦추지 않게 */
  const slow = (() => { try { const c = navigator.connection; return !!(c && (c.saveData || /2g|3g/.test(c.effectiveType || ''))); } catch (e) { return false; } })();
  if (auto && stale && navigator.onLine !== false && !slow) setTimeout(() => { if (document.visibilityState !== 'visible' || navigator.onLine === false) return; prepare(bar).then(ok => { if (ok) again(); }); }, 8000);
}
