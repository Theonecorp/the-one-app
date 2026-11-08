/* ============================================================
 *  📦 배송 조회 — 어느 인보이스가 어느 박스로, 언제 나가서 언제 받았는지 (세일즈맨도 자기 가게)
 *    shipments/{트래킹} = 박스 한 개 (UPS.gs 가 라벨 만들 때 · Quantum View · 직접 입력한 1Z 번호로 생김)
 *    찾기: 가게 이름 · 계정 · 인보이스 # · 주문 # · 트래킹 #  — 기록에 없는 트래킹도 UPS 에서 바로 조회
 *    🔄 지금 조회: shipq (st:'trk') → UPS.gs 가 1분 안에 UPS Tracking API 결과를 돌려주고 shipments 도 갱신
 * ============================================================ */
import { $, esc, md, money, toast, openModal, closeModal, Router, debounce, bi, bt, sortBy, groupBy, addDays, today, narrow } from './ui.js';
import { searchAccounts } from './accounts.js';
import { can } from './main.js';

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
  if (x.voided) return '<span class="tag t-c">✕ ' + bt('취소됨', 'Voided') + '</span>';
  if (x.delivered) return '<span class="tag t-k">✅ ' + bt('배달', 'Delivered') + ' ' + esc(md(x.deliveredAt || '')) + '</span>';
  if (/exception|delay|return/i.test(x.status || '')) return '<span class="tag t-r">⚠️ ' + esc(x.status) + '</span>';
  if ((x.events && x.events.length) || /transit|out for delivery|pickup|origin scan|departure|arriv/i.test(x.status || '')) return '<span class="tag t-b">🚚 ' + bt('이동 중', 'In transit') + (x.eta ? ' · ETA ' + esc(md(x.eta)) : '') + '</span>';
  return '<span class="tag t-g">🏷 ' + bt('출고 · 라벨', 'Label created') + '</span>';
}
/** 박스 문서들 → 출고(여러 박스) 단위로 묶기: UPS shipId · 앞 박스(lead) · 주문+날짜 */
const shpKey = x => x.shipId || x.lead || ((x.orderId || x.trk) + '|' + (x.shipDate || ''));
const smName = c => { c = String(c || '').toUpperCase(); const s = S.smByCode && S.smByCode[c]; return c ? (s && s.name ? c + ' (' + s.name + ')' : c) : ''; };
const lb = n => (Number(n) ? (Math.round(Number(n) * 10) / 10) + ' lb' : '');
export function groupShipments(list) {
  const g = groupBy(list, shpKey);
  return Object.keys(g).map(k => { const B = sortBy(g[k], x => x.box || 0), a = B[0];
    const dl = B.filter(x => x.delivered).length, vd = B.every(x => x.voided), go = B.some(x => !x.delivered && !x.voided && ((x.events && x.events.length) || /transit|out for delivery|pickup|origin scan|departure|arriv/i.test(x.status || '')));
    return { key: k, a, boxes: B, n: a.boxes || B.length, w: Number(a.sw) || B.reduce((s, x) => s + (Number(x.w) || 0), 0), cost: Number(a.cost) || 0, dl, st: vd ? 'void' : dl && dl === B.length ? 'dlv' : go || dl ? 'go' : 'lbl' }; })
    .sort((x, y) => String(y.a.shipDate || '').localeCompare(String(x.a.shipDate || '')) || String(y.a.at || '').localeCompare(String(x.a.at || '')));
}
const shpBadge = s => s.st === 'void' ? '<span class="tag t-c">✕ ' + bt('취소됨', 'Voided') + '</span>' : s.st === 'dlv' ? '<span class="tag t-k">✅ ' + bt('배송 완료', 'Delivered') + (s.a.deliveredAt ? ' ' + esc(md(s.a.deliveredAt)) : '') + '</span>' : s.st === 'go' ? '<span class="tag t-b">🚚 ' + bt('운송 중', 'In transit') + (s.dl ? ' ' + s.dl + '/' + s.boxes.length : '') + '</span>' : '<span class="tag t-g">🏷 ' + bt('라벨 생성', 'Label created') + '</span>';
const custHtml = a => (a.acct ? '<span class="en">#' + esc(a.acct) + '</span> ' : '') + esc(a.store || a.to || '');
const destOf = a => a.city ? esc(a.city) + (a.state ? ', ' + esc(a.state) : '') : esc(String(a.to || '').split(',').slice(-3, -1).join(',').trim());
/** 출고 목록 — 폰은 줄, 컴퓨터는 표 (직원 앱의 Shipping History 와 같은 칸: 날짜 · 기록 · 거래처 · 세일즈맨 · 받는 곳 · 서비스 · 박스 · 무게 · 운임 · 운송장 · 상태) */
export function shipmentsHtml(list) {
  if (!list.length) return '<div class="none">' + bt('배송 기록이 없습니다', 'No shipments') + '</div>';
  const G = groupShipments(list);
  if (narrow()) return '<div class="shplist">' + G.map(s => { const a = s.a; return '<div class="pr tap" data-shp="' + esc(s.key) + '"><div class="ct"><b>' + esc(md(a.shipDate || '')) + ' · ' + custHtml(a) + '</b><small>' + esc(smName(a.sm)) + (destOf(a) ? ' · ' + destOf(a) : '') + ' · ' + s.n + ' ' + bt('박스', 'box') + (s.w ? ' · ' + lb(s.w) : '') + (s.cost ? ' · ' + money(s.cost) : '') + (a.invs && a.invs.length ? ' · 🧾 ' + esc(a.invs.join(', ')) : '') + '</small><small class="mono muted">' + esc(a.trk) + '</small></div><div class="pa">' + shpBadge(s) + '</div></div>'; }).join('') + '</div>';
  return '<div class="dtw"><table class="dt shptbl"><thead><tr><th>' + bt('날짜', 'Date') + '</th><th>' + bt('기록', 'Record') + '</th><th>' + bt('거래처', 'Customer') + '</th><th>' + bt('세일즈맨', 'Rep') + '</th><th>' + bt('받는 곳', 'To') + '</th><th>' + bt('서비스', 'Service') + '</th><th style="text-align:right">' + bt('박스', 'Boxes') + '</th><th style="text-align:right">' + bt('무게', 'Weight') + '</th><th style="text-align:right">' + bt('운임', 'Cost') + '</th><th>' + bt('운송장', 'Tracking') + '</th><th>' + bt('상태', 'Status') + '</th></tr></thead><tbody>' +
    G.map(s => { const a = s.a; return '<tr class="tap" data-shp="' + esc(s.key) + '"><td>' + esc(a.shipDate || '') + '</td><td class="mono">' + esc(a.rec || a.no || a.shipId || '') + '</td><td>' + custHtml(a) + '</td><td>' + esc(String(a.sm || '').toUpperCase()) + '</td><td>' + destOf(a) + '</td><td>' + esc(a.svcName || svcN[a.svc] || a.svc || '') + '</td><td style="text-align:right">' + s.n + '</td><td style="text-align:right">' + lb(s.w) + '</td><td style="text-align:right">' + (s.cost ? money(s.cost) : '') + '</td><td class="mono">' + esc(a.trk) + (s.boxes.length > 1 ? ' <span class="muted">+' + (s.boxes.length - 1) + '</span>' : '') + '</td><td>' + shpBadge(s) + '</td></tr>'; }).join('') + '</tbody></table></div>';
}
export function bindShipments(root, list) { const G = groupShipments(list); root.querySelectorAll('[data-shp]').forEach(r => r.onclick = () => { const s = G.find(x => x.key === r.dataset.shp); if (s) shipModal(s); }); }

/** 🔄 UPS 에 지금 묻기 — shipq (st:'trk') 에 넣고 UPS.gs 의 답(trkdone)을 기다림. 결과: { trk: {…} | { err } } */
async function trackNow(trks) {
  const id = 'TK-' + trks[0] + '-' + Date.now().toString(36);
  await S.DB.set('shipq', id, { st: 'trk', kind: 'trk', trks, by: String(S.user.email || '').toLowerCase(), createdAt: new Date().toISOString() });
  for (let i = 0; i < 40; i++) { await sleep(3000); const j = await S.DB.get('shipq', id).catch(() => null); if (j && j.st === 'trkdone') return j.res || {}; }
  throw new Error(bt('응답이 없습니다 — UPS 스크립트(UPS.gs)를 새 버전으로 바꾸고 setup 을 실행했는지 확인하세요', 'No answer from the UPS script'));
}
const errText = e => String(e.code || e.message) + (String(e.code || e.message).includes('permission') ? ' — Firestore 규칙을 다시 게시해야 합니다' : '');
const kv = (k, v) => v ? '<div><small class="muted">' + k + '</small><div>' + v + '</div></div>' : '';
/** 📦 한 출고의 자세한 내용 — 직원 앱의 팝업과 같은 항목: 운송장(복사 · UPS 추적) · 출고일 · 예상 배송 · 주문 · 고객 · 세일즈맨 · 주소 · 전화 · 중량 · 청구 중량 · 박스별 치수 · 담당자 · 상태 · 추적 타임라인 · 비용 요약 · 라벨 · 박스마다 📍 기록 · 🔄 지금 조회 */
const dtKo = s => { s = String(s || ''); return s.length >= 10 ? s.substring(0, 10) + (s.length >= 16 ? ' ' + s.substring(11, 16) : '') : s; };
export function shipModal(s) {
  let busyQ = false, err = '', more = false, labels = null;
  const paint = () => {
    const a = s.a, B = s.boxes, acc = a.acct && S.accounts && S.accounts.byCode ? S.accounts.byCode[a.acct] : null;
    const addr = [a.attn && a.attn !== a.store ? a.attn : '', a.to, [a.city, a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean);
    const bw = B.reduce((t, x) => t + Math.max(Number(x.w) || 0, Number(x.dw) || 0), 0), w = s.w || B.reduce((t, x) => t + (Number(x.w) || 0), 0);
    const by = a.by && a.by !== 'import' ? a.by : '', tel = (acc && acc.tel) || a.tel || '';
    const stKo = s.st === 'void' ? [bt('취소됨', 'Voided'), 'Voided'] : s.st === 'dlv' ? [bt('배송 완료', 'Delivered'), 'Delivered'] : s.st === 'go' ? [bt('운송 중', 'In transit'), a.status || 'On the Way'] : [bt('라벨 생성', 'Label created'), a.status || 'Label created'];
    /* 추적 타임라인: 박스마다 받은 스캔 기록을 시간 역순으로 (여러 박스면 박스 번호 표시) */
    let ev = []; B.forEach(x => (x.events || []).forEach(e => ev.push(Object.assign({ bx: x.box || 1 }, e)))); ev = sortBy(ev, e => (e.d || '') + ' ' + (e.t || ''), true);
    const evHtml = e => '<div class="tev' + (e.st === 'D' ? ' d' : e.st === 'X' ? ' x' : '') + '"><b>' + esc(e.desc || e.st) + (B.length > 1 ? ' <span class="muted" style="font-weight:400">📦 ' + e.bx + '</span>' : '') + '</b><small>' + esc(e.d || '') + ' ' + esc(e.t || '') + (e.loc ? ' · ' + esc(e.loc) : '') + '</small></div>';
    const saved = Number(a.list) && Number(a.list) > s.cost ? Number(a.list) - s.cost : 0;
    $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h2 style="margin:0">📦 ' + esc(md(a.shipDate || '')) + ' · ' + custHtml(a) + '</h2></div><button class="b-ghost b-sm xin" id="shX">✕</button></div>' +
      '<div class="shphd"><div class="svc">UPS</div><div style="flex:1;min-width:0"><b>' + esc(a.svcName || svcN[a.svc] || a.svc || 'UPS') + '</b><div class="mono" style="font-size:13px">' + bt('운송장', 'Tracking') + ': ' + esc(a.trk) + (B.length > 1 ? ' <span class="muted">+' + (B.length - 1) + '</span>' : '') + ' <button class="b-ghost b-sm" id="shCopy" title="' + esc(bt('복사', 'Copy')) + '">⧉</button></div></div><a class="b-ghost b-sm lnk" href="' + upsUrl(a.trk) + '" target="_blank" rel="noopener">' + bt('UPS 에서 추적', 'Track on UPS') + ' ↗</a></div>' +
      '<div class="sumbox shpsum">' +
        kv(bt('출고일', 'Shipped'), esc(dtKo(a.shipAt || a.shipDate)) + (a.rec ? ' · <span class="mono">' + esc(a.rec) + '</span>' : '')) +
        kv(bt('예상 배송', 'Expected delivery'), s.st === 'dlv' ? '✅ ' + bt('배송 완료', 'Delivered') + ' ' + esc(a.deliveredAt || '') + (a.receivedBy ? ' · ' + bt('받은 사람', 'Signed by') + ' ' + esc(a.receivedBy) : '') : s.st === 'void' ? '—' : a.eta ? esc(a.eta) : '<span class="muted">' + bt('UPS 조회 뒤 표시', 'after a UPS check') + '</span>') +
        kv(bt('주문', 'Order'), a.no ? esc(a.no) + ((a.invs || []).length ? ' · 🧾 ' + esc(a.invs.join(', ')) : '') : '<span class="muted">' + bt('주문 없음 (계정 출고)', 'No order (account shipment)') + '</span>') +
        kv(bt('고객 / 매장', 'Customer / store'), custHtml(a)) +
        kv(bt('영업 담당자', 'Sales rep'), esc(smName(a.sm)) || '—') +
        kv(bt('전화', 'Phone'), tel ? '<a href="tel:' + esc(String(tel).replace(/[^0-9+]/g, '')) + '">' + esc(tel) + '</a>' : '—') +
        '<div style="grid-column:1/-1"><small class="muted">' + bt('주소', 'Address') + '</small><div>' + (addr.map(esc).join('<br>') || '—') + '</div></div>' +
        kv(bt('중량', 'Weight'), lb(w) || '—') +
        kv(bt('청구 중량', 'Billed weight'), lb(bw || w) || '—') +
        kv(bt('치수 (in)', 'Dimensions (in)'), B.map(x => '<span class="dimchip"><i>' + (x.box || 1) + '</i>' + esc(x.dims || '—') + ' <span class="muted">' + lb(x.w) + '</span></span>').join(' ')) +
        kv(bt('박스', 'Boxes'), String(s.n)) +
        kv(bt('담당자', 'Shipped by'), by ? esc(by) : a.src === 'ups' ? bt('다른 프로그램 (UPS 기록)', 'another program (UPS record)') : a.src === 'qv' ? bt('다른 프로그램 출고', 'shipped outside the app') : '—') +
        kv(bt('상태', 'Status'), shpBadge(s) + ' <span class="muted">' + esc(stKo[1]) + '</span>') +
      '</div>' +
      (err ? '<div class="alert a-red">' + esc(err) + '</div>' : '') +
      '<div class="shp2"><div><h3>' + bi('추적 타임라인', 'Tracking timeline') + '</h3>' + (ev.length ? ev.slice(0, more ? ev.length : 5).map(evHtml).join('') + (ev.length > 5 ? '<button class="b-ghost b-sm" id="shMore">' + (more ? bt('접기', 'Show less') : bt('이벤트 ' + (ev.length - 5) + '개 더 보기', 'Show ' + (ev.length - 5) + ' more')) + '</button>' : '') : '<div class="muted">' + bt('아직 스캔 기록이 없습니다 — 🔄 로 UPS 에 지금 물어보세요', 'No scans yet — tap 🔄 to ask UPS now') + '</div>') + '</div>' +
      '<div><h3>' + bi('비용 요약', 'Cost summary') + '</h3><div class="costbox">' + (Number(a.list) ? '<div><span>' + bt('UPS 견적 (공시)', 'UPS list rate') + '</span><b>' + money(a.list) + '</b></div>' : '') + '<div class="neg"><span>' + bt('협상 요금', 'Negotiated rate') + '</span><b>' + (s.cost ? money(s.cost) : '—') + '</b></div>' + (saved ? '<div><span>' + bt('절감액', 'Savings') + '</span><b>−' + money(saved) + '</b></div>' : '') + '<div class="tot"><span>' + bt('합계', 'Total') + '</span><b>' + (s.cost ? money(s.cost) : '—') + '</b></div></div>' +
      (a.orderId ? '<h3 style="margin-top:10px">' + bi('라벨', 'Label') + '</h3>' + (labels === null ? '<button class="b-ghost b-sm" id="shLbl">👁 ' + bt('라벨 보기', 'View label') + '</button>' : labels.length ? labels.map(l => '<a href="data:image/gif;base64,' + l.img + '" target="_blank" rel="noopener"><img src="data:image/gif;base64,' + l.img + '" alt="' + esc(l.trk) + '" style="width:100%;max-width:260px;border:1px solid var(--line);border-radius:8px"></a>').join('') : '<div class="muted">' + bt('저장된 라벨이 없습니다', 'No label saved') + '</div>') : '') + '</div></div>' +
      '<h3 style="margin:10px 0 4px">' + bi('박스', 'Boxes') + ' ' + B.length + '</h3>' +
      B.map(x => '<div class="shpbox"><div class="top"><div><span class="trk">📦 ' + (x.box || 1) + '/' + (x.boxes || B.length) + ' · ' + esc(x.trk) + '</span><div style="margin-top:3px">' + stBadge(x) + (x.receivedBy ? ' <span class="muted" style="font-size:12px">' + esc(x.receivedBy) + '</span>' : '') + '</div><div class="muted" style="font-size:12px;margin-top:2px">' + [lb(x.w), x.dims ? esc(x.dims) + '"' : '', (x.invs || []).length ? '🧾 ' + esc(x.invs.join(', ')) : ''].filter(Boolean).join(' · ') + (x.trkAt ? ' · ' + bt('조회', 'checked') + ' ' + esc(String(x.trkAt).substring(5, 16).replace('T', ' ')) : '') + '</div></div>' +
        '<div style="display:flex;flex-direction:column;gap:4px"><button class="b-ghost b-sm" data-trk="' + esc(x.trk) + '">📍 ' + bt('기록', 'History') + '</button><a class="b-ghost b-sm lnk" href="' + upsUrl(x.trk) + '" target="_blank" rel="noopener">UPS.com</a></div></div></div>').join('') +
      '<div class="btns" style="flex-wrap:wrap;margin-top:8px"><button class="b-blue" id="shGo"' + (busyQ || s.st === 'void' ? ' disabled' : '') + '>' + (busyQ ? '⏳ ' + bt('UPS 에 묻는 중… (최대 1분)', 'Asking UPS… (up to 1 min)') : '🔄 ' + bi('UPS 에서 지금 조회', 'Track now with UPS')) + '</button>' + (a.acct ? '<button class="b-ghost" id="shStore">🏬 ' + bi('가게 기록', 'Store history') + '</button>' : '') + '</div>';
    $('shX').onclick = closeModal;
    $('shCopy').onclick = () => { try { navigator.clipboard.writeText(B.map(x => x.trk).join(' ')); toast(bt('운송장 번호를 복사했습니다', 'Tracking number copied')); } catch (e) {} };
    if ($('shMore')) $('shMore').onclick = () => { more = !more; paint(); };
    if ($('shLbl')) $('shLbl').onclick = async () => { try { const q = await S.DB.get('shipq', a.orderId); labels = (q && q.labels || []).filter(l => l.img); } catch (e) { labels = []; } paint(); };
    $('mbox').querySelectorAll('[data-trk]').forEach(b => b.onclick = () => trackModal(b.dataset.trk, B.find(x => x.trk === b.dataset.trk), () => { openModal(''); paint(); }));
    if ($('shStore')) $('shStore').onclick = () => { closeModal(); openStore(a.acct); };
    $('shGo').onclick = async () => {
      busyQ = true; err = ''; paint();
      try { const res = await trackNow(B.map(x => x.trk)); if (!$('shGo')) return; const bad = [];
        B.forEach((x, i) => { const r = res[x.trk]; if (!r) return; if (r.err) bad.push(x.trk + ': ' + r.err); else B[i] = Object.assign(x, r, { trkAt: r.at }); });
        if (bad.length) err = bad.join(' · ');
        const dl = B.filter(x => x.delivered).length; s.dl = dl; s.st = dl && dl === B.length ? 'dlv' : B.some(x => x.events && x.events.length) || dl ? 'go' : s.st; s.a = B[0];
      } catch (e) { err = errText(e); }
      busyQ = false; if ($('shGo')) paint();
    };
  };
  openModal(''); paint();
}

/** 📍 한 박스의 스캔 기록 + 🔄 UPS 에서 지금 조회 (back: 닫을 때 돌아갈 곳) */
export function trackModal(trk, x, back) {
  let busyQ = false, err = '';
  const paint = () => {
    const ev = (x && x.events) || [];
    $('mbox').innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><div><h2 style="margin:0">📦 ' + esc(trk) + '</h2><div class="muted">' + esc((x && x.store) || '') + (x && x.invs && x.invs.length ? ' · 🧾 ' + esc(x.invs.join(', ')) : '') + (x && x.box ? ' · ' + bt('박스', 'box') + ' ' + x.box + '/' + (x.boxes || 1) : '') + '</div></div><button class="b-ghost b-sm xin" id="tkX">✕</button></div>' +
      (x ? '<div class="sumbox">' + stBadge(x) + ' <b>' + esc(x.status || '') + '</b>' + (x.receivedBy ? '<br>' + bt('받은 사람', 'Signed by') + ': <b>' + esc(x.receivedBy) + '</b>' + (x.dlvLoc ? ' · ' + esc(x.dlvLoc) : '') : '') + (x.shipDate ? '<br>' + bt('출고', 'Shipped') + ' ' + esc(x.shipDate) : '') + (x.to ? ' → ' + esc(x.to) : '') + (x.trkAt ? '<br><span class="muted" style="font-size:12px">' + bt('마지막 조회', 'Last checked') + ' ' + esc(String(x.trkAt).substring(0, 16).replace('T', ' ')) + (x.env === 'test' ? ' · ' + bt('UPS 시험 서버 응답 (실제 운송장은 못 찾음)', 'UPS test server (real tracking numbers are not found there)') : '') + '</span>' : '') + '</div>' : '') +
      (err ? '<div class="alert a-red">' + esc(err) + '</div>' : '') +
      '<div class="btns" style="flex-wrap:wrap"><button class="b-blue" id="tkGo"' + (busyQ ? ' disabled' : '') + '>' + (busyQ ? '⏳ ' + bt('UPS 에 묻는 중… (최대 1분)', 'Asking UPS… (up to 1 min)') : '🔄 ' + bi('UPS 에서 지금 조회', 'Track now with UPS')) + '</button><a class="b-ghost lnk" href="' + upsUrl(trk) + '" target="_blank" rel="noopener" style="justify-content:center">UPS.com ↗</a>' + (back ? '<button class="b-ghost" id="tkBack">← ' + bi('출고로', 'Back') + '</button>' : '') + '</div>' +
      (ev.length ? '<h3 style="margin:12px 0 6px">' + bi('스캔 기록', 'Scan history') + '</h3>' + ev.map((e, i) => '<div class="tev' + (i === 0 ? ' first' : '') + (e.st === 'D' ? ' d' : e.st === 'X' ? ' x' : '') + '"><b>' + esc(e.desc || e.st) + '</b><small>' + esc(e.d || '') + ' ' + esc(e.t || '') + (e.loc ? ' · ' + esc(e.loc) : '') + '</small></div>').join('') : '<div class="muted" style="margin-top:8px">' + bt('아직 스캔 기록이 없습니다 — 🔄 지금 조회를 누르세요', 'No scans yet — tap Track now') + '</div>');
    $('tkX').onclick = back || closeModal; if ($('tkBack')) $('tkBack').onclick = back;
    $('tkGo').onclick = async () => {
      busyQ = true; err = ''; paint();
      try { const res = await trackNow([trk]); if (!$('tkGo')) return; const r = res[trk] || {}; if (r.err) err = r.err; else x = Object.assign(x || { trk }, r, { trkAt: r.at }); }
      catch (e) { err = errText(e); }
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
  if (can('ship')) { const c = $('page').querySelector('.card'); c.insertAdjacentHTML('beforeend', '<div class="btns" style="justify-content:flex-start;margin-top:8px"><button class="b-ghost b-sm" id="tkAdhoc">➕ ' + bi('주문 없이 UPS 라벨 (임의 출고)', 'UPS label without an order') + '</button></div>'); $('tkAdhoc').onclick = () => import('./ship.js').then(M => M.adhocShip(() => page(''))); }
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
  const G = groupShipments(list), dl = G.filter(x => x.st === 'dlv').length;
  $('tkOut').innerHTML = '<h2>' + esc(title) + ' <span class="muted" style="font-size:12px;font-weight:400">' + G.length + ' ' + bt('출고', 'shipments') + ' · ' + list.length + ' ' + bt('박스', 'boxes') + ' · ✅ ' + dl + '</span></h2>' + shipmentsHtml(list);
  bindShipments($('tkOut'), list);
}
function hits(v) {
  const box = $('tkHits'); if (!box) return;
  if (!v || /^1Z/i.test(v) || /^[A-Z]{1,3}-?\d{3,7}$/i.test(v) || /^O\d{6}-/i.test(v)) { box.innerHTML = ''; return; }
  let L = searchAccounts(S.accounts, v, 12); if (!isStaff()) L = L.filter(a => String(a.sm || '').toUpperCase() === mySm());
  box.innerHTML = '<div class="chips" style="flex-wrap:wrap">' + L.map(a => '<button data-tka="' + esc(a.acct) + '">' + esc(a.store) + ' <span class="en">' + esc(a.acct) + '</span></button>').join('') + '</div>';
  box.querySelectorAll('[data-tka]').forEach(b => b.onclick = () => { T.acct = b.dataset.tka; T.q = ''; page(''); });
}
