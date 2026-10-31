/* ============================================================
 *  📦 배송 조회 — 어느 인보이스가 어느 박스로, 언제 나가서 언제 받았는지 (세일즈맨도 자기 가게)
 *    shipments/{트래킹} = 박스 한 개 (UPS.gs 가 라벨 만들 때 · Quantum View · 직접 입력한 1Z 번호로 생김)
 *    찾기: 가게 이름 · 계정 · 인보이스 # · 주문 # · 트래킹 #  — 기록에 없는 트래킹도 UPS 에서 바로 조회
 *    🔄 지금 조회: shipq (st:'trk') → UPS.gs 가 1분 안에 UPS Tracking API 결과를 돌려주고 shipments 도 갱신
 * ============================================================ */
import { $, esc, md, toast, openModal, closeModal, Router, debounce, bi, bt, sortBy, groupBy, addDays, today } from './ui.js';
import { searchAccounts } from './accounts.js';

let S = null;
const T = { q: '', acct: '' };
export function register(state) {
  S = state; Router.on('track', page);
  Router.up.track = arg => { if (arg) return false; if (T.acct || T.q) { T.acct = ''; T.q = ''; page(''); return true; } return false; };
  Router.upHas.track = () => !!(T.acct || T.q);
}
const isStaff = () => S.role !== 'salesman';
const mySm = () => (S.me && S.me.sm ? String(S.me.sm).toUpperCase() : '');
const svcN = { '03': 'Ground', '12': '3 Day Select', '02': '2nd Day Air', '59': '2nd Day Air A.M.', '13': 'Next Day Air Saver', '01': 'Next Day Air', '14': 'Next Day Air Early' };
const upsUrl = t => 'https://www.ups.com/track?tracknum=' + encodeURIComponent(t);
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** 세일즈맨은 자기 것만 (Firestore 규칙과 같게) */
const scope = wh => isStaff() ? wh : wh.concat([['sm', '==', mySm()]]);
export async function shipmentsOf(acct) { try { return await S.DB.list('shipments', { where: scope([['acct', '==', acct]]) }); } catch (e) { return []; } }

export function stBadge(x) {
  if (x.delivered) return '<span class="tag t-k">✅ ' + bt('배달', 'Delivered') + ' ' + esc(md(x.deliveredAt || '')) + '</span>';
  if (/exception|delay|return/i.test(x.status || '')) return '<span class="tag t-r">⚠️ ' + esc(x.status) + '</span>';
  if (x.events && x.events.length) return '<span class="tag t-b">🚚 ' + bt('이동 중', 'In transit') + (x.eta ? ' · ETA ' + esc(md(x.eta)) : '') + '</span>';
  return '<span class="tag t-g">🏷 ' + bt('출고 · 라벨', 'Label created') + '</span>';
}
/** 박스 목록 — 출고일 · 주문으로 묶어서 */
export function shipmentsHtml(list) {
  if (!list.length) return '<div class="none">' + bt('배송 기록이 없습니다', 'No shipments') + '</div>';
  const g = groupBy(list, x => (x.shipDate || '') + '|' + (x.orderId || x.trk));
  return Object.keys(g).sort().reverse().map(k => { const L = sortBy(g[k], x => x.box || 0), a = L[0];
    return '<div class="iday"><b>' + esc(md(a.shipDate || '')) + ' · ' + esc(a.store || '') + '</b><span>' + L.length + ' ' + bt('박스', 'box') + (a.svc ? ' · ' + esc(svcN[a.svc] || a.svcName || a.svc) : '') + (a.no ? ' · ' + esc(a.no) : '') + '</span></div>' +
      L.map(x => '<div class="shpbox"><div class="top"><div><span class="trk">📦 ' + (x.box || 1) + '/' + (x.boxes || L.length) + ' · ' + esc(x.trk) + '</span><div style="margin-top:3px">' + stBadge(x) + (x.receivedBy ? ' <span class="muted" style="font-size:12px">' + bt('받은 사람', 'Signed by') + ': ' + esc(x.receivedBy) + '</span>' : '') + '</div>' +
        '<div class="muted" style="font-size:12px;margin-top:2px">🧾 ' + esc((x.invs || []).join(', ') || '—') + (x.w ? ' · ' + x.w + ' lb' : '') + (x.dims ? ' · ' + esc(x.dims) + '"' : '') + (x.src === 'qv' ? ' · ' + bt('다른 프로그램 출고', 'shipped outside the app') : '') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:4px"><button class="b-ghost b-sm" data-trk="' + esc(x.trk) + '">📍 ' + bt('기록', 'History') + '</button><a class="b-ghost b-sm lnk" href="' + upsUrl(x.trk) + '" target="_blank" rel="noopener">UPS.com</a></div></div></div>').join(''); }).join('');
}
export function bindShipments(root, list) { root.querySelectorAll('[data-trk]').forEach(b => b.onclick = () => trackModal(b.dataset.trk, list.find(x => x.trk === b.dataset.trk))); }

/** 📍 한 박스의 스캔 기록 + 🔄 UPS 에서 지금 조회 */
export function trackModal(trk, x) {
  let busyQ = false, err = '';
  const paint = () => {
    const ev = (x && x.events) || [];
    $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">📦 ' + esc(trk) + '</h2><div class="muted">' + esc((x && x.store) || '') + (x && x.invs && x.invs.length ? ' · 🧾 ' + esc(x.invs.join(', ')) : '') + (x && x.box ? ' · ' + bt('박스', 'box') + ' ' + x.box + '/' + (x.boxes || 1) : '') + '</div></div><button class="b-ghost b-sm xin" id="tkX">✕</button></div>' +
      (x ? '<div class="sumbox">' + stBadge(x) + ' <b>' + esc(x.status || '') + '</b>' + (x.receivedBy ? '<br>' + bt('받은 사람', 'Signed by') + ': <b>' + esc(x.receivedBy) + '</b>' + (x.dlvLoc ? ' · ' + esc(x.dlvLoc) : '') : '') + (x.shipDate ? '<br>' + bt('출고', 'Shipped') + ' ' + esc(x.shipDate) : '') + (x.to ? ' → ' + esc(x.to) : '') + (x.trkAt ? '<br><span class="muted" style="font-size:12px">' + bt('마지막 조회', 'Last checked') + ' ' + esc(String(x.trkAt).substring(0, 16).replace('T', ' ')) + '</span>' : '') + '</div>' : '') +
      (err ? '<div class="alert a-red">' + esc(err) + '</div>' : '') +
      '<div class="btns" style="flex-wrap:wrap"><button class="b-blue" id="tkGo"' + (busyQ ? ' disabled' : '') + '>' + (busyQ ? '⏳ ' + bt('UPS 에 묻는 중… (최대 1분)', 'Asking UPS… (up to 1 min)') : '🔄 ' + bi('UPS 에서 지금 조회', 'Track now with UPS')) + '</button><a class="b-ghost lnk" href="' + upsUrl(trk) + '" target="_blank" rel="noopener" style="justify-content:center">UPS.com ↗</a></div>' +
      (ev.length ? '<h3 style="margin:12px 0 6px">' + bi('스캔 기록', 'Scan history') + '</h3>' + ev.map((e, i) => '<div class="tev' + (i === 0 ? ' first' : '') + (e.st === 'D' ? ' d' : e.st === 'X' ? ' x' : '') + '"><b>' + esc(e.desc || e.st) + '</b><small>' + esc(e.d || '') + ' ' + esc(e.t || '') + (e.loc ? ' · ' + esc(e.loc) : '') + '</small></div>').join('') : '<div class="muted" style="margin-top:8px">' + bt('아직 스캔 기록이 없습니다 — 🔄 지금 조회를 누르세요', 'No scans yet — tap Track now') + '</div>');
    $('tkX').onclick = closeModal;
    $('tkGo').onclick = async () => {
      busyQ = true; err = ''; paint();
      const id = 'TK-' + trk + '-' + Date.now().toString(36);
      try {
        await S.DB.set('shipq', id, { st: 'trk', kind: 'trk', trks: [trk], by: String(S.user.email || '').toLowerCase(), createdAt: new Date().toISOString() });
        let done = false;
        for (let i = 0; i < 40; i++) { await sleep(3000); if (!$('tkGo')) return; const j = await S.DB.get('shipq', id).catch(() => null); if (j && j.st === 'trkdone') { const r = (j.res || {})[trk] || {}; if (r.err) err = r.err; else x = Object.assign({}, x || { trk }, r, { trkAt: r.at }); done = true; break; } }
        if (!done) err = bt('응답이 없습니다 — UPS 스크립트(UPS.gs)를 새 버전으로 바꾸고 setup 을 실행했는지 확인하세요', 'No answer from the UPS script');
      } catch (e) { err = String(e.code || e.message) + (String(e.code || e.message).includes('permission') ? ' — Firestore 규칙을 다시 게시해야 합니다' : ''); }
      busyQ = false; if ($('tkGo')) paint();
    };
  };
  openModal(''); paint();
}

/** 다른 화면에서 — 이 가게로 바로 */
export function openStore(acct) { T.acct = acct; T.q = ''; if (location.hash === '#/track') page(''); else Router.go('track'); }
/* ---------- 🚚 배송 조회 화면 ---------- */
async function page(arg) {
  if (arg) T.q = arg;
  const q = T.q.trim().toUpperCase();
  $('page').innerHTML = '<div class="card"><h2>🚚 ' + bi('배송 조회', 'Shipment tracking') + '</h2><div class="muted">' + bi('가게 이름 · 계정 #, 인보이스 #, 주문 #, UPS 트래킹 # 로 찾으세요. 어느 인보이스가 어느 박스로 나가서 언제 받았는지 보입니다.', 'Search by store, invoice #, order # or UPS tracking # — see which invoice went in which box and when it arrived.') + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px"><input id="tkQ" value="' + esc(T.q) + '" placeholder="' + esc(bt('가게 · 인보이스 # · 주문 # · 1Z…', 'Store · invoice # · order # · 1Z…')) + '" autocomplete="off" autocapitalize="characters" style="flex:1">' + (T.q || T.acct ? '<button class="b-ghost b-sm" id="tkC">✕</button>' : '') + '</div><div id="tkHits"></div></div><div class="card" id="tkOut"><div class="load">' + bt('읽는 중…', 'Loading…') + '</div></div>';
  Router.refreshBack();
  $('tkQ').oninput = debounce(() => { const v = $('tkQ').value.trim(); T.q = v; T.acct = ''; hits(v); }, 200);
  $('tkQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); T.q = $('tkQ').value.trim(); T.acct = ''; page(''); } };
  if ($('tkC')) $('tkC').onclick = () => { T.q = ''; T.acct = ''; page(''); };
  hits(T.q);
  let list = [], title = '';
  try {
    if (T.acct) { list = await shipmentsOf(T.acct); const a = S.accounts.byCode[T.acct]; title = a ? a.store + ' · ' + a.acct : T.acct; }
    else if (/^1Z[0-9A-Z]{16}$/.test(q)) { const x = await S.DB.get('shipments', q).catch(() => null); if (x) list = [x]; else { $('tkOut').innerHTML = '<div class="muted">' + bt('앱 기록에 없는 트래킹입니다 — UPS 에서 바로 조회합니다', 'Not in the app — asking UPS directly') + '</div>'; return trackModal(q, null); } title = q; }
    else if (/^[A-Z]{1,3}-?\d{3,7}$/.test(q)) {   /* 인보이스 → 그 가게의 박스 중 이 인보이스가 든 것 (세일즈맨 규칙 · 색인 없이) */
      const iv = await (await import('./invoicing.js')).getInvoice(S, q).catch(() => null);
      list = iv && iv.acct ? (await shipmentsOf(iv.acct)).filter(x => (x.invs || []).includes(q)) : isStaff() ? await S.DB.list('shipments', { where: [['invs', 'array-contains', q]] }) : [];
      title = bt('인보이스', 'Invoice') + ' ' + q + (iv ? ' · ' + iv.store : '');
    }
    else if (/^O\d{6}-/.test(q)) { list = await S.DB.list('shipments', { where: scope([['no', '==', q]]) }); title = bt('주문', 'Order') + ' ' + q; }
    else if (!q) { const from = addDays(today(), isStaff() ? -7 : -30); list = isStaff() ? await S.DB.list('shipments', { where: [['shipDate', '>=', from]] }) : (await S.DB.list('shipments', { where: [['sm', '==', mySm()]] })).filter(x => (x.shipDate || '') >= from); title = bt('최근 출고', 'Recent shipments') + ' (' + (isStaff() ? 7 : 30) + bt('일', ' days') + ')'; }
    else { $('tkOut').innerHTML = '<div class="muted">' + bt('위에서 가게를 고르세요', 'Pick a store above') + '</div>'; return; }
  } catch (e) { $('tkOut').innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; return; }
  if (!$('tkOut')) return;
  list = sortBy(list, x => (x.shipDate || '') + String(x.box || 0).padStart(3, '0'), true);
  const dl = list.filter(x => x.delivered).length;
  $('tkOut').innerHTML = '<h2>' + esc(title) + ' <span class="muted" style="font-size:12px;font-weight:400">' + list.length + ' ' + bt('박스', 'boxes') + ' · ✅ ' + dl + '</span></h2>' + shipmentsHtml(list);
  bindShipments($('tkOut'), list);
}
function hits(v) {
  const box = $('tkHits'); if (!box) return;
  if (!v || /^1Z/i.test(v) || /^[A-Z]{1,3}-?\d{3,7}$/i.test(v) || /^O\d{6}-/i.test(v)) { box.innerHTML = ''; return; }
  let L = searchAccounts(S.accounts, v, 12); if (!isStaff()) L = L.filter(a => String(a.sm || '').toUpperCase() === mySm());
  box.innerHTML = '<div class="chips" style="flex-wrap:wrap">' + L.map(a => '<button data-tka="' + esc(a.acct) + '">' + esc(a.store) + ' <span class="en">' + esc(a.acct) + '</span></button>').join('') + '</div>';
  box.querySelectorAll('[data-tka]').forEach(b => b.onclick = () => { T.acct = b.dataset.tka; T.q = ''; page(''); });
}
