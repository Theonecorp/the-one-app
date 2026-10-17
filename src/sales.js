/* ============================================================
 *  세일즈맨 화면 — 수금 입력 · 내 기록 · 미수금 AR · 정산서
 *  entries/{id} = { id, d, ym, sm, acct, store, addr, state, newStore,
 *    pays:[{m, ref, amt, dep, mob}], invs:[{no, t, amt, acct, store, partial}],
 *    total, invTotal, mismatch, memo, repl, orig, disc,
 *    sb, rc, v, vn, settled, void, createdBy, createdAt, updatedAt }
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sum, sortBy, groupBy, printOpen, daysBetween, pad4, nz } from './ui.js';
import { newId } from './db.js';
import { searchAccounts, accountLabel } from './accounts.js';
import { lineOfEntry, lineOfOther, computeComm, ratesOf, commSettings, invType, SEC_LABEL } from './comm.js';

let S = null, ME = '', CACHE = { entries: null, ar: null, arAt: 0 };
export function register(state) {
  S = state;
  Router.on('entry', pageEntry); Router.on('mine', pageMine); Router.on('ar', pageAR); Router.on('mycomm', pageMyComm);
}
function me() { ME = F.sm || ((S.me && S.me.sm) ? String(S.me.sm).toUpperCase() : ''); return ME; }
export function setFormSm(sm) { F.sm = sm ? String(sm).toUpperCase() : ''; }
function noSm() { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.<br>루크가 관리 → 사용자에서 세일즈맨을 지정해야 합니다.</div></div>'; }

/* ---------- 내 수금 읽기 (최근 3개월) ---------- */
function recentYms(n) { const out = [], d = new Date(); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; }
export async function myEntries(force) {
  if (CACHE.entries && !force) return CACHE.entries;
  const rows = await S.DB.list('entries', { where: [['sm', '==', me()], ['ym', 'in', recentYms(3)]] });
  CACHE.entries = sortBy(rows.filter(r => !r.void), r => r.d + (r.createdAt || ''), true);
  return CACHE.entries;
}
function stageClass(e) { return e.v ? 'v' : e.rc ? 'rc' : e.sb ? 'sb' : ''; }
function stageDots(e) { return '<span class="stage"><i class="' + (e.sb ? 'sb' : '') + '"></i><i class="' + (e.rc ? 'rc' : '') + '"></i><i class="' + (e.v ? 'v' : '') + '"></i></span>'; }
export function stageText(e) { return e.settled ? '정산 완료' : e.v ? '③ 정산 확인' : e.rc ? '② 체크 수령' : e.sb ? '① SmartBee' : '입력됨'; }

/* ============================================================
 *  ① 수금 입력
 * ============================================================ */
const F = { sm: '', acct: null, store: '', newStore: false, addr: '', state: '', pays: [], invs: [], picked: [], editing: null, repl: false, orig: '' };
function resetForm() { const keepSm = (S.role !== 'salesman') ? F.sm : ''; Object.assign(F, { sm: keepSm, acct: null, store: '', newStore: false, addr: '', state: '', pays: [{ m: 'CHECK', ref: '', amt: '', dep: '', mob: false }], invs: [], picked: [], editing: null, repl: false, orig: '', memo: '', d: today() }); }

async function pageEntry(arg) {
  if (arg && arg !== 'new') { const e = await S.DB.get('entries', arg); if (e) { if (S.role !== 'salesman') F.sm = e.sm; loadIntoForm(e); } }
  else if (!F.d || arg === 'new') resetForm();
  if (!me()) return noSm();
  paintEntry();
}
function loadIntoForm(e) {
  resetForm(); if (S.role !== 'salesman') F.sm = e.sm;
  F.editing = e.id; F.d = e.d; F.acct = e.acct || null; F.store = e.store; F.newStore = !!e.newStore; F.addr = e.addr || ''; F.state = e.state || '';
  F.pays = (e.pays || []).map(p => Object.assign({}, p)); if (!F.pays.length) F.pays = [{ m: 'CHECK', ref: '', amt: '', dep: '', mob: false }];
  F.invs = (e.invs || []).map(i => Object.assign({}, i)); F.memo = e.memo || ''; F.repl = !!e.repl; F.orig = e.orig || '';
}
function paintEntry() {
  const acc = F.acct ? S.accounts.byCode[F.acct] : null;
  let h = '<div class="card">' + (F.editing ? '<div class="alert a-amb" style="margin:0 0 10px">✏️ 수정 중 — ' + esc(F.editing) + ' <button class="b-ghost b-sm" style="float:right" id="btnCancelEdit">취소</button></div>' : '') +
    '<h2>가게</h2>';
  if (F.store) {
    h += '<div class="pick on" id="storeCard"><div class="pm"><b>' + esc(F.store) + '</b>' + (F.newStore ? ' <span class="tag t-c">신규</span>' : '') + '<small>' + (acc ? esc(acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ')) : esc(F.addr || '계정 없음')) + '</small></div><button class="b-ghost b-sm" id="btnStoreX">바꾸기</button></div>';
  } else {
    h += '<input id="storeQ" placeholder="가게 이름 · 계정코드 · 도시" autocomplete="off"><div class="hits" id="storeHits" style="display:none"></div>' +
         '<div id="newStoreBox" style="display:none;margin-top:8px"><div class="alert a-amb">목록에 없는 가게 — 신규 거래처로 입력합니다</div><div class="fg"><label>주소 (선택)</label><input id="newAddr" placeholder="주소, 도시, 주"></div><button class="b-blue" id="btnNewStore">이 이름으로 신규 입력</button></div>';
  }
  h += '<div class="fg" style="margin-top:10px"><label>받은 날짜</label>' + inputDate('fD', F.d) + '</div></div>';

  /* 결제 */
  h += '<div class="card"><h2>받은 돈</h2><div id="pays">' + F.pays.map((p, i) => payRow(p, i)).join('') + '</div>' +
    '<div class="btns" style="margin-top:4px"><button class="b-ghost b-sm" id="btnAddPay">＋ 결제 추가 (체크 여러 장 등)</button>' +
    '<button class="b-ghost b-sm ' + (F.repl ? 'on' : '') + '" id="btnRepl" style="' + (F.repl ? 'background:#fee2e2;color:#991b1b' : '') + '">🔁 대체 체크' + (F.repl ? ' (바운스 대체분)' : '') + '</button></div>' +
    (F.repl ? '<div class="fg" style="margin-top:8px"><label>바운스된 원래 체크 번호</label><input id="fOrig" value="' + esc(F.orig) + '" placeholder="원래 체크 #"><div class="muted">대체 체크는 커미션 계산에서 빠집니다 (이미 한 번 계산된 돈)</div></div>' : '') +
    '</div>';

  /* 인보이스 */
  h += '<div class="card"><h2>인보이스 (어느 인보이스 돈인지)</h2><div id="arPick"></div><div id="invLines">' + F.invs.map((v, i) => invRow(v, i)).join('') + '</div>' +
    '<div class="btns" style="margin-top:4px"><button class="b-ghost b-sm" id="btnAddInv">＋ 직접 입력</button><button class="b-ghost b-sm" id="btnAddOther">🏬 다른 가게 인보이스</button></div>' +
    '<div class="sumbox" id="sumBox"></div>' +
    '<div class="fg"><label>메모</label><input id="fMemo" value="' + esc(F.memo || '') + '" placeholder="특이사항"></div></div>';
  h += '<div class="sticky"><button class="b-green" id="btnSave" style="padding:15px">' + (F.editing ? '수정 저장' : '저장') + '</button></div>';
  $('page').innerHTML = h;

  if (!F.store) {
    const q = $('storeQ');
    q.oninput = () => storeSearch(q.value);
    q.focus();
    $('btnNewStore').onclick = () => { F.store = q.value.trim().toUpperCase(); F.newStore = true; F.acct = null; F.addr = $('newAddr').value.trim(); paintEntry(); };
  } else { $('btnStoreX').onclick = () => { F.store = ''; F.acct = null; F.newStore = false; F.picked = []; F.invs = F.invs.filter(v => v.other); paintEntry(); }; }
  if ($('btnCancelEdit')) $('btnCancelEdit').onclick = () => { resetForm(); Router.go(S.role === 'salesman' ? 'mine' : 'verify'); };
  $('fD').onchange = () => { F.d = $('fD').value; };
  $('btnAddPay').onclick = () => { collectForm(); F.pays.push({ m: 'CHECK', ref: '', amt: '', dep: '', mob: false }); paintEntry(); };
  $('btnRepl').onclick = () => { collectForm(); F.repl = !F.repl; paintEntry(); };
  $('btnAddInv').onclick = () => { collectForm(); F.invs.push({ no: '', amt: '', manual: true }); paintEntry(); setTimeout(() => { const el = document.querySelector('#invLines .invrow:last-child input'); if (el) el.focus(); }, 0); };
  $('btnAddOther').onclick = () => { collectForm(); otherStoreDialog(); };
  $('btnSave').onclick = saveEntry;
  bindPays(); bindInvs(); paintArPick(); paintSum();
}
function payRow(p, i) {
  const seg = ['CHECK', 'CASH', 'ZELLE'].map(m => '<button class="' + (p.m === m ? 'on' : '') + '" data-pm="' + i + '|' + m + '">' + ({ CHECK: '체크', CASH: '캐쉬', ZELLE: 'Zelle' })[m] + '</button>').join('');
  return '<div class="payrow" data-pi="' + i + '">' + (F.pays.length > 1 ? '<button class="x" data-px="' + i + '">×</button>' : '') +
    '<div class="full seg" style="margin:0">' + seg + '</div>' +
    (p.m === 'CHECK' ? '<input class="sm" placeholder="체크 번호" data-pref="' + i + '" value="' + esc(p.ref) + '" inputmode="numeric">' : p.m === 'ZELLE' ? '<input class="sm" placeholder="Zelle 참조 (선택)" data-pref="' + i + '" value="' + esc(p.ref) + '">' : '<div></div>') +
    '<input class="sm" placeholder="금액 $" data-pamt="' + i + '" value="' + esc(p.amt) + '" inputmode="decimal" style="text-align:right;font-weight:800">' +
    (p.m === 'CHECK' ? '<div><label class="muted">체크 날짜 (선일자면)</label><input class="sm" type="date" data-pdep="' + i + '" value="' + esc(p.dep || '') + '"></div><label class="muted" style="display:flex;align-items:center;gap:6px;padding-top:18px"><input type="checkbox" class="ck-big" data-pmob="' + i + '" ' + (p.mob ? 'checked' : '') + ' style="width:20px;height:20px"> 📱 모바일 디파짓</label>' : '') + '</div>';
}
function bindPays() {
  document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { collectForm(); const [i, m] = b.dataset.pm.split('|'); F.pays[+i].m = m; paintEntry(); });
  document.querySelectorAll('[data-px]').forEach(b => b.onclick = () => { collectForm(); F.pays.splice(+b.dataset.px, 1); paintEntry(); });
  document.querySelectorAll('[data-pamt]').forEach(el => el.oninput = () => { collectForm(); arAlloc(); paintSum(); });
}
function invRow(v, i) {
  const other = v.other ? '<small class="muted" style="display:block">🏬 ' + esc(v.store || v.acct) + '</small>' : '';
  if (v.ar) return '<div class="invrow" data-ii="' + i + '"><div><b>' + esc(v.no) + '</b> <span class="tag t-b">AR</span>' + (v.partial ? ' <span class="tag t-c">일부</span>' : '') + other + '<small class="muted">잔액 ' + money(v.bal) + '</small></div><input data-iamt="' + i + '" value="' + esc(v.amt) + '" inputmode="decimal" style="text-align:right"><button class="x" style="position:static;width:26px;height:26px;border-radius:50%;background:#94a3b8;color:#fff;border:0" data-ix="' + i + '">×</button></div>';
  return '<div class="invrow" data-ii="' + i + '"><div><input data-ino="' + i + '" value="' + esc(v.no) + '" placeholder="인보이스 # (A/P/W/CM…)" style="text-transform:uppercase">' + other + '</div><input data-iamt="' + i + '" value="' + esc(v.amt) + '" placeholder="금액" inputmode="decimal" style="text-align:right"><button class="x" style="position:static;width:26px;height:26px;border-radius:50%;background:#94a3b8;color:#fff;border:0" data-ix="' + i + '">×</button></div>';
}
function bindInvs() {
  document.querySelectorAll('[data-ix]').forEach(b => b.onclick = () => { collectForm(); const v = F.invs[+b.dataset.ix]; if (v && v.ar) F.picked = F.picked.filter(k => k !== v.no); F.invs.splice(+b.dataset.ix, 1); paintEntry(); });
  document.querySelectorAll('[data-iamt]').forEach(el => el.oninput = () => { collectForm(); const v = F.invs[+el.dataset.iamt]; if (v) v.manual = true; paintSum(); });
  document.querySelectorAll('[data-ino]').forEach(el => el.oninput = () => collectForm());
}
function collectForm() {
  F.d = $('fD') ? $('fD').value : F.d;
  F.pays.forEach((p, i) => { const r = document.querySelector('[data-pref="' + i + '"]'), a = document.querySelector('[data-pamt="' + i + '"]'), d = document.querySelector('[data-pdep="' + i + '"]'), m = document.querySelector('[data-pmob="' + i + '"]');
    if (r) p.ref = r.value.trim(); if (a) p.amt = a.value; if (d) p.dep = d.value; if (m) p.mob = m.checked; });
  F.invs.forEach((v, i) => { const n = document.querySelector('[data-ino="' + i + '"]'), a = document.querySelector('[data-iamt="' + i + '"]'); if (n) v.no = n.value.trim().toUpperCase(); if (a) v.amt = a.value; });
  if ($('fMemo')) F.memo = $('fMemo').value; if ($('fOrig')) F.orig = $('fOrig').value.trim();
}
function payTotal() { return R2(F.pays.reduce((a, p) => a + num(p.amt), 0)); }
function invTotal() { return R2(F.invs.reduce((a, v) => a + num(v.amt), 0)); }
function paintSum() {
  const got = payTotal(), inv = invTotal(), diff = R2(got - inv), box = $('sumBox'); if (!box) return;
  let h = '받은 돈 <b>' + money(got) + '</b> · 인보이스 합 <b>' + money(inv) + '</b>';
  if (F.invs.length && Math.abs(diff) > 0.009) h += '<div class="warn" style="margin-top:4px">⚠️ 차액 ' + money(diff) + (diff > 0 ? ' — 인보이스를 덜 골랐거나 금액이 다릅니다' : ' — 인보이스가 받은 돈보다 많습니다') + '</div>';
  else if (F.invs.length) h += ' <span class="ok">✓ 맞음</span>';
  box.innerHTML = h;
}
function storeSearch(q) {
  const box = $('storeHits'), nb = $('newStoreBox');
  const hits = searchAccounts(S.accounts, q, 150);
  box.style.display = hits.length ? '' : 'none';
  box.innerHTML = (hits.total ? '<div class="muted" style="padding:6px 11px;font-size:12px;border-bottom:1px solid var(--line)">' + hits.total + '곳' + (hits.total > hits.length ? ' · ' + hits.length + '곳까지 표시 — 더 자세히 치세요' : '') + '</div>' : '') + hits.map(a => '<div data-acct="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + '</span><small>' + esc([a.addr, a.city, a.state].filter(Boolean).join(', ')) + (a.sm ? ' · ' + esc(a.sm) : '') + '</small></div>').join('');
  box.querySelectorAll('[data-acct]').forEach(d => d.onclick = () => pickStore(d.dataset.acct));
  nb.style.display = (q.trim().length >= 3 && !hits.length) ? '' : 'none';
}
function pickStore(acct) {
  const a = S.accounts.byCode[acct]; if (!a) return;
  F.acct = a.acct; F.store = a.store; F.newStore = false; F.addr = [a.addr, a.city, a.state, a.zip].filter(Boolean).join(', '); F.state = a.state || '';
  F.picked = []; F.invs = F.invs.filter(v => v.other);
  paintEntry();
}

/* ---- AR 인보이스 고르기 ---- */
async function arDoc() {
  if (CACHE.ar && Date.now() - CACHE.arAt < 600000) return CACHE.ar;
  try { CACHE.ar = await S.DB.get('ar', me()); } catch (e) { CACHE.ar = null; }
  CACHE.arAt = Date.now(); return CACHE.ar;
}
/** 기준일 뒤에 내가 받은 인보이스별 금액 (AR 잔액에서 빼기) */
async function paidSince(asOf) {
  const rows = await myEntries(), out = {};
  rows.forEach(e => { if (e.d <= asOf || e.repl) return; (e.invs || []).forEach(v => { const k = (v.acct || e.acct) + '|' + v.no; out[k] = R2((out[k] || 0) + num(v.amt)); }); });
  return out;
}
export async function openInvoices(acct) {
  const ar = await arDoc(); if (!ar || !ar.stores) return { asOf: '', list: [] };
  const st = ar.stores.find(s => s.acct === acct); if (!st) return { asOf: ar.asOf, list: [] };
  const paid = await paidSince(ar.asOf || '');
  const list = (st.invs || []).map(v => { const p = paid[acct + '|' + v.inv] || 0; return { no: v.inv, d: v.d, amt: v.amt, paid: p, bal: R2(v.bal - p), pdd: v.pdd, bk: v.bk }; });
  /* 앱에서 확정한 인보이스 (아직 SmartBee AR 에 없는 것) 도 같이 — 세일즈맨이 어느 인보이스에 얼마를 적용할지 고를 수 있게 */
  try {
    const wh = [['acct', '==', acct], ['st', '==', 'open']]; if (S.role === 'salesman') wh.push(['sm', '==', me()]);
    const app = await S.DB.list('invoices', { where: wh });
    const have = {}; list.forEach(v => { have[v.no] = 1; });
    app.forEach(x => { if (have[x.no]) return; const p = paid[acct + '|' + x.no] || 0, pdd = Math.max(0, daysBetween(x.d, today()) - 30); list.push({ no: x.no, d: x.d, amt: x.total, paid: p, bal: R2((x.bal != null ? x.bal : x.total) - p), pdd, bk: pdd <= 0 ? 0 : pdd <= 30 ? 1 : pdd <= 60 ? 2 : pdd <= 90 ? 3 : 4, app: true }); });
  } catch (e) {}
  list.sort((a, b) => a.d < b.d ? -1 : 1);
  return { asOf: ar.asOf, list: list.filter(v => v.bal > 0.005 || v.bal < -0.005) };
}
async function paintArPick() {
  const box = $('arPick'); if (!box) return;
  if (!F.acct) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="muted">미결 인보이스 읽는 중…</div>';
  const r = await openInvoices(F.acct);
  if (!$('arPick')) return;
  if (!r.list.length) { box.innerHTML = '<div class="muted">AR 에 미결 인보이스가 없습니다 (기준일 ' + esc(r.asOf || '—') + '). 아래에 직접 적어 주세요.</div>'; return; }
  F.arList = r.list;
  box.innerHTML = '<div class="muted" style="margin-bottom:4px">미결 인보이스 — 탭해서 고르면 금액이 자동으로 채워집니다 (기준일 ' + esc(r.asOf) + ')</div>' +
    r.list.map(v => '<div class="pick ' + (F.picked.includes(v.no) ? 'on' : '') + '" data-pk="' + esc(v.no) + '"><div class="ck">✓</div><div class="pm"><b>' + esc(v.no) + '</b> <span class="muted">' + md(v.d) + (v.pdd > 0 ? ' · ' + v.pdd + '일 연체' : '') + '</span><small>' + money(v.amt) + (v.paid ? ' (받은 ' + money(v.paid) + ')' : '') + '</small></div><b>' + money(v.bal) + '</b></div>').join('');
  box.querySelectorAll('[data-pk]').forEach(d => d.onclick = () => togglePick(d.dataset.pk));
}
function togglePick(no) {
  collectForm();
  const v = F.arList.find(x => x.no === no); if (!v) return;
  if (F.picked.includes(no)) { F.picked = F.picked.filter(k => k !== no); F.invs = F.invs.filter(i => !(i.ar && i.no === no && !i.other)); }
  else { F.picked.push(no); F.invs.push({ no, t: invType(no), amt: '', bal: v.bal, ar: true }); }
  arAlloc(); paintEntry();
}
/** 받은 돈을 고른 순서대로 채움 — 마지막에 고른 인보이스에 남는 금액(일부) */
function arAlloc() {
  const got = payTotal();
  const manual = F.invs.filter(v => !v.ar || v.manual).reduce((a, v) => a + num(v.amt), 0);
  let left = R2(got - manual);
  const auto = F.invs.filter(v => v.ar && !v.manual);
  auto.forEach((v, i) => { const take = Math.min(v.bal, Math.max(0, left)); v.amt = take ? take.toFixed(2) : '0.00'; v.partial = take > 0 && take < v.bal - 0.005; left = R2(left - take); });
  document.querySelectorAll('[data-iamt]').forEach(el => { const v = F.invs[+el.dataset.iamt]; if (v && v.ar && !v.manual) el.value = v.amt; });
}
async function otherStoreDialog() {
  openModal('<h2>🏬 다른 가게 인보이스</h2><p class="muted">한 체크로 다른 가게 인보이스까지 받았을 때. 그 가게를 찾아 인보이스를 고르거나 직접 적으세요.</p>' +
    '<input id="oq" placeholder="가게 이름 · 계정코드" autocomplete="off"><div class="hits" id="ohits" style="display:none"></div><div id="oinv"></div>');
  const q = $('oq'); q.focus();
  q.oninput = () => { const hits = searchAccounts(S.accounts, q.value, 100), box = $('ohits'); box.style.display = hits.length ? '' : 'none';
    box.innerHTML = hits.map(a => '<div data-oa="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + '</span></div>').join('');
    box.querySelectorAll('[data-oa]').forEach(d => d.onclick = () => otherPick(d.dataset.oa)); };
}
async function otherPick(acct) {
  const a = S.accounts.byCode[acct]; $('ohits').style.display = 'none'; $('oq').value = a.store;
  const r = await openInvoices(acct), box = $('oinv');
  box.innerHTML = '<div class="muted" style="margin:8px 0 4px">' + (r.list.length ? '미결 인보이스 — 탭해서 추가' : 'AR 에 미결 인보이스가 없습니다') + '</div>' +
    r.list.map(v => '<div class="pick" data-op="' + esc(v.no) + '"><div class="ck">＋</div><div class="pm"><b>' + esc(v.no) + '</b><small>' + md(v.d) + ' · ' + money(v.amt) + '</small></div><b>' + money(v.bal) + '</b></div>').join('') +
    '<button class="b-ghost" id="oman" style="margin-top:8px">직접 적기 (이 가게 인보이스)</button>';
  box.querySelectorAll('[data-op]').forEach(d => d.onclick = () => { const v = r.list.find(x => x.no === d.dataset.op); F.invs.push({ no: v.no, t: invType(v.no), amt: v.bal.toFixed(2), bal: v.bal, ar: true, manual: true, other: true, acct: a.acct, store: a.store }); closeModal(); paintEntry(); });
  $('oman').onclick = () => { F.invs.push({ no: '', amt: '', manual: true, other: true, acct: a.acct, store: a.store }); closeModal(); paintEntry(); };
}

async function saveEntry() {
  collectForm();
  if (!F.store) return toast('가게를 먼저 고르세요', 'bad');
  const pays = F.pays.map(p => ({ m: p.m, ref: p.ref || '', amt: R2(num(p.amt)), dep: p.dep || '', mob: !!p.mob })).filter(p => p.amt);
  if (!pays.length) return toast('금액을 넣어 주세요', 'bad');
  if (pays.some(p => p.m === 'CHECK' && !p.ref)) return toast('체크 번호를 넣어 주세요', 'bad');
  const invs = F.invs.map(v => ({ no: v.no || '', t: v.no ? invType(v.no) : '', amt: R2(num(v.amt)), acct: v.other ? v.acct : '', store: v.other ? v.store : '', partial: !!v.partial, ar: !!v.ar })).filter(v => v.no || v.amt);
  if (invs.some(v => v.amt && !v.no)) return toast('인보이스 번호가 빈 줄이 있습니다', 'bad');
  const total = sum(pays, p => p.amt), invTot = sum(invs, v => v.amt);
  const mismatch = invs.length && Math.abs(total - invTot) > 0.009 ? '⚠️ 인보이스 합 ' + money(invTot) + ' ≠ 받은 돈 ' + money(total) + ' (차액 ' + money(R2(total - invTot)) + ')' : '';
  if (F.repl && !F.orig) return toast('대체 체크면 원래 체크 번호를 넣어 주세요', 'bad');
  const id = F.editing || newId('E');
  const doc = { id, d: F.d, ym: ym(F.d), sm: me(), acct: F.acct || '', store: F.store, addr: F.addr || '', state: F.state || '', newStore: !!F.newStore,
    pays, invs, total, invTotal: invTot, mismatch, memo: F.memo || '', repl: !!F.repl, orig: F.orig || '', disc: '',
    createdBy: S.user.email, updatedAt: new Date().toISOString() };
  busy(true);
  try {
    if (F.editing) {
      const old = (await myEntries()).find(x => x.id === id);
      if (old && old.sb && S.role === 'salesman') { busy(false); return toast('담당자가 이미 SmartBee 처리한 건은 수정할 수 없습니다 — 담당자에게 말씀하세요', 'bad'); }
      await S.DB.update('entries', id, doc);
    } else {
      Object.assign(doc, { sb: false, rc: false, v: false, vn: '', settled: '', void: false, createdAt: new Date().toISOString() });
      await S.DB.set('entries', id, doc);
    }
    CACHE.entries = null;
    toast((F.editing ? '수정했습니다' : '저장했습니다') + ' ' + money(total) + (mismatch ? ' · 차액 있음 (담당자에게 표시됨)' : ''), 'good');
    resetForm(); Router.go(S.role === 'salesman' ? 'mine' : 'verify');
  } catch (e) { toast('저장 실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}

/* ============================================================
 *  ② 내 기록
 * ============================================================ */
async function pageMine() {
  if (!me()) return noSm();
  $('page').innerHTML = '<div class="load">내 기록 읽는 중…</div>';
  const rows = await myEntries(true);
  const t = today(), tm = ym(t);
  const todayAmt = sum(rows.filter(r => r.d === t), r => r.total), monAmt = sum(rows.filter(r => r.ym === tm), r => r.total);
  const by = groupBy(rows, r => r.d), days = Object.keys(by).sort().reverse();
  let h = '<div class="card"><h2>' + esc(me()) + ' — 수금</h2><div class="kpi" style="grid-template-columns:1fr 1fr"><div><b>' + money(todayAmt) + '</b><span>오늘 ' + rows.filter(r => r.d === t).length + '건</span></div><div><b>' + money(monAmt) + '</b><span>이번 달 ' + rows.filter(r => r.ym === tm).length + '건</span></div></div>' +
    '<div class="muted" style="margin-top:8px"><span class="stage"><i class="sb"></i></span> SmartBee 입력 · <span class="stage"><i class="rc"></i></span> 체크 수령 · <span class="stage"><i class="v"></i></span> 정산 확인 — 담당자·루크가 처리하면 색이 바뀝니다</div>' +
    '<button class="b-blue" id="btnNew" style="margin-top:12px">＋ 새 수금 입력</button></div>';
  if (!days.length) h += '<div class="card"><div class="none">최근 3개월 기록이 없습니다</div></div>';
  days.forEach(d => {
    const list = by[d];
    h += '<div class="card"><div class="dayhd"><span>' + dlabel(d) + '</span><span>' + money(sum(list, r => r.total)) + ' · ' + list.length + '건</span></div>' +
      list.map(r => entryRow(r)).join('') + '</div>';
  });
  $('page').innerHTML = h;
  $('btnNew').onclick = () => Router.go('entry', 'new');
  document.querySelectorAll('[data-eid]').forEach(el => el.onclick = () => entryDetail(el.dataset.eid));
}
function entryRow(r) {
  const m = (r.pays || []).map(p => (p.m === 'CHECK' ? '#' + p.ref : p.m === 'CASH' ? '캐쉬' : 'Zelle') + ' ' + money(p.amt)).join(' · ');
  return '<div class="pr tap ' + stageClass(r) + (r.mismatch ? ' bad' : '') + '" data-eid="' + r.id + '"><div class="mk">' + (r.v ? '✓' : r.rc ? '✓' : r.sb ? '✓' : '·') + '</div><div class="ct"><b>' + esc(r.store) + (r.repl ? ' <span class="tag t-r">대체</span>' : '') + (r.newStore ? ' <span class="tag t-c">신규</span>' : '') + '</b><small>' + esc(m) + (r.invs && r.invs.length ? ' · ' + r.invs.map(v => v.no).join(',') : '') + (r.mismatch ? ' · ⚠️ 차액' : '') + '</small></div><div class="pa"><b>' + money(r.total) + '</b><small>' + stageText(r) + '</small></div></div>';
}
async function entryDetail(id) {
  const r = (await myEntries()).find(x => x.id === id); if (!r) return;
  openModal('<h2>' + esc(r.store) + '</h2><div class="muted">' + dlabel(r.d) + ' · ' + esc(r.acct || '계정 없음') + ' · ' + stageText(r) + '</div>' +
    '<table style="margin-top:8px">' + (r.pays || []).map(p => '<tr><td>' + ({ CHECK: '체크 #' + esc(p.ref), CASH: '캐쉬', ZELLE: 'Zelle ' + esc(p.ref) })[p.m] + (p.dep ? ' <span class="muted">' + md(p.dep) + '</span>' : '') + (p.mob ? ' 📱' : '') + '</td><td class="r"><b>' + money(p.amt) + '</b></td></tr>').join('') + '</table>' +
    ((r.invs || []).length ? '<table style="margin-top:8px">' + r.invs.map(v => '<tr><td>' + esc(v.no) + (v.store ? ' <span class="muted">🏬 ' + esc(v.store) + '</span>' : '') + (v.partial ? ' <span class="tag t-c">일부</span>' : '') + '</td><td class="r">' + money(v.amt) + '</td></tr>').join('') + '</table>' : '') +
    (r.mismatch ? '<div class="alert a-red">' + esc(r.mismatch) + '</div>' : '') + (r.memo ? '<div class="muted" style="margin-top:6px">메모: ' + esc(r.memo) + '</div>' : '') + (r.vn ? '<div class="alert a-amb">담당자/루크 메모: ' + esc(r.vn) + '</div>' : '') +
    '<div class="btns">' + (r.sb ? '<div class="muted">담당자가 처리한 건이라 수정할 수 없습니다. 틀렸으면 담당자에게 말씀하세요.</div>' : '<button class="b-ghost" id="dVoid">취소(VOID)</button><button class="b-blue" id="dEdit">수정</button>') + '</div>');
  if ($('dEdit')) $('dEdit').onclick = () => { closeModal(); Router.go('entry', id); };
  if ($('dVoid')) $('dVoid').onclick = async () => { if (!(await confirmBox('이 수금을 취소할까요? 리스트에서 빠집니다.', '취소하기'))) return; busy(true); try { await S.DB.update('entries', id, { void: true, updatedAt: new Date().toISOString() }); CACHE.entries = null; toast('취소했습니다'); pageMine(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  ③ 미수금 AR (내 담당 가게)
 * ============================================================ */
const BK = ['기한 전', '1-30일', '31-60일', '61-90일', '90일+'];
let AR_F = 'all';
async function pageAR() {
  if (!me()) return noSm();
  $('page').innerHTML = '<div class="load">AR 읽는 중…</div>';
  const ar = await arDoc();
  if (!ar || !ar.stores) { $('page').innerHTML = '<div class="card"><div class="none">아직 올라온 AR 이 없습니다. 담당자가 SmartBee AR 을 올리면 여기에 보입니다.</div></div>'; return; }
  const paid = await paidSince(ar.asOf || '');
  const stores = ar.stores.map(s => {
    let net = 0; const b = [0, 0, 0, 0, 0];
    const invs = (s.invs || []).map(v => { const p = paid[s.acct + '|' + v.inv] || 0; const bal = R2(v.bal - p); return Object.assign({}, v, { paid: p, net: bal }); });
    invs.forEach(v => { net += v.net; if (v.net > 0) b[Math.max(0, Math.min(4, v.bk || 0))] += v.net; else b[0] += v.net; });
    return Object.assign({}, s, { net: R2(net), b: b.map(R2), invs, done: net <= 0.005, maxPdd: Math.max(0, ...invs.filter(v => v.net > 0.005).map(v => v.pdd || 0)) });
  });
  const live = stores.filter(s => !s.done), done = stores.filter(s => s.done);
  const total = sum(live, s => s.net), bk = [0, 1, 2, 3, 4].map(i => sum(live, s => s.b[i]));
  const stale = daysBetween(ar.asOf, today());
  const dormant = live.filter(s => s.dormant);
  const filt = AR_F === 'all' ? live : AR_F === 'z' ? dormant : AR_F === 'done' ? done : live.filter(s => s.b[+AR_F] > 0.005);
  let h = '<div class="card"><h2>' + esc(me()) + ' 미수금 <span class="muted">기준일 ' + esc(ar.asOf) + (stale > 10 ? ' <span class="warn">(' + stale + '일 전)</span>' : '') + '</span></h2><div class="hero">' + money(total) + '</div><div class="heroSub">' + live.length + '곳 · 기준일 뒤 받은 돈은 뺐습니다</div>' +
    '<div class="kpi" style="grid-template-columns:repeat(5,1fr)">' + bk.map((v, i) => '<div class="' + (i >= 3 ? 'bad' : '') + '"><b style="font-size:12px">' + money(v) + '</b><span>' + BK[i] + '</span></div>').join('') + '</div>' +
    '<div class="chips">' + [['all', '전체 ' + live.length], ['4', '90일+ ' + live.filter(s => s.b[4] > 0.005).length], ['3', '61-90 ' + live.filter(s => s.b[3] > 0.005).length], ['z', '💤 1년+ ' + dormant.length], ['done', '✅ 받을 것 없음 ' + done.length]].map(c => '<button class="' + (AR_F === c[0] ? 'on' : '') + '" data-arf="' + c[0] + '">' + c[1] + '</button>').join('') + '</div></div>';
  h += '<div class="card">' + (filt.length ? sortBy(filt, s => s.maxPdd, true).map(s => '<div class="pr tap" data-ars="' + esc(s.acct) + '"><div class="ct"><b>' + esc(s.store) + (s.dormant ? ' <span class="tag t-g">💤</span>' : '') + (s.moved ? ' <span class="tag t-a">SmartBee ' + esc(s.moved) + '</span>' : '') + '</b><small>' + esc(s.acct) + ' · ' + s.invs.filter(v => v.net > 0.005).length + '건' + (s.lastPaid ? ' · 마지막 수금 ' + md(s.lastPaid) : '') + '</small></div><div class="pa"><b>' + money(s.net) + '</b><small class="' + (s.maxPdd > 60 ? 'warn' : '') + '">' + (s.maxPdd > 0 ? s.maxPdd + '일 연체' : '기한 전') + '</small></div></div>').join('') : '<div class="none">없음</div>') + '</div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-arf]').forEach(b => b.onclick = () => { AR_F = b.dataset.arf; pageAR(); });
  document.querySelectorAll('[data-ars]').forEach(el => el.onclick = () => { const s = stores.find(x => x.acct === el.dataset.ars); arStore(s); });
}
function arStore(s) {
  openModal('<h2>' + esc(s.store) + '</h2><div class="muted">' + esc(s.acct) + ' · 잔액 <b>' + money(s.net) + '</b></div>' +
    '<table style="margin-top:8px"><tr><th>인보이스</th><th>날짜</th><th class="r">연체</th><th class="r">잔액</th></tr>' + s.invs.filter(v => Math.abs(v.net) > 0.005).map(v => '<tr><td>' + esc(v.inv) + '</td><td>' + md(v.d) + '</td><td class="r ' + (v.pdd > 60 ? 'warn' : '') + '">' + (v.pdd > 0 ? v.pdd + '일' : 'D' + v.pdd) + '</td><td class="r"><b>' + money(v.net) + '</b>' + (v.paid ? '<br><small class="muted">받음 ' + money(v.paid) + '</small>' : '') + '</td></tr>').join('') + '</table>' +
    '<div class="btns"><button class="b-blue" id="arGo">＋ 이 가게 수금 입력</button></div>');
  $('arGo').onclick = () => { closeModal(); resetForm(); pickStore(s.acct); Router.go('entry'); };
}

/* ============================================================
 *  ④ 내 정산서 (정산 확정된 것 + 진행 중 미리보기)
 * ============================================================ */
async function pageMyComm() {
  if (!me()) return noSm();
  $('page').innerHTML = '<div class="load">읽는 중…</div>';
  const list = sortBy(await S.DB.list('settlements', { where: [['sm', '==', me()]] }), s => s.day, true);
  let h = '<div class="card"><h2>정산서</h2>' + (list.length ? list.map(s => '<div class="pr tap" data-sid="' + s.id + '"><div class="ct"><b>' + esc(s.day) + ' 정산</b><small>' + esc(s.from || '') + ' ~ ' + esc(s.to || '') + ' · ' + s.n + '줄</small></div><div class="pa"><b>' + money(s.pay) + '</b><small>지급액</small></div></div>').join('') : '<div class="none">아직 확정된 정산서가 없습니다</div>') + '</div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-sid]').forEach(el => el.onclick = async () => { const s = list.find(x => x.id === el.dataset.sid); printOpen(settlementHtml(s)); });
}
export function settlementHtml(s) {
  const c = s.comm || {};
  const secs = [['REG', 'COMMISSION (A)'], ['P', 'P 인보이스 (EDGE & KEY)'], ['SPECIAL', c.specialTitle || 'EXCHANGE'], ['DISC', 'DISCOUNT 초과'], ['NEWDP', 'NEW DP (W)']];
  let rows = '';
  (c.lines || []).forEach((L, i) => { rows += '<tr><td class="r">' + (i + 1) + '</td><td>' + esc(L.d) + '</td><td>' + esc(L.store) + '</td><td>' + esc(L.methods) + '</td><td class="r">' + money(L.e) + '</td><td class="r">' + money(L.f) + '</td><td>' + esc(L.invs) + '</td><td class="r">' + (L.P ? money(L.P) : '') + '</td><td class="r">' + (L.W ? money(L.W) : '') + '</td><td>' + esc(SEC_LABEL[L.sec] || L.sec) + '</td></tr>'; });
  return '<h1>' + esc(s.sm) + ' 커미션 정산서</h1><div class="meta">정산일 ' + esc(s.day) + ' · 기간 ' + esc(s.from || '') + ' ~ ' + esc(s.to || '') + ' · THE ONE CORP</div>' +
    '<table class="box"><tr><td>수금 합계 (CHECK · ZELLE · COD · ACH · CARD)</td><td class="r">' + money(c.totals && c.totals.check) + '</td></tr><tr><td>CASH</td><td class="r">' + money(c.totals && c.totals.cash) + '</td></tr><tr><td><b>TOTAL</b></td><td class="r"><b>' + money(c.totals && c.totals.total) + '</b></td></tr></table>' +
    '<table style="margin:14px 0"><tr><th>구분</th><th class="r">대상 금액</th><th class="r">요율</th><th class="r">커미션</th></tr>' + (c.buckets || []).map(b => '<tr><td>' + esc(b.label) + '</td><td class="r">' + money(b.base) + '</td><td class="r">' + (b.rate * 100).toFixed(1) + '%</td><td class="r">' + money(b.amt) + '</td></tr>').join('') +
    '<tr><td colspan="3" class="r"><b>NET</b></td><td class="r"><b>' + money(c.net) + '</b></td></tr><tr><td colspan="3" class="r">DP ' + ((c.dp || {}).rate * 100).toFixed(1) + '%</td><td class="r">− ' + money((c.dp || {}).amt) + '</td></tr><tr><td colspan="3" class="r">OFFICE ' + ((c.office || {}).rate * 100).toFixed(1) + '%</td><td class="r">− ' + money((c.office || {}).amt) + '</td></tr><tr class="fin"><td colspan="3" class="r">지급액 TOTAL</td><td class="r">' + money(c.pay) + '</td></tr></table>' +
    '<table><tr><th class="r">#</th><th>받은 날</th><th>가게</th><th>방법</th><th class="r">CHECK·ACH</th><th class="r">CASH</th><th>인보이스</th><th class="r">P</th><th class="r">W</th><th>구역</th></tr>' + rows + '</table>' +
    '<div class="sig"><div>세일즈맨 확인 Salesman</div><div>회사 확인 Office</div></div>';
}
