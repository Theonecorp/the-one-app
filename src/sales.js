/* ============================================================
 *  세일즈맨 화면 — 수금 입력 · 내 기록 · 미수금 AR · 정산서
 *  entries/{id} = { id, d, ym, sm, acct, store, addr, state, newStore,
 *    pays:[{m, ref, amt, dep, mob}], invs:[{no, t, amt, acct, store, partial}],
 *    total, invTotal, mismatch, memo, repl, orig, disc,
 *    sb, rc, v, vn, settled, void, createdBy, createdAt, updatedAt }
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sum, sortBy, groupBy, printOpen, daysBetween, pad4, nz, bi, bt, invNo } from './ui.js';
import { newId } from './db.js';
import { searchAccounts, accountLabel } from './accounts.js';
import * as Store from './store.js';
import { lineOfEntry, lineOfOther, computeComm, ratesOf, commSettings, invType, SEC_LABEL } from './comm.js';

let S = null, ME = '', CACHE = { entries: null, ar: null, arAt: 0 };
export function register(state) {
  S = state;
  Router.on('mycomm', pageMyComm);   /* entry · mine · ar 는 collect.js (수금 허브) 가 맡음 */
}
function me() { ME = F.sm || ((S.me && S.me.sm) ? String(S.me.sm).toUpperCase() : ''); return ME; }
export function clearEntryCache() { CACHE.entries = null; CACHE.ar = null; }
export function setFormSm(sm) { F.sm = sm ? String(sm).toUpperCase() : ''; }
function noSm() { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.<br>관리자가 관리 → 사용자에서 세일즈맨을 지정해야 합니다.</div></div>'; }

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
export function stageText(e) { return e.settled ? '정산 완료 · Settled' : e.v ? '③ 정산 확인 · Verified' : e.rc ? '② 체크 수령 · Received' : e.sb ? '① 접수 확인 · Reviewed' : '입력됨 · Entered'; }

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
  const got = payTotal(), inv = invTotal();
  const step = !F.store ? 1 : !got ? 2 : (!F.invs.length ? 3 : 4);
  /* 단계 표시 — 세일즈맨이 어디까지 했는지 한눈에 */
  const steps = [['가게', 'Store', !!F.store], ['받은 돈', 'Payment', got > 0], ['인보이스', 'Invoice', F.invs.length > 0], ['저장', 'Save', false]];
  let h = '<div class="steps">' + steps.map((x, i) => '<div class="st' + (x[2] ? ' done' : '') + (i + 1 === step ? ' now' : '') + '"><span class="n">' + (x[2] ? '✓' : i + 1) + '</span><b>' + x[0] + '</b><small>' + x[1] + '</small></div>').join('') + '</div>';
  h += '<div class="card">' + (F.editing ? '<div class="alert a-amb" style="margin:0 0 10px">✏️ 수정 중 — ' + esc(F.editing) + ' <button class="b-ghost b-sm" style="float:right" id="btnCancelEdit">취소</button></div>' : '') +
    '<h2>🏬 ' + bi('가게', 'Store') + '</h2>';
  if (F.store) {
    h += '<div class="pick on" id="storeCard" style="padding:12px"><div class="pm"><b style="font-size:17px">' + esc(F.store) + '</b>' + (F.newStore ? ' <span class="tag t-c">신규 new</span>' : '') + '<small>' + (acc ? esc(acc.acct + ' · ' + [acc.addr, acc.city, acc.state].filter(Boolean).join(', ')) : esc(F.addr || '계정 없음')) + '</small><small id="eBal"></small></div>' + (F.acct ? '<button class="b-ghost b-sm" id="btnStoreI">📋 ' + bi('기록', 'Record') + '</button>' : '') + '<button class="b-ghost b-sm" id="btnStoreX">' + bi('바꾸기', 'Change') + '</button></div>';
  } else {
    h += '<input id="storeQ" placeholder="가게 이름 · 계정코드 · 도시 / Store · Acct · City" autocomplete="off"><div class="hits" id="storeHits" style="display:none"></div>' +
         '<div id="newStoreBox" style="display:none;margin-top:8px"><div class="alert a-amb">목록에 없는 가게 — 신규 거래처로 입력합니다 <span class="en">Not in list — enter as new store</span></div><div class="fg"><label>주소 (선택) Address</label><input id="newAddr" placeholder="주소, 도시, 주"></div><button class="b-blue" id="btnNewStore">' + bi('이 이름으로 신규 입력', 'Add as new store') + '</button></div>';
  }
  h += '<div class="two" style="margin-top:10px;align-items:end"><div class="fg" style="margin:0"><label>' + bi('받은 날짜', 'Date received') + '</label>' + inputDate('fD', F.d) + '</div><div class="muted" style="padding-bottom:10px">' + (F.d === today() ? '오늘 today' : dlabel(F.d)) + '</div></div></div>';

  /* 받은 돈 — 방법 크게, 금액 크게 */
  h += '<div class="card"><h2>💵 ' + bi('받은 돈', 'Payment received') + (got ? ' <span class="tag t-g" style="font-size:13px">' + money(got) + '</span>' : '') + '</h2><div id="pays">' + F.pays.map((p, i) => payRow(p, i)).join('') + '</div>' +
    '<div class="btns" style="margin-top:4px;flex-wrap:wrap"><button class="b-ghost b-sm" id="btnAddPay">＋ ' + bi('체크 한 장 더', 'Add another') + '</button>' +
    '<button class="b-ghost b-sm" id="btnRepl" style="' + (F.repl ? 'background:#fee2e2;color:#991b1b' : '') + '">🔁 ' + bi('대체 체크', 'Replacement') + (F.repl ? ' ✓' : '') + '</button></div>' +
    (F.repl ? '<div class="fg" style="margin-top:8px"><label>바운스된 원래 체크 번호 · original bounced check #</label><input id="fOrig" value="' + esc(F.orig) + '" placeholder="원래 체크 #"><div class="muted">대체 체크는 커미션 계산에서 빠집니다 (이미 한 번 계산된 돈)</div></div>' : '') +
    '</div>';

  /* 인보이스 — 탭해서 고르기 */
  h += '<div class="card"><h2>🧾 ' + bi('어느 인보이스 돈인지', 'Apply to invoices') + '</h2><div id="arPick"></div><div id="invLines">' + F.invs.map((v, i) => invRow(v, i)).join('') + '</div>' +
    '<div class="btns" style="margin-top:4px"><button class="b-ghost b-sm" id="btnAddInv">＋ ' + bi('번호 직접 입력', 'Type invoice #') + '</button><button class="b-ghost b-sm" id="btnAddOther">🏬 ' + bi('다른 가게 인보이스', 'Other store') + '</button></div>' +
    '<div id="sumBox" style="margin-top:8px"></div>' +
    '<div class="fg" style="margin-top:10px"><label>📝 ' + bi('메모', 'Memo') + '</label><input id="fMemo" value="' + esc(F.memo || '') + '" placeholder="특이사항 · 할인 요청 · notes"></div></div>';
  /* 아래 고정 바 — 주문처럼: 가게 · 받은 돈(크게) · 맞는지 */
  h += '<div class="sticky"><div class="tbar"><div class="tl"><b>' + esc(F.store || '가게를 고르세요 · pick a store') + '</b><small id="tbSub">' + tbarSub() + '</small></div><div class="ta" id="tbAmt">' + money(got) + '</div></div>' +
    '<div class="btns" style="margin-top:6px">' + (F.editing ? '<button class="b-ghost" id="btnCancelEdit2" style="flex:0 0 96px">' + bi('취소', 'Cancel') + '</button>' : '') + '<button class="b-green" id="btnSave">💾 ' + bi(F.editing ? '수정 저장' : '저장', 'Save') + '</button></div></div>';
  $('page').innerHTML = h;

  if (!F.store) {
    const q = $('storeQ');
    q.oninput = () => storeSearch(q.value);
    if (!('ontouchstart' in window)) q.focus();
    $('btnNewStore').onclick = () => { F.store = q.value.trim().toUpperCase(); F.newStore = true; F.acct = null; F.addr = $('newAddr').value.trim(); paintEntry(); };
  } else {
    $('btnStoreX').onclick = async () => { if ((payTotal() || F.invs.length) && !(await confirmBox('가게를 바꿀까요? 고른 인보이스는 지워집니다. / Change store?', '바꾸기'))) return; F.store = ''; F.acct = null; F.newStore = false; F.picked = []; F.invs = F.invs.filter(v => v.other); paintEntry(); };
    if ($('btnStoreI')) $('btnStoreI').onclick = () => Store.storeSheet(F.acct);
    if (F.acct) Store.storeInfo(F.acct).then(info => { const el = $('eBal'); if (!el || !F.acct) return; const over = info.bk[3] + info.bk[4]; el.innerHTML = info.asOf || info.invs.length ? '미수금 due <b class="' + (info.bal > 0.005 ? 'warn' : 'ok') + '">' + money(info.bal) + '</b>' + (over > 0.005 ? ' · 60일+ <b class="warn">' + money(over) + '</b>' : '') : ''; }).catch(() => {});
  }
  const cancelEdit = () => { resetForm(); Router.go(S.role === 'salesman' ? 'mine' : 'verify'); };
  if ($('btnCancelEdit')) $('btnCancelEdit').onclick = cancelEdit; if ($('btnCancelEdit2')) $('btnCancelEdit2').onclick = cancelEdit;
  $('fD').onchange = () => { F.d = $('fD').value; };
  $('btnAddPay').onclick = () => { collectForm(); F.pays.push({ m: 'CHECK', ref: '', amt: '', dep: '', mob: false }); paintEntry(); setTimeout(() => { const els = document.querySelectorAll('[data-pref]'); const el = els[els.length - 1]; if (el) el.focus(); }, 0); };
  $('btnRepl').onclick = () => { collectForm(); F.repl = !F.repl; paintEntry(); };
  $('btnAddInv').onclick = () => { collectForm(); F.invs.push({ no: '', amt: '', manual: true }); paintEntry(); setTimeout(() => { const el = document.querySelector('#invLines .invrow:last-child input'); if (el) el.focus(); }, 0); };
  $('btnAddOther').onclick = () => { collectForm(); otherStoreDialog(); };
  $('btnSave').onclick = saveEntry;
  bindPays(); bindInvs(); paintArPick(); paintSum();
}
function tbarSub() {
  const got = payTotal(), inv = invTotal(), diff = R2(got - inv);
  const ways = F.pays.filter(p => num(p.amt)).map(p => p.m === 'CHECK' ? '체크' + (p.ref ? ' #' + p.ref : '') : p.m === 'CASH' ? '캐쉬' : 'Zelle').join(' · ');
  return (ways || '받은 돈을 넣으세요 · enter payment') + (F.invs.length ? (Math.abs(diff) > 0.009 ? ' · ⚠️ 차액 ' + money(diff) : ' · ✓ 인보이스 맞음') : '');
}
function payRow(p, i) {
  const seg = ['CHECK', 'CASH', 'ZELLE'].map(m => '<button class="' + (p.m === m ? 'on' : '') + '" data-pm="' + i + '|' + m + '">' + ({ CHECK: '🧾 체크 Check', CASH: '💵 캐쉬 Cash', ZELLE: '📲 Zelle' })[m] + '</button>').join('');
  return '<div class="payrow big" data-pi="' + i + '">' + (F.pays.length > 1 ? '<button class="x" data-px="' + i + '">×</button>' : '') +
    '<div class="full seg" style="margin:0">' + seg + '</div>' +
    (p.m === 'CHECK' ? '<input class="sm" placeholder="체크 번호 · check #" data-pref="' + i + '" value="' + esc(p.ref) + '" inputmode="numeric">' : p.m === 'ZELLE' ? '<input class="sm" placeholder="Zelle 참조 (선택)" data-pref="' + i + '" value="' + esc(p.ref) + '">' : '<div class="muted" style="align-self:center">현금 · cash</div>') +
    '<div class="amt"><span>$</span><input placeholder="0.00" data-pamt="' + i + '" value="' + esc(p.amt) + '" inputmode="decimal"></div>' +
    (p.m === 'CHECK' ? '<details class="full"><summary class="muted">선일자 체크 · 모바일 디파짓 (옵션) <span class="en">post-dated / mobile deposit</span></summary><div class="two" style="margin-top:6px"><div><label class="muted">체크 날짜 (선일자면)</label><input class="sm" type="date" data-pdep="' + i + '" value="' + esc(p.dep || '') + '"></div><label class="muted" style="display:flex;align-items:center;gap:6px;padding-top:18px"><input type="checkbox" class="ck-big" data-pmob="' + i + '" ' + (p.mob ? 'checked' : '') + ' style="width:20px;height:20px"> 📱 모바일 디파짓</label></div></details>' : '') + '</div>';
}
function bindPays() {
  document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { collectForm(); const [i, m] = b.dataset.pm.split('|'); F.pays[+i].m = m; paintEntry(); });
  document.querySelectorAll('[data-px]').forEach(b => b.onclick = () => { collectForm(); F.pays.splice(+b.dataset.px, 1); paintEntry(); });
  document.querySelectorAll('[data-pamt]').forEach(el => { el.oninput = () => { collectForm(); arAlloc(); paintSum(); }; el.onfocus = () => el.select(); });
}
function invRow(v, i) {
  const other = v.other ? '<small class="muted" style="display:block">🏬 ' + esc(v.store || v.acct) + '</small>' : '';
  const x = '<button class="x" data-ix="' + i + '" style="position:static;width:30px;height:30px;border-radius:50%;background:#e2e8f0;color:#475569;border:0;font-size:16px">×</button>';
  if (v.ar) return '<div class="invrow" data-ii="' + i + '"><div><b style="font-size:15px">' + esc(v.no) + '</b> <span class="tag t-b">' + (v.app ? '앱' : 'AR') + '</span>' + (v.partial ? ' <span class="tag t-c">일부 partial</span>' : '') + other + '<small class="muted">잔액 due ' + money(v.bal) + '</small></div><div class="amt sm"><span>$</span><input data-iamt="' + i + '" value="' + esc(v.amt) + '" inputmode="decimal"></div>' + x + '</div>';
  return '<div class="invrow" data-ii="' + i + '"><div><input data-ino="' + i + '" value="' + esc(v.no) + '" placeholder="인보이스 # (A43107 …)" style="text-transform:uppercase">' + other + '</div><div class="amt sm"><span>$</span><input data-iamt="' + i + '" value="' + esc(v.amt) + '" placeholder="0.00" inputmode="decimal"></div>' + x + '</div>';
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
  F.invs.forEach((v, i) => { const n = document.querySelector('[data-ino="' + i + '"]'), a = document.querySelector('[data-iamt="' + i + '"]'); if (n) v.no = invNo(n.value); if (a) v.amt = a.value; });
  if ($('fMemo')) F.memo = $('fMemo').value; if ($('fOrig')) F.orig = $('fOrig').value.trim();
}
function payTotal() { return R2(F.pays.reduce((a, p) => a + num(p.amt), 0)); }
function invTotal() { return R2(F.invs.reduce((a, v) => a + num(v.amt), 0)); }
function paintSum() {
  const got = payTotal(), inv = invTotal(), diff = R2(got - inv), box = $('sumBox');
  if ($('tbAmt')) $('tbAmt').textContent = money(got); if ($('tbSub')) $('tbSub').textContent = tbarSub();
  if (!box) return;
  if (!F.invs.length) { box.innerHTML = got ? '<div class="alert a-amb">인보이스를 고르거나 번호를 적어 주세요 — 어느 인보이스 돈인지 알아야 정산이 됩니다 <span class="en">Pick the invoices this payment covers</span></div>' : ''; return; }
  box.innerHTML = '<div class="trow sum" style="margin:0"><div class="tx"><b>받은 돈 ' + money(got) + ' · 인보이스 ' + money(inv) + '</b><small>' + (Math.abs(diff) > 0.009 ? '⚠️ 차액 ' + money(diff) + (diff > 0 ? ' — 인보이스를 덜 골랐거나 금액이 다릅니다' : ' — 인보이스가 받은 돈보다 많습니다') : '✓ 맞음 · matches') + '</small></div><span class="ta ' + (Math.abs(diff) > 0.009 ? 'warn' : 'ok') + '">' + (Math.abs(diff) > 0.009 ? money(diff) : '✓') + '</span></div>';
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
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
  toast('✓ ' + a.store + ' 선택 · selected', 'good');
  setTimeout(() => { const el = document.querySelector('[data-pamt]'); if (el && !('ontouchstart' in window)) el.focus(); }, 50);
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
  const list = (st.invs || []).map(v => { const p = v.app ? 0 : (paid[acct + '|' + v.inv] || 0); return { no: v.inv, d: v.d, amt: v.amt, paid: p, bal: R2(v.bal - p), pdd: v.pdd, bk: v.bk }; });
  /* 앱에서 확정한 인보이스 (아직 올린 AR 에 없는 것) 도 같이 — 세일즈맨이 어느 인보이스에 얼마를 적용할지 고를 수 있게 */
  try {
    const wh = [['acct', '==', acct], ['st', '==', 'open']]; if (S.role === 'salesman') wh.push(['sm', '==', me()]);
    const app = await S.DB.list('invoices', { where: wh });
    const have = {}; list.forEach(v => { have[v.no] = 1; });
    const ents = await myEntries();
    app.forEach(x => { if (have[x.no] || x.src === 'legacy') return;   // 이전 시스템 인보이스 — AR 이 기준
      /* 앱 인보이스: bal 에는 담당자가 확인한 수금이 이미 빠져 있음 → 아직 확인 전인 내 수금만 더 뺌 */
      const pays = x.pays || {}, p = ents.filter(e => !e.void && !e.repl && !(e.id in pays)).reduce((a, e) => a + (e.invs || []).filter(v => v.no === x.no).reduce((b, v) => b + num(v.amt), 0), 0), pdd = Math.max(0, daysBetween(x.d, today()) - 30);
      list.push({ no: x.no, d: x.d, amt: x.total, paid: R2((x.total || 0) - (x.bal != null ? x.bal : x.total) + p), bal: R2((x.bal != null ? x.bal : x.total) - p), pdd, bk: pdd <= 0 ? 0 : pdd <= 30 ? 1 : pdd <= 60 ? 2 : pdd <= 90 ? 3 : 4, app: true }); });
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
  if (!r.list.length) { box.innerHTML = '<div class="muted">미결 인보이스가 없습니다 (AR 기준일 ' + esc(r.asOf || '—') + '). 아래 "번호 직접 입력"으로 적어 주세요. <span class="en">No open invoices on file — type the number below.</span></div>'; return; }
  F.arList = r.list;
  const openSum = r.list.reduce((a, v) => a + (v.bal > 0 ? v.bal : 0), 0);
  box.innerHTML = '<div class="muted" style="margin-bottom:6px">미결 ' + r.list.length + '장 · ' + money(openSum) + ' — 탭해서 고르면 받은 돈이 순서대로 채워집니다 <span class="en">Tap to apply</span>' + (r.asOf ? ' · AR ' + esc(r.asOf) : '') + '</div>' +
    r.list.map(v => '<div class="pick inv ' + (F.picked.includes(v.no) ? 'on' : '') + (v.bk >= 3 ? ' late' : '') + '" data-pk="' + esc(v.no) + '"><div class="ck">✓</div><div class="pm"><b>' + esc(v.no) + (v.app ? ' <span class="tag t-b">앱</span>' : '') + '</b><small>' + md(v.d) + (v.pdd > 0 ? ' · <span class="warn">' + v.pdd + '일 지남 overdue</span>' : ' · 기한 전') + ' · ' + money(v.amt) + (v.paid ? ' (받은 ' + money(v.paid) + ')' : '') + '</small></div><b style="font-size:16px">' + money(v.bal) + '</b></div>').join('');
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
  const invs = F.invs.map(v => ({ no: invNo(v.no), t: v.no ? invType(v.no) : '', amt: R2(num(v.amt)), acct: v.other ? v.acct : '', store: v.other ? v.store : '', partial: !!v.partial, ar: !!v.ar })).filter(v => v.no || v.amt);
  if (invs.some(v => v.amt && !v.no)) return toast('인보이스 번호가 빈 줄이 있습니다', 'bad');
  const total = sum(pays, p => p.amt), invTot = sum(invs, v => v.amt);
  const mismatch = invs.length && Math.abs(total - invTot) > 0.009 ? '⚠️ 인보이스 합 ' + money(invTot) + ' ≠ 받은 돈 ' + money(total) + ' (차액 ' + money(R2(total - invTot)) + ')' : '';
  if (F.repl && !F.orig) return toast('대체 체크면 원래 체크 번호를 넣어 주세요', 'bad');
  if (!(await confirmBox(F.store + ' — ' + money(total) + ' (' + pays.map(p => p.m === 'CHECK' ? '체크 #' + p.ref : p.m === 'CASH' ? '캐쉬' : 'Zelle').join(', ') + ')' + (invs.length ? ' → ' + invs.map(v => v.no).join(', ') : ' · 인보이스 없음') + (mismatch ? '\n' + mismatch : '') + '\n저장할까요? / Save this payment?', '저장 Save'))) return;
  const id = F.editing || newId('E');
  const doc = { id, d: F.d, ym: ym(F.d), sm: me(), acct: F.acct || '', store: F.store, addr: F.addr || '', state: F.state || '', newStore: !!F.newStore,
    pays, invs, total, invTotal: invTot, mismatch, memo: F.memo || '', repl: !!F.repl, orig: F.orig || '', disc: '',
    createdBy: S.user.email, updatedAt: new Date().toISOString() };
  busy(true);
  try {
    if (F.editing) {
      const old = (await myEntries()).find(x => x.id === id);
      if (old && old.sb && S.role === 'salesman') { busy(false); return toast('담당자가 이미 확인한 건은 수정할 수 없습니다 — 담당자에게 말씀하세요', 'bad'); }
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
    '<div class="muted" style="margin-top:8px"><span class="stage"><i class="sb"></i></span> 접수 확인 · <span class="stage"><i class="rc"></i></span> 체크 수령 · <span class="stage"><i class="v"></i></span> 정산 확인 — 담당자·관리자가 처리하면 색이 바뀝니다</div>' +
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
    (r.mismatch ? '<div class="alert a-red">' + esc(r.mismatch) + '</div>' : '') + (r.memo ? '<div class="muted" style="margin-top:6px">메모: ' + esc(r.memo) + '</div>' : '') + (r.vn ? '<div class="alert a-amb">담당자 · 관리자 메모: ' + esc(r.vn) + '</div>' : '') +
    '<div class="btns">' + (r.sb ? '<div class="muted">담당자가 이미 확인한 건이라 수정할 수 없습니다. 틀렸으면 담당자에게 말씀하세요.</div>' : '<button class="b-ghost" id="dVoid">취소(VOID)</button><button class="b-blue" id="dEdit">수정</button>') + '</div>');
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
  if (!ar || !ar.stores) { $('page').innerHTML = '<div class="card"><div class="none">아직 올라온 AR 이 없습니다. 담당자가 미수금(AR)을 올리면 여기에 보입니다.</div></div>'; return; }
  const paid = await paidSince(ar.asOf || '');
  const stores = ar.stores.map(s => {
    let net = 0; const b = [0, 0, 0, 0, 0];
    const invs = (s.invs || []).map(v => { const p = v.app ? 0 : (paid[s.acct + '|' + v.inv] || 0); const bal = R2(v.bal - p); return Object.assign({}, v, { paid: p, net: bal }); });
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
  h += '<div class="card">' + (filt.length ? sortBy(filt, s => s.maxPdd, true).map(s => '<div class="pr tap" data-ars="' + esc(s.acct) + '"><div class="ct"><b>' + esc(s.store) + (s.dormant ? ' <span class="tag t-g">💤</span>' : '') + (s.moved ? ' <span class="tag t-a">이전 시스템 ' + esc(s.moved) + '</span>' : '') + '</b><small>' + esc(s.acct) + ' · ' + s.invs.filter(v => v.net > 0.005).length + '건' + (s.lastPaid ? ' · 마지막 수금 ' + md(s.lastPaid) : '') + '</small></div><div class="pa"><b>' + money(s.net) + '</b><small class="' + (s.maxPdd > 60 ? 'warn' : '') + '">' + (s.maxPdd > 0 ? s.maxPdd + '일 연체' : '기한 전') + '</small></div></div>').join('') : '<div class="none">없음</div>') + '</div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-arf]').forEach(b => b.onclick = () => { AR_F = b.dataset.arf; pageAR(); });
  document.querySelectorAll('[data-ars]').forEach(el => el.onclick = () => { const s = stores.find(x => x.acct === el.dataset.ars); arStore(s); });
}
function arStore(s) {
  openModal('<h2>' + esc(s.store) + '</h2><div class="muted">' + esc(s.acct) + ' · 잔액 <b>' + money(s.net) + '</b></div>' +
    '<table style="margin-top:8px"><tr><th>인보이스</th><th>날짜</th><th class="r">연체</th><th class="r">잔액</th></tr>' + s.invs.filter(v => Math.abs(v.net) > 0.005).map(v => '<tr class="tap" data-ari="' + esc(v.inv) + '"><td><b>' + esc(v.inv) + ' ›</b></td><td>' + md(v.d) + '</td><td class="r ' + (v.pdd > 60 ? 'warn' : '') + '">' + (v.pdd > 0 ? v.pdd + '일' : 'D' + v.pdd) + '</td><td class="r"><b>' + money(v.net) + '</b>' + (v.paid ? '<br><small class="muted">받음 ' + money(v.paid) + '</small>' : '') + '</td></tr>').join('') + '</table>' +
    '<div class="btns"><button class="b-ghost" id="arSt">🏬 ' + bi('가게 창 · 인보이스 전체', 'Store · all invoices') + '</button><button class="b-blue" id="arGo">＋ 이 가게 수금 입력</button></div>');
  document.querySelectorAll('#mbox [data-ari]').forEach(el => el.onclick = () => Store.invDetail(el.dataset.ari, s.acct, () => arStore(s)));
  $('arSt').onclick = () => Store.storeSheet(s.acct, null, 'invh');
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
  const c = s.comm || {}, conf = s.conf || null, pctTxt = x => (Math.round((Number(x) || 0) * 1000) / 10) + '%';
  const buckets = c.buckets || [], SK = { REG: 'a', SPECIAL: 'ex', DISC: 'disc', NEWDP: 'w' };
  const rateOf = L => { const b = buckets.find(x => x.k === (SK[L.sec] || 'a')); return b ? pctTxt(b.rate) : ''; };
  const exLabel = (buckets.find(b => b.k === 'ex') || {}).label || c.specialTitle || 'EXCHANGE';
  const SECS = [['현장 수금 (CHECK · CASH · ZELLE)', L => L.sec === 'REG' && L.src === 'FIELD'], ['COD / ACH / CREDIT CARD', L => L.sec === 'REG' && L.src !== 'FIELD'], [exLabel, L => L.sec === 'SPECIAL'], ['DISCOUNT (할인 초과)', L => L.sec === 'DISC'], ['NEW DP (W 인보이스)', L => L.sec === 'NEWDP']];
  let seq = 0, rows = '';
  SECS.forEach(([title, f]) => { const list = (c.lines || []).filter(f); if (!list.length) return; let se = 0, sf = 0;
    rows += '<tr><td colspan="11" style="background:#eef2f7;font-weight:800;color:#1d4ed8;font-size:11.5px">' + esc(title) + ' · ' + list.length + '건</td></tr>';
    list.forEach(L => { seq++; se += L.e || 0; sf += L.f || 0; rows += '<tr><td class="r">' + seq + '</td><td>' + esc(L.d || '') + '</td><td>' + esc(L.store) + (L.part === 'W' ? ' <b style="color:#9a3412">↳ W 분</b>' : L.part === 'A' ? ' <b style="color:#64748b">↳ A 분</b>' : '') + (L.mismatch ? ' <b style="color:#b45309">⚠︎</b>' : '') + '</td><td>' + esc(L.methods) + '</td><td class="r">' + (L.e ? money(L.e) : '') + '</td><td class="r">' + (L.f ? money(L.f) : '') + '</td><td>' + esc(L.invs) + '</td><td class="r">' + (L.P ? money(L.P) : '') + '</td><td class="r">' + (L.W ? money(L.W) : '') + '</td><td class="r">' + (L.disc === '' || L.disc == null ? '' : L.disc + '%') + '</td><td class="r">' + rateOf(L) + '</td></tr>'; });
    rows += '<tr><td colspan="4" class="r" style="color:#555;font-size:11px">소계</td><td class="r"><b>' + money(se) + '</b></td><td class="r"><b>' + money(sf) + '</b></td><td colspan="5"></td></tr>'; });
  const ded = c.ded || { list: [], amt: 0 }, dedOn = ded.list.filter(d => d.apply > 0), tot = c.totals || {}, dp = c.dp || {}, of = c.office || {};
  const box = (cls, inner) => '<div style="border:1.5px solid ' + cls[0] + ';background:' + cls[1] + ';color:' + cls[2] + ';padding:9px 12px;margin-bottom:16px;font-size:12.5px">' + inner + '</div>';
  const RED = ['#b91c1c', '#fef2f2', '#7f1d1d'], AMB = ['#b45309', '#fff7ed', '#7c2d12'], BLU = ['#1e40af', '#eff6ff', '#1e3a8a'], VIO = ['#6d28d9', '#f5f3ff', '#4c1d95'];
  const BLK = { miss: '📭 미도착 신고 체크', transit: '📦 봉투로 보냈지만 아직 도착 전', notsent: '✉️ 아직 회사로 안 보낸 체크', codpend: '💳 확인 안 된 COD · ACH · 카드', noauth: '💳 카드 승인번호 없음', repl: '↩ 바운스 · 대체된 수금' };
  const recBox = c.rec && c.rec.filled ? box(c.rec.ok ? ['#15803d', '#f0fdf4', '#14532d'] : RED, '🧮 <b>정산 대조</b> — 담당자 기록 ' + (c.rec.n == null ? '?' : c.rec.n) + '건 ' + (c.rec.amt == null ? '' : money(c.rec.amt)) + ' / 시스템 수금 완료 ' + c.rec.sysN + '건 ' + money(c.rec.sysAmt) + (c.rec.ok ? ' — ✅ 일치' : ' — ⚠️ 차이')) : '';
  const blkBox = (c.blockers || []).length ? box(AMB, '⛔ <b>이번 정산에서 걸린 것 ' + c.blockers.length + '건 (' + money(c.blockers.reduce((a, b) => a + (b.amt || 0), 0)) + ')</b><br>' + c.blockers.map(b => '· ' + esc(BLK[b.k] || b.k) + ' — ' + esc(b.d || '') + ' ' + esc(b.store) + ' ' + (b.ref ? esc(b.ref) + ' ' : '') + money(b.amt)).join('<br>')) : '';
  return '<h1>' + (c.salaried ? 'Payment Record · 수금 기록 (급여제)' : 'Commission Statement · 커미션 정산서') + '</h1><div class="meta"><b>' + esc(s.sm) + '</b> &nbsp;|&nbsp; ' + esc(s.from || '') + ' ~ ' + esc(s.to || '') + ' &nbsp;|&nbsp; THE ONE CORP &nbsp;|&nbsp; ' + (conf ? '<b style="color:#6d28d9">확정 ' + esc(conf.day) + '</b>' : '출력 ' + esc(s.day || today())) + '</div>' +
    (conf ? box(VIO, '🔒 <b>확정 완료</b> — 정산 번호 ' + esc(conf.id || '') + '. 이 줄들은 정산 목록에서 빠지고, 이후 수금만 새로 쌓입니다.') : '') +
    (c.salaried ? box(VIO, '💼 <b>급여제</b> — 커미션 · 지급액은 계산하지 않습니다. 이 문서는 수금 기록 확인용입니다.') : '') + recBox + blkBox +
    '<table class="box"><tr><td>수금 합계 (CHECK + ZELLE + COD/ACH/CARD)</td><td class="r">' + money(tot.check) + '</td></tr><tr><td>CASH</td><td class="r">' + money(tot.cash) + '</td></tr><tr><td><b>TOTAL 수금</b></td><td class="r"><b>' + money(tot.total) + '</b></td></tr></table>' +
    '<table style="margin-bottom:18px"><tr><th>구분</th><th class="r">대상 금액</th><th class="r">요율</th><th class="r">커미션</th></tr>' + buckets.map(b => '<tr><td>' + esc(b.label) + '</td><td class="r">' + money(b.base) + '</td><td class="r">' + pctTxt(b.rate) + '</td><td class="r">' + money(b.amt) + '</td></tr>').join('') +
    '<tr><td colspan="3" class="r"><b>NET</b></td><td class="r"><b>' + money(c.net) + '</b></td></tr>' +
    (ded.amt ? dedOn.map(d => '<tr><td colspan="2" style="font-size:11.5px;color:#7f1d1d">공제 · ' + (d.acct ? esc(d.acct) + ' ' : '') + esc(d.store) + ' (' + esc(d.why || '') + ') — 총 ' + money(d.total) + ', 이번 뒤 남은 ' + money(d.remaining - d.apply) + '</td><td class="r">DEDUCTION</td><td class="r">− ' + money(d.apply) + '</td></tr>').join('') + '<tr><td colspan="3" class="r"><b>NET PAYMENT</b></td><td class="r"><b>' + money(c.netPay) + '</b></td></tr>' : '') +
    '<tr><td colspan="2"></td><td class="r">DP ' + pctTxt(dp.rate) + '</td><td class="r">− ' + money(dp.amt) + '</td></tr><tr><td colspan="2"></td><td class="r">OFFICE ' + pctTxt(of.rate) + '</td><td class="r">− ' + money(of.amt) + '</td></tr>' +
    '<tr class="' + (c.cashKeep ? '' : 'fin') + '"><td colspan="3" class="r"><b>TOTAL</b></td><td class="r"><b>' + money(c.pay) + '</b></td></tr>' +
    (c.cashKeep ? '<tr><td colspan="3" class="r">CASH (세일즈맨 보관 — 회사로 안 보냄)</td><td class="r">− ' + money(c.cashKeep) + '</td></tr><tr class="fin"><td colspan="3" class="r">FINAL PAY 송금액</td><td class="r">' + money(c.finalPay) + '</td></tr>' : '') + '</table>' +
    (ded.list.length ? '<div style="font-weight:700;font-size:13px;margin:4px 0 6px;color:#7f1d1d">DEDUCTION 내역 — 6개월 넘게 수금 못 한 계정</div><table class="pt" style="font-size:11.5px;margin-bottom:16px"><tr><th>계정</th><th>가게</th><th>근거 인보이스</th><th class="r">총 공제</th><th class="r">이전까지</th><th class="r">이번</th><th class="r">남은</th><th class="r">남은 회차</th></tr>' + ded.list.map(d => { const after = R2(d.remaining - d.apply), left = d.per > 0 ? Math.ceil(after / d.per - 1e-9) : 0; return '<tr><td>' + esc(d.acct || '') + '</td><td>' + esc(d.store) + '<br><small style="color:#64748b">' + esc(d.why || '') + (d.start ? ' · 시작 ' + esc(d.start) : '') + '</small></td><td>' + esc(d.invs || '') + '</td><td class="r">' + money(d.total) + '</td><td class="r">' + money(d.used) + '</td><td class="r"><b>' + (d.apply > 0 ? '− ' + money(d.apply) : '이번 없음') + '</b></td><td class="r">' + money(after) + '</td><td class="r">' + (after > 0.005 ? left + '회' : '완료') + '</td></tr>'; }).join('') + '</table>' : '') +
    (c.arWarn && (c.arWarn.six.length || c.arWarn.four.length) ? box(AMB, (c.arWarn.six.length ? '⏰ <b>6개월 넘은 미수</b> (공제 대상): ' + c.arWarn.six.map(x => esc(x.acct) + ' ' + esc(x.store) + ' ' + money(x.amt) + (x.has ? ' (공제 중)' : ' (<b>미등록</b>)')).join(' · ') + '<br>' : '') + (c.arWarn.four.length ? '🕑 <b>다음 정산까지 정리 부탁드립니다</b> (4~6개월): ' + c.arWarn.four.map(x => esc(x.store) + ' ' + money(x.storeTot)).join(' · ') : '')) : '') +
    ((c.skipped || []).length ? box(RED, '🔴 <b>금액 오류로 이번 정산에서 제외된 줄 ' + c.skipped.length + '건 (' + money(c.skippedAmt) + ')</b> — 인보이스 금액을 고치면 다음 정산에 올라옵니다.<br>' + c.skipped.map(b => '· ' + esc(b.d || '') + ' ' + esc(b.store) + ' — 받은 돈 ' + money(b.got) + ' / A+P+W+CM ' + money(b.alloc) + ' · ' + esc(b.why)).join('<br>')) : '') +
    ((c.warn || []).length ? box(AMB, '⚠️ <b>W 금액 오타 ' + c.warn.length + '건</b> — A·P·CM 이 적혀 있어 W 를 계산해 넣었습니다 (⚠︎ 표시 줄). 원본도 고쳐 주세요.<br>' + c.warn.map(b => '· ' + esc(b.d || '') + ' ' + esc(b.store) + ' — 기록된 W ' + money(b.W) + ' → ' + money(b.fixed)).join('<br>')) : '') +
    (c.waitN ? box(BLU, '📥 담당자 <b>체크 수령</b> 확인 대기 ' + c.waitN + '건 (' + money(c.waitAmt) + ') 은 아직 이 정산서에 없습니다.') : '') +
    ((c.pending || c.pendBad || c.pendOther) ? box(AMB, (c.pending || c.pendBad ? '⚠️ 아직 확인 안 된 현장 줄 ' + ((c.pending || 0) + (c.pendBad || 0)) + '건' + (c.pendBad ? ' (문제 표시 ' + c.pendBad + '건)' : '') + ' 은 이 정산서에서 빠져 있습니다.' : '') + (c.pendOther ? (c.pending || c.pendBad ? '<br>' : '') + '⚠️ 확인 안 된 COD/ACH/카드 ' + c.pendOther + '건 (' + money(c.pendOtherAmt) + ') 도 빠져 있습니다.' : '')) : '') +
    '<table><tr><th class="r">#</th><th>받은 날</th><th>가게 Store</th><th>Pay / Check #</th><th class="r">CHECK·ACH</th><th class="r">CASH</th><th>인보이스</th><th class="r">P</th><th class="r">W</th><th class="r">할인</th><th class="r">요율</th></tr>' + rows + '</table>' +
    '<div style="font-size:11px;color:#666;margin-top:10px">② 체크 수령 + ③ 최종 확인(✓) 된 줄만 계산했습니다 · 구역 순서는 커미션 시트와 같습니다.</div><div class="sig"><div>세일즈맨 확인 Salesman</div><div>회사 확인 Office</div></div>';
}
