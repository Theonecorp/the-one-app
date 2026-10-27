/* ============================================================
 *  수금 (세일즈맨) — 옛 수금 앱(v77) 과 같은 흐름
 *    탭: ＋ 수금 입력 · 오늘 내역 · 기록 · 미수금
 *    입력: 계정코드 4자리 / 가게 이름 → 거래처 카드(주소 · 전화 · 담당 · 최근 수금)
 *          받은 날짜 · Pay Type(CHECK/ZELLE/CASH) · Check # · 금액(센트 자동) · 📱 모바일 디파짓 · 🔁 대체 체크
 *          Deposit Date · 결제 추가 · 갚는 인보이스(AR 목록 탭 → 자동 배분 · 파샬 · 크레딧 ± · 🏬 다른 가게) · 메모 · 저장
 *    오늘 내역: 합계 · 전송 대기 · 수정/취소 · 📧 Daily Report (사진 첨부) 전송
 *    기록: 계정코드 / 가게 / 체크번호 검색 · 가게 요약 · 기간 리포트(인쇄 · 이메일)
 *    미수금: 내 담당 AR (오래된 순 · 구간 · 💤 · ✅) → 가게 → 바로 수금 입력
 *  자료는 Firestore entries (기존 모양 그대로) + reports (Daily Report · 체크 사진)
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, md, dlabel, toast, busy, openModal, closeModal, confirmBox, Router, sum, sortBy, groupBy, printOpen, daysBetween, pad4, nz, bi, bt, debounce, invNo } from './ui.js';
import { newId } from './db.js';
import { searchAccounts } from './accounts.js';
import { invType } from './comm.js';
import { myEntries, openInvoices, stageText, clearEntryCache } from './sales.js';
import * as Store from './store.js';
import { mergeAppInvoices } from './arapp.js';

let S = null;
export function register(state) {
  S = state;
  Router.on('entry', a => hub('new', a)); Router.on('mine', () => hub('today')); Router.on('ar', () => hub('ar')); Router.on('hist', a => hub('hist', a));
}
const isSales = () => !!S && S.role === 'salesman';
let ME = '';
function me() { ME = F.sm || ((S.me && S.me.sm) ? String(S.me.sm).toUpperCase() : ''); return ME; }
const REPORT_TO = () => (S.settings && S.settings.reportTo) || 'check@theonefl.com';

/* ---------- 폼 상태 ---------- */
const F = {};
function resetForm() {
  Object.assign(F, { sm: isSales() ? '' : F.sm, acct: '', store: '', newStore: false, addr: '', tel: '', d: today(),
    pays: [{ m: 'CHECK', ref: '', amt: '', dep: today(), mob: false, repl: false, orig: '' }],
    invs: [], picked: [], memo: '', editing: null, arList: null, othAr: {} });
}
resetForm();

/* ============================================================
 *  허브 — 탭 바 + 각 탭
 * ============================================================ */
let TAB = 'new', TODAY_D = today(), HQ = '';
async function hub(tab, arg) {
  if (isSales() && !me()) { $('page').innerHTML = '<div class="card"><div class="none">이 계정에 세일즈맨 코드가 연결돼 있지 않습니다.<br>루크가 관리 → 사용자에서 세일즈맨을 지정해야 합니다.</div></div>'; return; }
  TAB = tab;
  if (tab === 'new') {
    if (arg && arg !== 'new') { const e = await S.DB.get('entries', arg); if (e) loadIntoForm(e); }
    else if (arg === 'new' || !F.store) resetForm();
  }
  if (tab === 'hist' && arg) HQ = decodeURIComponent(arg);
  $('page').innerHTML = tabBar() + '<div id="hubBody"><div class="load">읽는 중…</div></div>';
  bindTabs();
  if (tab === 'new') paintEntry(); else if (tab === 'today') await paintToday(); else if (tab === 'hist') await paintHist(); else await paintAR();
  fillBadges();
}
function tabBar() {
  const t = [['new', '＋ 수금 입력', 'Entry'], ['today', '오늘 내역', 'Today', 'bTd'], ['hist', '기록', 'History'], ['ar', '미수금', 'AR', 'bAr']];
  return '<div class="ctabs">' + t.map(x => '<button class="' + (TAB === x[0] ? 'on' : '') + '" data-ct="' + x[0] + '">' + x[1] + ' <span class="en">' + x[2] + '</span>' + (x[3] ? '<span class="badge" id="' + x[3] + '" style="display:none">0</span>' : '') + '</button>').join('') + '</div>';
}
function bindTabs() { document.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { const k = b.dataset.ct; Router.go(k === 'new' ? 'entry' : k === 'today' ? 'mine' : k); }); }
async function fillBadges() {
  try { const rows = await myEntries(); const n = rows.filter(r => r.d === today()).length; const b = $('bTd'); if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; } } catch (e) {}
  try { const ar = await arDocMine(); const b = $('bAr'); if (b && ar && ar.stores) { const n = ar.stores.length; b.textContent = n; b.style.display = n ? '' : 'none'; } } catch (e) {}
}

/* ============================================================
 *  ① 수금 입력
 * ============================================================ */
function loadIntoForm(e) {
  resetForm(); if (!isSales()) F.sm = e.sm;
  F.editing = e.id; F.d = e.d; F.acct = e.acct || ''; F.store = e.store; F.newStore = !!e.newStore; F.addr = e.addr || '';
  F.pays = (e.pays || []).map(p => Object.assign({ dep: e.d, mob: false, repl: !!e.repl, orig: e.orig || '' }, p)); if (!F.pays.length) F.pays = [{ m: 'CHECK', ref: '', amt: '', dep: e.d, mob: false }];
  F.invs = (e.invs || []).map(v => Object.assign({ manual: true }, v)); F.memo = e.memo || '';
}
const centsFmt = (v, allowNeg) => {
  const raw = String(v || ''); const neg = allowNeg && raw.indexOf('-') >= 0;
  let d = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d{3})/, '');
  if (!d) return neg ? '-' : '';
  if (d.length > 11) d = d.slice(0, 11); while (d.length < 3) d = '0' + d;
  return (neg ? '-' : '') + d.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d.slice(-2);
};
const amtOf = v => Number(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
const invTypeOf = no => { const m = /^(CM|[APW])-?\d{3,}$/.exec(String(no || '').toUpperCase().trim()); return m ? m[1] : (no ? 'X' : ''); };
const hintDefault = '코드 4자리를 넣으면 바로 잡힙니다. 이름 여러 단어로 좁혀도 됩니다.<br><span class="en">Type the 4-digit code, or search by store name (multiple words OK).</span>';

function paintEntry() {
  const acc = F.acct ? S.accounts.byCode[F.acct] : null;
  const got = payTotal();
  let h = '';
  if (F.editing) h += '<div class="alert a-amb">✏️ <b>수정 중 · Editing</b> — ' + esc(F.store) + ' · ' + money(got) + ' <button class="b-ghost b-sm" style="float:right" id="btnCancelEdit">수정 취소 · Cancel</button></div>';
  h += '<div class="card">';
  /* 가게 */
  if (!F.store) {
    h += '<div class="two" style="grid-template-columns:116px 1fr;align-items:start"><div class="fg"><label>계정코드 <span class="en">Acct #</span></label><input id="fAcct" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="4001" style="text-align:center;font-weight:800;letter-spacing:2px"></div>' +
      '<div class="fg" style="position:relative"><label>또는 가게 이름 검색 <span class="en">or Store name</span></label><input id="fStore" autocomplete="off" placeholder="이름 / Store name"><div class="hits" id="sList" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:30"></div></div></div>' +
      '<div class="hint" id="storeHint">' + hintDefault + '</div>' +
      '<div id="newFields" style="display:none;margin-top:8px"><div class="alert a-amb">등록되지 않은 거래처입니다 · Not in list <span class="tag t-c">신규로 저장 · NEW</span></div><div class="fg"><label>주소 (Address)</label><input id="fAddr" placeholder="주소 / Address" value="' + esc(F.addr) + '"></div><button class="b-blue" id="btnNewStore">이 이름으로 신규 입력 · Save as new store</button></div>';
  } else {
    const loc = acc ? [acc.addr, [acc.city, acc.state].filter(Boolean).join(', ') + (acc.zip ? ' ' + acc.zip : '')].filter(Boolean) : [F.addr];
    h += '<div class="info"><div class="nm">' + esc(F.store) + (F.acct ? '<span class="code">' + esc(F.acct) + '</span>' : '<span class="newtag">NEW</span>') + '</div>' +
      (loc.join('').trim() ? '<div class="kv"><b>주소 Addr</b><span>' + loc.map(esc).join('<br>') + '</span></div>' : '') +
      (acc && acc.tel ? '<div class="kv"><b>전화 Phone</b><span><a href="tel:' + esc(String(acc.tel).replace(/[^0-9+]/g, '')) + '">' + esc(acc.tel) + '</a></span></div>' : '') +
      (acc && acc.sm ? '<div class="kv"><b>담당 Rep</b><span>' + esc(acc.sm) + (acc.terms ? ' · ' + esc(acc.terms) : '') + '</span></div>' : '') +
      '<div class="hist" id="histBox"><div class="h1">최근 수금 · Recent</div><div style="color:#5eead4">조회 중… Loading</div></div>' +
      '<div class="tools"><button type="button" id="btnStoreRec">📋 가게 기록 · Record</button><button type="button" id="btnEditAddr">주소 수정 · Edit address</button><button type="button" id="btnStoreX">다른 거래처 · Change</button></div></div>' +
      '<div id="newFields" style="display:none;margin-top:8px"><div class="fg"><label>주소 (이 건에만 적용) · Address for this entry</label><input id="fAddr" value="' + esc(F.addr) + '" placeholder="주소 / Address"></div></div>';
  }
  /* 받은 날짜 */
  h += '<div class="fg" style="margin-top:12px"><label>받은 날짜 <span class="en">Received</span> * <span style="font-weight:400">(오늘이 아니면 바꾸세요 · change if not today)</span></label><div class="pdrow"><input id="fRcv" type="date" value="' + esc(F.d) + '" max="' + today() + '" class="' + (F.d !== today() ? 'past' : '') + '"><button type="button" class="pdclr" id="rcvToday">오늘 Today</button></div></div>';
  /* 결제들 */
  h += F.pays.map((p, i) => payBlock(p, i)).join('');
  if (!F.editing) h += '<button type="button" class="b-ghost" id="btnAddPay" style="margin-bottom:12px">+ 결제 추가 · Add payment <span class="en">(여러 장 / 체크+캐쉬)</span></button>';
  if (F.pays.length > 1) h += '<div class="paytot">이번 방문 합계 Visit total <b>' + money(got) + '</b> (' + F.pays.length + '건)</div>';
  /* 인보이스 */
  const replAll = F.pays.length && F.pays.every(p => p.repl);
  h += '<div class="fg" id="invField" style="' + (replAll ? 'display:none' : '') + '"><label>갚는 인보이스 <span class="en">Invoices paid — this visit</span> <span style="font-weight:400">(체크 여러 장이어도 한 번만 · once per visit)</span></label>' +
    '<div id="arPick"></div><div id="invLines">' + F.invs.map((v, i) => invLine(v, i)).join('') + '</div>' +
    '<div class="btns" style="margin-top:4px;flex-wrap:wrap"><button type="button" class="b-ghost b-sm" id="btnAddInv">＋ 목록에 없는 인보이스 · Not in list</button><button type="button" class="b-ghost b-sm" id="btnAddInvO" style="border:1.5px solid #c4b5fd;color:#6b21a8;background:#fff">🏬 다른 가게 인보이스 · Other store</button></div>' +
    '<div id="invSum"></div>' +
    '<div class="hint">위 목록에서 <b>탭해서 고르면 금액은 자동</b>으로 채워집니다. 받은 돈이 모자라면 마지막에 고른 인보이스가 <b>파샬</b>이 됩니다. 크레딧은 금액 앞 <b>＋</b> 를 눌러 <b>－</b> 로.<br><span class="en">Tap invoices from the list — amounts fill in automatically. If short, the last one picked becomes partial.</span></div></div>';
  h += '<div class="fg"><label>메모 <span class="en">Memo</span> <span style="font-weight:400">(선택 · optional)</span></label><textarea id="fMemo" rows="2" placeholder="예: 부분 수금 / e.g. partial payment">' + esc(F.memo) + '</textarea></div>';
  h += '<button class="b-blue" id="btnSave" style="padding:17px;font-size:18px">' + (F.editing ? '수정 저장 · Save changes' : '저장 · SAVE') + '</button></div>';
  $('hubBody').innerHTML = h;
  bindEntry();
}
function payBlock(p, i) {
  const seg = ['CHECK', 'ZELLE', 'CASH'].map(m => '<button type="button" class="' + (p.m === m ? 'on' : '') + '" data-pm="' + i + '|' + m + '">' + m + '</button>').join('');
  return '<div class="xpay' + (i ? '' : ' first') + '" data-pi="' + i + '">' +
    (i ? '<div class="xh"><span>결제 Payment ' + (i + 1) + '</span><button type="button" data-px="' + i + '">✕ 삭제 · Remove</button></div>' : '<label>Pay Type *</label>') +
    '<div class="seg big2">' + seg + '</div>' +
    '<div class="two" style="margin-top:8px">' +
      (p.m === 'CASH' ? '<div class="fg"><label>&nbsp;</label><div class="muted" style="padding:12px 0">현금 · cash</div></div>' : '<div class="fg"><label>' + (p.m === 'ZELLE' ? 'Zelle 확인번호 · Ref #' : 'Check # *') + '</label><input inputmode="numeric" autocomplete="off" data-pref="' + i + '" value="' + esc(p.ref) + '" placeholder="' + (p.m === 'ZELLE' ? '있으면 입력 · optional' : '예/e.g. 10432') + '"></div>') +
      '<div class="fg"><label>금액 (Amount) *</label><input inputmode="numeric" autocomplete="off" data-pamt="' + i + '" value="' + esc(p.amt) + '" placeholder="0.00" style="text-align:right;font-weight:800;font-size:20px"></div></div>' +
    (p.m === 'CHECK' ? '<button type="button" class="mobbtn' + (p.mob ? ' on' : '') + '" data-pmob="' + i + '">📱 모바일 디파짓 · Mobile Deposit</button>' : '') +
    '<button type="button" class="rplbtn' + (p.repl ? ' on' : '') + '" data-prpl="' + i + '">🔁 대체 체크 (바운스 교체) · Replacement</button>' +
    (p.repl ? '<div class="rplbox"><label>바운스된 원래 체크 번호 * <span class="en">Original (bounced) check #</span></label><input inputmode="numeric" autocomplete="off" data-porig="' + i + '" value="' + esc(p.orig || '') + '" placeholder="예/e.g. 10432"><div class="origHint" data-ohint="' + i + '"></div><div class="hint">대체 체크는 <b>인보이스를 다시 넣을 필요 없습니다</b> — 원래 체크 번호만 넣으면 됩니다.<br><span class="en">Replacement: no need to re-enter invoices — just the original check #.</span></div></div>' : '') +
    '<div class="fg"><label>Deposit Date * <span style="font-weight:400">(체크에 적힌 날짜 · date on the check)</span></label><div class="pdrow"><input type="date" data-pdep="' + i + '" value="' + esc(p.dep || today()) + '" class="' + (p.dep > today() ? 'later' : '') + '"><button type="button" class="pdclr" data-ptoday="' + i + '">오늘 Today</button></div></div>' +
    '</div>';
}
function invLine(v, i) {
  const t = invTypeOf(v.no); const neg = amtOf(v.amt) < 0;
  const oth = v.other ? '<div class="isn ok">🏬 ' + esc(v.store || '') + (v.acct ? '<span class="code">' + esc(v.acct) + '</span>' : '') + '</div>' : '';
  const othSearch = v.other && !v.acct ? '<div class="ivs" style="position:relative"><div class="ivsr"><span class="istag">🏬</span><input class="isr" autocomplete="off" data-isr="' + i + '" placeholder="다른 가게 — 코드 4자리 또는 이름 · code or name"></div><div class="hits" data-isl="' + i + '" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:30"></div><div class="isn" data-isn="' + i + '"></div></div>' : oth;
  return '<div class="invl' + (v.ar ? ' ar' : '') + (v.other ? ' oth' : '') + (v.zero ? ' zero' : '') + '" data-ii="' + i + '">' + othSearch +
    '<div class="ivr"><span class="ity ' + (t === 'X' ? 'X' : t) + '">' + (t === 'X' ? '!' : t || '?') + '</span>' +
    (v.ar ? '<input class="ino" readonly value="' + esc(v.no) + '">' : '<input class="ino" autocomplete="off" autocapitalize="characters" data-ino="' + i + '" value="' + esc(v.no || '') + '" placeholder="A00001 / CM0001">') +
    '<button type="button" class="isgn' + (neg ? ' on' : '') + '" data-isgn="' + i + '" title="크레딧 Credit (마이너스)">' + (neg ? '－' : '＋') + '</button>' +
    '<input class="iam' + (neg ? ' neg' : '') + '" inputmode="numeric" autocomplete="off" data-iamt="' + i + '" value="' + esc(v.amt == null ? '' : v.amt) + '" placeholder="$ 금액">' +
    '<button type="button" class="idel" data-ix="' + i + '">✕</button></div>' +
    (v.ar ? '<div class="ibal">잔액 ' + money(v.bal) + (v.paid ? ' (이미 ' + money(v.paid) + ' 받음)' : '') + (v.partial ? '<span class="part">' + (v.zero ? '받은 돈 부족 — 이 인보이스엔 $0 · not covered' : '파샬 · partial') + '</span>' : '') + '</div>' : '') +
    (v.other && v.acct && !v.ar ? '<div class="oap" data-oap="' + i + '"></div>' : '') + '</div>';
}
function collectForm() {
  F.d = $('fRcv') ? $('fRcv').value || today() : F.d;
  F.pays.forEach((p, i) => { const q = k => document.querySelector('[data-' + k + '="' + i + '"]'); const r = q('pref'), a = q('pamt'), d = q('pdep'), o = q('porig'); if (r) p.ref = r.value.trim(); if (a) p.amt = a.value; if (d) p.dep = d.value; if (o) p.orig = o.value.trim(); });
  F.invs.forEach((v, i) => { const n = document.querySelector('[data-ino="' + i + '"]'), a = document.querySelector('[data-iamt="' + i + '"]'); if (n) v.no = invNo(n.value); if (a) v.amt = a.value; });
  if ($('fMemo')) F.memo = $('fMemo').value; if ($('fAddr')) F.addr = $('fAddr').value.trim();
}
const payTotal = () => R2(F.pays.reduce((a, p) => a + amtOf(p.amt), 0));
const invTotal = () => R2(F.invs.filter(v => !v.zero).reduce((a, v) => a + amtOf(v.amt), 0));
/** 받은 돈을 고른 순서대로 배분 — 손으로 적은 줄은 먼저 빼고, AR 줄은 잔액만큼, 모자라면 마지막 줄이 파샬 */
function arAlloc() {
  const total = payTotal();
  let manual = 0; const auto = [];
  F.invs.forEach(v => { if (v.ar && !v.manual) auto.push(v); else manual += amtOf(v.amt); });
  let left = R2(total - manual);
  auto.forEach(v => {
    const bal = Number(v.bal) || 0; let amt = bal;
    if (bal > 0) { amt = Math.max(0, Math.min(bal, left)); left = R2(left - amt); } else left = R2(left - bal);
    v.amt = amt.toFixed(2); v.partial = bal > 0 && amt < bal - 0.005; v.zero = bal > 0 && amt < 0.005;
  });
}
function paintInvSum() {
  arAlloc();
  F.invs.forEach((v, i) => { const el = document.querySelector('[data-iamt="' + i + '"]'); if (el && v.ar && !v.manual) { el.value = centsFmt(v.amt); } const row = document.querySelector('[data-ii="' + i + '"]'); if (row) { row.classList.toggle('zero', !!v.zero); const pt = row.querySelector('.part'); if (pt) { pt.style.display = v.partial ? 'inline-block' : 'none'; pt.textContent = v.zero ? '받은 돈 부족 — 이 인보이스엔 $0 · not covered' : '파샬 · partial'; } else if (v.partial && row.querySelector('.ibal')) row.querySelector('.ibal').insertAdjacentHTML('beforeend', '<span class="part">' + (v.zero ? '받은 돈 부족 · not covered' : '파샬 · partial') + '</span>'); } });
  const box = $('invSum'); if (!box) return;
  const list = F.invs.filter(v => !v.zero && (v.no || amtOf(v.amt)));
  if (!list.length) { box.className = ''; box.innerHTML = ''; return; }
  const s = R2(list.reduce((a, v) => a + amtOf(v.amt), 0)), amt = payTotal(), diff = R2(amt - s);
  box.className = 'invsum ' + (diff === 0 ? 'ok' : diff > 0 ? 'over' : 'bad');
  box.textContent = '인보이스 합계 Invoices ' + money(s) + ' / 받은 돈 Received ' + money(amt) + (diff === 0 ? '  ✓ 일치 OK' : diff > 0 ? '  — 받은 돈이 ' + money(diff) + ' 더 많습니다 · 인보이스를 더 고르세요 (over)' : '  — 인보이스가 ' + money(-diff) + ' 더 많습니다 · 파샬이면 금액을 줄이세요 (short)');
}
function bindEntry() {
  const rp = () => { collectForm(); paintEntry(); };
  /* 가게 찾기 */
  if ($('fAcct')) {
    const acct = $('fAcct'), q = $('fStore'), box = $('sList'), hint = $('storeHint'), nf = $('newFields');
    acct.oninput = () => { const raw = acct.value.replace(/[^0-9]/g, '').slice(0, 4); acct.value = raw; box.style.display = 'none'; if (raw.length < 4) { hint.innerHTML = raw.length ? '코드 4자리를 다 입력하세요 · Enter all 4 digits (' + raw.length + '/4)' : hintDefault; nf.style.display = 'none'; return; } const a = S.accounts.byCode[raw]; if (a) return pickStore(a.acct); hint.innerHTML = '코드 <b>' + esc(raw) + '</b> 는 목록에 없습니다 · not in list. 가게 이름을 입력하세요. · Enter store name.'; q.focus(); };
    const search = () => {
      const raw = q.value.trim(); nf.style.display = 'none';
      if (!raw) { box.style.display = 'none'; hint.innerHTML = hintDefault; return; }
      const digits = raw.replace(/[^0-9]/g, '');
      if (digits === raw && digits.length <= 4) { box.style.display = 'none'; if (digits.length === 4) { acct.value = digits; q.value = ''; acct.oninput(); } else hint.innerHTML = '계정코드는 <b>왼쪽 코드칸</b>에 4자리로. · Put the 4-digit code in the left box.'; return; }
      if (raw.length < 2) { hint.textContent = '두 글자 이상 입력하세요. · Type 2+ letters.'; box.style.display = 'none'; return; }
      const hits = searchAccounts(S.accounts, raw, 40);
      if (!hits.length) { box.style.display = 'none'; hint.innerHTML = '등록되지 않은 거래처입니다 · Not in list <span class="newtag">신규로 저장 · NEW</span>'; nf.style.display = ''; return; }
      hint.innerHTML = hits.total > hits.length ? '<b>' + hits.total + '곳</b> 중 ' + hits.length + '곳 표시 — 단어를 더 넣어 좁히세요 · add words to narrow (e.g. <b>ali fl</b>)' : '<b>' + hits.total + '곳</b> 찾았습니다. 목록에서 선택하세요. · found, pick one.';
      box.innerHTML = hits.map(a => '<div data-ac="' + esc(a.acct) + '">' + esc(a.store) + '<span class="code">' + esc(a.acct) + '</span><small>' + esc([a.addr, [a.city, a.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) + (a.sm ? ' · ' + esc(a.sm) : '') + '</small></div>').join('');
      box.style.display = ''; box.querySelectorAll('[data-ac]').forEach(d => d.onclick = () => pickStore(d.dataset.ac));
    };
    q.oninput = search; q.onfocus = search; q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const f = box.querySelector('[data-ac]'); if (f) f.click(); } };
    /* 🆕 목록에 없는 가게 — 새 거래처로 열어서 (임시 번호, 매니저가 코드를 붙임) 바로 그 가게로 */
    $('btnNewStore').onclick = async () => { const NA = await import('./newacct.js'); NA.newAcctForm(q.value.trim(), a => { pickStore(a.acct); F.newStore = true; paintEntry(); }); };
    document.addEventListener('click', e => { if (!e.target.closest || !e.target.closest('#sList, #fStore')) { const b = $('sList'); if (b) b.style.display = 'none'; } }, { once: true });
    if (!('ontouchstart' in window)) acct.focus();
  } else {
    $('btnStoreX').onclick = async () => { if ((payTotal() || F.invs.length) && !(await confirmBox('다른 거래처로 바꿀까요? 고른 인보이스는 지워집니다. / Change store?', '바꾸기'))) return; F.store = ''; F.acct = ''; F.newStore = false; F.picked = []; F.invs = F.invs.filter(v => v.other); F.arList = null; paintEntry(); };
    $('btnEditAddr').onclick = () => { const nf = $('newFields'); nf.style.display = ''; const a = F.acct ? S.accounts.byCode[F.acct] : null; if (!$('fAddr').value) $('fAddr').value = a ? [a.addr, a.city, a.state, a.zip].filter(Boolean).join(', ') : F.addr; $('fAddr').focus(); toast('여기서 고친 주소는 이 건에만 적용됩니다. · Applies to this entry only.', ''); };
    $('btnStoreRec').onclick = () => { if (F.acct) Store.storeSheet(F.acct); else Router.go('hist', encodeURIComponent(F.store)); };
    loadRecent();
    paintArPick();
  }
  /* 날짜 */
  $('fRcv').onchange = () => { F.d = $('fRcv').value; $('fRcv').classList.toggle('past', F.d !== today()); };
  $('rcvToday').onclick = () => { $('fRcv').value = today(); $('fRcv').onchange(); };
  /* 결제 */
  document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { collectForm(); const [i, m] = b.dataset.pm.split('|'); const p = F.pays[+i]; p.m = m; if (m !== 'CHECK') { p.mob = false; } if (m === 'CASH') p.ref = ''; paintEntry(); });
  document.querySelectorAll('[data-px]').forEach(b => b.onclick = () => { collectForm(); F.pays.splice(+b.dataset.px, 1); paintEntry(); });
  document.querySelectorAll('[data-pamt]').forEach(el => { el.oninput = () => { el.value = centsFmt(el.value); collectForm(); paintInvSum(); paintVisitTotal(); }; el.onfocus = () => el.select(); });
  document.querySelectorAll('[data-pmob]').forEach(b => b.onclick = () => { collectForm(); const p = F.pays[+b.dataset.pmob]; p.mob = !p.mob; b.classList.toggle('on', p.mob); });
  document.querySelectorAll('[data-prpl]').forEach(b => b.onclick = () => { collectForm(); const p = F.pays[+b.dataset.prpl]; p.repl = !p.repl; paintEntry(); if (p.repl) { const o = document.querySelector('[data-porig="' + b.dataset.prpl + '"]'); if (o) o.focus(); } });
  document.querySelectorAll('[data-porig]').forEach(el => el.oninput = debounce(() => origLook(+el.dataset.porig), 400));
  document.querySelectorAll('[data-pdep]').forEach(el => el.onchange = () => { collectForm(); el.classList.toggle('later', el.value > today()); });
  document.querySelectorAll('[data-ptoday]').forEach(b => b.onclick = () => { const el = document.querySelector('[data-pdep="' + b.dataset.ptoday + '"]'); el.value = today(); el.onchange(); });
  if ($('btnAddPay')) $('btnAddPay').onclick = () => { collectForm(); F.pays.push({ m: 'CHECK', ref: '', amt: '', dep: today(), mob: false, repl: false, orig: '' }); paintEntry(); setTimeout(() => { const els = document.querySelectorAll('[data-pref]'); if (els.length) els[els.length - 1].focus(); }, 0); };
  /* 인보이스 */
  document.querySelectorAll('[data-ino]').forEach(el => el.oninput = () => { el.value = el.value.toUpperCase(); collectForm(); const t = invTypeOf(el.value), b = el.parentNode.querySelector('.ity'); b.className = 'ity ' + (t === 'X' ? 'X' : t); b.textContent = t === 'X' ? '!' : t || '?'; });
  document.querySelectorAll('[data-iamt]').forEach(el => { el.oninput = () => { const neg = el.value.indexOf('-') >= 0; el.value = centsFmt(el.value, true); const v = F.invs[+el.dataset.iamt]; if (v) { v.amt = el.value; v.manual = true; } el.classList.toggle('neg', neg); const sg = el.parentNode.querySelector('.isgn'); if (sg) { sg.classList.toggle('on', neg); sg.textContent = neg ? '－' : '＋'; } paintInvSum(); }; el.onfocus = () => el.select(); });
  document.querySelectorAll('[data-isgn]').forEach(b => b.onclick = () => { const i = +b.dataset.isgn, el = document.querySelector('[data-iamt="' + i + '"]'); el.value = el.value.indexOf('-') >= 0 ? el.value.replace(/-/g, '') : '-' + el.value; el.oninput(); el.focus(); });
  document.querySelectorAll('[data-ix]').forEach(b => b.onclick = () => { collectForm(); const v = F.invs[+b.dataset.ix]; if (v && v.ar && !v.other) F.picked = F.picked.filter(k => k !== v.no); F.invs.splice(+b.dataset.ix, 1); paintEntry(); });
  $('btnAddInv').onclick = () => { collectForm(); F.invs.push({ no: '', amt: '', manual: true }); paintEntry(); setTimeout(() => { const els = document.querySelectorAll('[data-ino]'); if (els.length) els[els.length - 1].focus(); }, 0); };
  $('btnAddInvO').onclick = () => { collectForm(); F.invs.push({ no: '', amt: '', manual: true, other: true, acct: '', store: '' }); paintEntry(); setTimeout(() => { const els = document.querySelectorAll('[data-isr]'); if (els.length) els[els.length - 1].focus(); }, 0); };
  document.querySelectorAll('[data-isr]').forEach(el => el.oninput = () => othSearch(+el.dataset.isr));
  document.querySelectorAll('[data-oap]').forEach(el => othPickPaint(+el.dataset.oap));
  paintInvSum();
  if ($('fMemo')) $('fMemo').oninput = () => { F.memo = $('fMemo').value; };
  $('btnSave').onclick = saveEntry;
  if ($('btnCancelEdit')) $('btnCancelEdit').onclick = () => { resetForm(); toast('수정을 취소했습니다. · Edit cancelled.'); Router.go(isSales() ? 'mine' : 'verify'); };
}
function paintVisitTotal() { const el = document.querySelector('.paytot'); if (el) el.innerHTML = '이번 방문 합계 Visit total <b>' + money(payTotal()) + '</b> (' + F.pays.length + '건)'; }
function pickStore(acct) {
  const a = S.accounts.byCode[acct]; if (!a) return;
  F.acct = a.acct; F.store = a.store; F.newStore = false; F.addr = ''; F.picked = []; F.invs = F.invs.filter(v => v.other); F.arList = null;
  if (!isSales() && !F.sm && a.sm) F.sm = String(a.sm).toUpperCase();
  paintEntry();
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
  toast('✓ 등록된 거래처입니다 · ' + a.store, 'good');
  setTimeout(() => { const el = document.querySelector('[data-pref="0"]') || document.querySelector('[data-pamt="0"]'); if (el && !('ontouchstart' in window)) el.focus(); }, 60);
}
/** 거래처 카드의 최근 수금 (앱 기록) */
async function loadRecent() {
  const b = $('histBox'); if (!b) return;
  try {
    const wh = [['acct', '==', F.acct]]; if (isSales()) wh.push(['sm', '==', me()]);
    const rows = F.acct ? sortBy((await S.DB.list('entries', { where: wh })).filter(e => !e.void), e => e.d + (e.createdAt || ''), true).slice(0, 3) : [];
    if (!$('histBox')) return;
    $('histBox').innerHTML = '<div class="h1">최근 수금 · Recent</div>' + (rows.length ? rows.map(e => '<div class="r"><span>' + esc(e.d) + '</span><span>' + esc((e.pays || []).map(p => p.m + (p.ref ? ' #' + p.ref : '')).join(', ')) + '</span><span>' + money(e.total) + '</span></div>').join('') : '<div style="opacity:.7">기록 없음 · No history</div>') +
      '<button type="button" class="histbtn" id="btnFullHist">🔎 전체 기록 보기 · Full history</button>';
    $('btnFullHist').onclick = () => Router.go('hist', encodeURIComponent(F.acct || F.store));
  } catch (e) { if ($('histBox')) $('histBox').innerHTML = ''; }
}
/** 원래 체크 번호를 내 기록에서 찾아 보여 줌 (오타 방지) */
async function origLook(i) {
  const el = document.querySelector('[data-porig="' + i + '"]'), out = document.querySelector('[data-ohint="' + i + '"]'); if (!el || !out) return;
  el.value = el.value.replace(/[^0-9A-Za-z-]/g, ''); const q = el.value.trim(); out.className = 'origHint';
  if (q.length < 3) { out.textContent = q ? '3자리 이상 · 3+ digits' : ''; return; }
  out.textContent = '찾는 중… Looking up';
  const rows = await myEntries();
  const it = rows.find(e => (e.pays || []).some(p => String(p.ref || '').replace(/[^0-9]/g, '') === q.replace(/[^0-9]/g, '')));
  if (el.value.trim() !== q) return;
  if (it) { out.innerHTML = '✓ 원래 체크 #' + esc(q) + ' — ' + esc(it.store) + ' · ' + money(it.total) + ' · ' + esc(it.d); out.className = 'origHint ok'; }
  else { out.textContent = '기록에서 못 찾았습니다 — 번호를 확인하세요 (그래도 저장은 됩니다) · not found'; out.className = 'origHint bad'; }
}
/* ---- AR 미결 인보이스 고르기 ---- */
async function paintArPick() {
  const box = $('arPick'); if (!box) return;
  if (!F.acct || F.editing) { box.innerHTML = ''; return; }
  if (!F.arList) { box.innerHTML = '<div class="arpick"><div class="aph"><span>📋 미결 인보이스 불러오는 중… Loading open invoices</span></div></div>'; const r = await openInvoices(F.acct); if (!$('arPick')) return; F.arList = r.list; F.arAsOf = r.asOf; }
  const list = F.arList;
  if (!list.length) { box.innerHTML = '<div class="arpick"><div class="aph"><span>📋 AR 에 미결 인보이스 없음 · No open invoices</span><span>' + (F.arAsOf ? '기준일 ' + esc(F.arAsOf) : '') + '</span></div><div class="hint" style="margin:0">새로 발행된 인보이스는 아래 [＋ 목록에 없는 인보이스] 로 넣으세요.</div></div>'; return; }
  box.innerHTML = '<div class="arpick"><div class="aph"><span>📋 미결 인보이스 ' + list.length + '건 — 탭해서 고르기 · Tap to pick</span><span>' + (F.arAsOf ? 'AR 기준일 ' + esc(F.arAsOf) : '') + '</span></div>' +
    list.map((x, i) => { const on = F.picked.includes(x.no); return '<div class="apr' + (on ? ' on' : '') + '" data-pk="' + i + '"><div class="cb">' + (on ? '✓' : '') + '</div><div class="ai"><b>' + esc(x.no) + (x.app ? ' <span class="tag t-b">앱</span>' : '') + '</b><small>' + esc(md(x.d)) + ' · ' + (x.pdd > 0 ? x.pdd + '일 연체' : x.pdd === 0 || x.pdd == null ? '기한 전' : 'D' + x.pdd) + (x.paid ? ' · 이미 받음 ' + money(x.paid) : '') + '</small></div><div class="ab">' + money(x.bal) + '<small>' + (x.paid ? '남은 잔액 · remaining' : '잔액 · balance') + '</small></div></div>'; }).join('') + '</div>';
  box.querySelectorAll('[data-pk]').forEach(d => d.onclick = () => { collectForm(); const x = list[+d.dataset.pk]; if (F.picked.includes(x.no)) { F.picked = F.picked.filter(k => k !== x.no); F.invs = F.invs.filter(v => !(v.ar && v.no === x.no && !v.other)); } else { F.invs = F.invs.filter(v => v.ar || v.other || v.no || amtOf(v.amt)); F.picked.push(x.no); F.invs.push({ no: x.no, t: invType(x.no), amt: '', bal: x.bal, paid: x.paid, ar: true }); } arAlloc(); paintEntry(); });
}
/* ---- 🏬 다른 가게 ---- */
function othSearch(i) {
  const el = document.querySelector('[data-isr="' + i + '"]'), box = document.querySelector('[data-isl="' + i + '"]'), out = document.querySelector('[data-isn="' + i + '"]'); if (!el) return;
  const raw = el.value.trim(); out.textContent = ''; out.className = 'isn';
  if (!raw) { box.style.display = 'none'; return; }
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === raw && digits.length <= 4) { box.style.display = 'none'; if (digits.length < 4) { out.textContent = '코드 4자리 또는 가게 이름 · 4-digit code or name'; return; } const a = S.accounts.byCode[digits]; if (a) return othPick(i, a); out.textContent = '없는 코드 · not found'; out.className = 'isn bad'; return; }
  if (raw.length < 2) { box.style.display = 'none'; out.textContent = '두 글자 이상 · 2+ letters'; return; }
  const hits = searchAccounts(S.accounts, raw, 40);
  if (!hits.length) { box.style.display = 'none'; out.textContent = '못 찾았습니다 · no match'; out.className = 'isn bad'; return; }
  box.innerHTML = hits.map(a => '<div data-oa="' + esc(a.acct) + '">' + esc(a.store) + '<span class="code">' + esc(a.acct) + '</span><small>' + esc([a.city, a.state].filter(Boolean).join(', ')) + '</small></div>').join(''); box.style.display = '';
  out.textContent = hits.total > hits.length ? hits.total + '곳 중 ' + hits.length + '곳 — 단어를 더 넣어 좁히세요' : hits.length + '곳 — 목록에서 고르세요 · pick one';
  box.querySelectorAll('[data-oa]').forEach(d => d.onclick = () => othPick(i, S.accounts.byCode[d.dataset.oa]));
}
function othPick(i, a) { collectForm(); const v = F.invs[i]; if (!v) return; v.acct = a.acct; v.store = a.store; paintEntry(); setTimeout(() => { const el = document.querySelector('[data-ino="' + i + '"]'); if (el && !el.value) el.focus(); }, 0); }
async function othPickPaint(i) {
  const v = F.invs[i], host = document.querySelector('[data-oap="' + i + '"]'); if (!v || !host || !v.acct) return;
  if (!F.othAr[v.acct]) { host.innerHTML = '<div class="aph">📋 미결 인보이스 불러오는 중… Loading</div>'; const r = await openInvoices(v.acct); F.othAr[v.acct] = r.list; if (!document.querySelector('[data-oap="' + i + '"]')) return; }
  const list = F.othAr[v.acct];
  if (!list.length) { host.innerHTML = '<div class="aph">📋 AR 에 미결 인보이스 없음 — 번호 · 금액을 직접 적어 주세요</div>'; return; }
  const picked = {}; F.invs.forEach(x => { if (x.ar && x.other && x.acct === v.acct) picked[x.no] = 1; });
  host.innerHTML = '<div class="aph">📋 ' + esc(v.store) + ' 미결 ' + list.length + '건 — 탭해서 고르기</div>' + list.map((x, k) => '<div class="apr' + (picked[x.no] ? ' on' : '') + '" data-opk="' + k + '"><div class="cb">' + (picked[x.no] ? '✓' : '') + '</div><div class="ai"><b>' + esc(x.no) + '</b><small>' + esc(md(x.d)) + (x.pdd > 0 ? ' · ' + x.pdd + '일 연체' : '') + '</small></div><div class="ab">' + money(x.bal) + '</div></div>').join('');
  host.querySelectorAll('[data-opk]').forEach(d => d.onclick = () => { collectForm(); const x = list[+d.dataset.opk]; const cur = F.invs.findIndex(y => y.ar && y.other && y.acct === v.acct && y.no === x.no); if (cur >= 0) F.invs.splice(cur, 1); else F.invs.splice(i + 1, 0, { no: x.no, t: invType(x.no), amt: x.bal.toFixed(2), bal: x.bal, paid: x.paid, ar: true, manual: true, other: true, acct: v.acct, store: v.store }); paintEntry(); });
}
/* ---- 저장 ---- */
async function saveEntry() {
  collectForm();
  if (!F.store) return toast('가게 이름 또는 계정코드를 입력하세요. · Enter a store or account #.', 'bad');
  const pays = F.pays.map(p => ({ m: p.m, ref: p.ref || '', amt: R2(amtOf(p.amt)), dep: p.dep || F.d, mob: !!p.mob, repl: !!p.repl, orig: p.orig || '' }));
  for (let i = 0; i < pays.length; i++) { const p = pays[i], tag = pays.length > 1 ? '결제 ' + (i + 1) + ': ' : ''; if (p.m === 'CHECK' && !p.ref) return toast(tag + 'Check 번호를 입력하세요. · Enter the check #.', 'bad'); if (p.repl && !p.orig) return toast(tag + '바운스된 원래 체크 번호를 넣어 주세요. · Enter the original (bounced) check #.', 'bad'); if (!(p.amt > 0)) return toast(tag + '금액을 올바르게 입력하세요. · Enter a valid amount.', 'bad'); if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dep)) return toast(tag + 'Deposit Date를 선택하세요. · Choose a deposit date.', 'bad'); }
  if (F.d > today()) return toast('받은 날짜는 오늘 이후로 할 수 없습니다. · Received date can’t be in the future.', 'bad');
  const seen = {}; for (const p of pays) { if (p.m === 'CHECK') { if (seen[p.ref]) return toast('Check #' + p.ref + ' 가 두 번 들어갔습니다. · entered twice.', 'bad'); seen[p.ref] = 1; } }
  const replAll = pays.every(p => p.repl);
  const invs = replAll ? [] : F.invs.filter(v => !v.zero).map(v => ({ no: invNo(v.no), t: v.no ? invType(v.no) : '', amt: R2(amtOf(v.amt)), acct: v.other ? v.acct : '', store: v.other ? v.store : '', partial: !!v.partial, ar: !!v.ar })).filter(v => v.no || v.amt);
  const ivs = {};
  for (let j = 0; j < invs.length; j++) { const iv = invs[j], it = '인보이스 ' + (j + 1) + ': '; const src = F.invs.filter(v => !v.zero)[j]; if (src && src.other && !src.acct) return toast(it + '🏬 다른 가게를 목록에서 고르세요. · Pick the other store from the list.', 'bad'); if (!iv.no) return toast(it + '번호를 입력하세요. · Enter invoice #.', 'bad'); if (iv.amt === 0) return toast(it + '금액을 입력하세요 (크레딧은 ＋ 를 눌러 －). · Enter amount.', 'bad'); if (invTypeOf(iv.no) === 'X') return toast(it + 'A·P·W·CM 으로 시작하는 번호만. · Only A/P/W/CM invoices.', 'bad'); if (ivs[iv.no]) return toast(iv.no + ' 가 두 번 들어갔습니다. · entered twice.', 'bad'); ivs[iv.no] = 1; }
  const total = R2(sum(pays, p => p.amt)), invTot = R2(sum(invs, v => v.amt));
  const mismatch = invs.length && Math.abs(total - invTot) > 0.009 ? '⚠️ 인보이스 합 ' + money(invTot) + ' ≠ 받은 돈 ' + money(total) + ' (차액 ' + money(R2(total - invTot)) + ')' : '';
  /* 같은 체크 번호가 이미 있으면 한 번 더 확인 */
  if (!F.editing) { const rows = await myEntries(); const dup = rows.find(e => (e.pays || []).some(p => p.m === 'CHECK' && pays.some(q => q.m === 'CHECK' && q.ref === p.ref))); if (dup && !(await confirmBox('Check #' + pays.find(q => q.m === 'CHECK').ref + ' 는 ' + dup.d + ' ' + dup.store + ' ' + money(dup.total) + ' 로 이미 저장돼 있습니다.\n그래도 저장하시겠습니까? · Save anyway?', '그래도 저장'))) return; }
  const partialMemo = F.invs.filter(v => v.partial && !v.zero).map(v => '파샬 ' + v.no + ' ' + money(amtOf(v.amt)) + '/' + money(v.bal)).join(', ');
  if (!(await confirmBox(F.store + ' — ' + money(total) + ' (' + pays.map(p => p.m === 'CHECK' ? '체크 #' + p.ref : p.m).join(', ') + ')' + (invs.length ? ' → ' + invs.map(v => v.no).join(', ') : replAll ? ' · 대체 체크' : ' · 인보이스 없음') + (mismatch ? '\n' + mismatch + ' — 저장되지만 담당자 확인 표시가 붙습니다' : '') + '\n저장할까요? / Save this payment?', '저장 Save'))) return;
  const id = F.editing || newId('E');
  const doc = { id, d: F.d, ym: ym(F.d), sm: me(), acct: F.acct || '', store: F.store, addr: F.addr || '', newStore: !!F.newStore,
    pays, invs, refs: pays.filter(p => p.m === 'CHECK' && p.ref).map(p => String(p.ref).replace(/^#/, '')), total, invTotal: invTot, mismatch, memo: [F.memo, partialMemo].filter(Boolean).join(' · '), repl: replAll, orig: replAll ? pays[0].orig : '', disc: '', createdBy: S.user.email, updatedAt: new Date().toISOString() };
  busy(true);
  try {
    if (F.editing) {
      const old = await S.DB.get('entries', id);
      if (old && old.sb && isSales()) { busy(false); return toast('담당자가 이미 확인한 건은 수정할 수 없습니다 — 담당자에게 말씀하세요', 'bad'); }
      if (old && old.rep && isSales()) { busy(false); return toast('이미 리포트로 전송된 건은 수정할 수 없습니다 · Already reported — ask the office.', 'bad'); }
      await S.DB.update('entries', id, doc);
    } else {
      Object.assign(doc, { sb: false, rc: false, v: false, vn: '', settled: '', void: false, rep: false, createdAt: new Date().toISOString() });
      await S.DB.set('entries', id, doc);
    }
    clearEntryCache();
    if (S.DB.queued) toast('📱 ' + bt('폰에 저장했습니다 — 인터넷이 되면 자동으로 올라갑니다 (다시 입력하지 마세요)', 'Saved on this phone — uploads automatically when online (don\'t re-enter)') + ' ' + money(total), 'good');
    else toast((F.editing ? '수정되었습니다 · Updated' : '저장 완료 · Saved') + ' ' + money(total) + (F.newStore ? ' (신규 거래처 · new store)' : ''), 'good');
    resetForm(); Router.go(isSales() ? 'mine' : 'verify');
  } catch (e) { toast('저장 실패 Save failed: ' + (e.code || e.message), 'bad'); }
  busy(false);
}

/* ============================================================
 *  ② 오늘 내역 · Daily Report
 * ============================================================ */
let PHOTOS = [];
async function paintToday() {
  /* rep 가 없는 옛 기록(이 버전 이전 입력) 은 이미 처리된 것으로 봄 — 전송 대기는 rep === false 만 */
  const rows = (await myEntries(true)).filter(r => r.d === TODAY_D || (r.rep === false && !r.sb && r.d < today()));
  const live = rows.filter(r => !r.void);
  const tot = sum(live, r => r.total), by = { CHECK: 0, ZELLE: 0, CASH: 0 };
  live.forEach(r => (r.pays || []).forEach(p => { by[p.m === 'CASH' ? 'CASH' : p.m === 'ZELLE' ? 'ZELLE' : 'CHECK'] += num(p.amt); }));
  const pend = live.filter(r => r.rep === false && !r.sb), late = pend.filter(r => r.d < TODAY_D);
  let h = '<div class="sumcard"><div class="lbl">' + (TODAY_D === today() ? '오늘 수금 합계 · Today total' : '수금 합계 · Total') + ' (' + esc(TODAY_D) + ')</div><div class="big">' + money(tot) + '</div><div class="split"><div>CHECK <b>' + money(by.CHECK) + '</b></div><div>ZELLE <b>' + money(by.ZELLE) + '</b></div><div>CASH <b>' + money(by.CASH) + '</b></div><div><b>' + live.length + '</b> 건</div></div></div>';
  if (pend.length) h += '<div class="pendbar">⏰ 아직 전송하지 않은 수금 <b>' + pend.length + '건</b> · ' + money(sum(pend, r => r.total)) + (late.length ? '<br><span style="font-weight:700">그중 <b>' + late.length + '건</b>은 지난 날짜에 입력한 것입니다 — 지워지지 않았고, 전송하면 같이 나갑니다.</span>' : '') + '<br><span style="font-weight:400">일과를 마치면 아래 <b>📧 Daily Report 전송</b> 을 눌러 주세요 · Send today’s report before you finish.</span></div>';
  h += rows.length ? rows.map(r => entCard(r)).join('') : '<div class="none">오늘 입력한 내역이 없습니다.<br><span class="en">No entries today.</span></div>';
  h += '<div class="card"><label>📧 Daily Report — 발송 대상 <span class="en">Send to</span></label><div style="font-size:15px;font-weight:700;margin-bottom:12px">' + esc(REPORT_TO()) + '</div>' +
    '<label>날짜 <span class="en">Date</span></label><input id="rDate" type="date" value="' + esc(TODAY_D) + '" max="' + today() + '"><div class="hint" style="margin-bottom:14px">다른 날짜를 보려면 바꾸세요. <span class="en">Change to view another day.</span></div>' +
    '<div id="rPreview" style="font-size:14px;line-height:1.7;margin-bottom:16px">' + (pend.length ? '<b>' + pend.length + '건</b> · 합계 <b>' + money(sum(pend, r => r.total)) + '</b> 전송 예정 · to send' : '<span class="muted">전송할 미전송 내역이 없습니다. <span class="en">Nothing to send.</span></span>') + '</div>' +
    '<label>📷 오늘 받은 체크 사진 <span class="en">Check photos</span> <span style="font-weight:400">(선택 · 여러 장 · 최대 15장)</span></label>' +
    '<input id="rPhotoCam" type="file" accept="image/*" capture="environment" style="display:none"><input id="rPhotoLib" type="file" accept="image/*" multiple style="display:none">' +
    '<div class="two" style="margin-top:6px"><button type="button" class="b-ghost" id="btnPhotoCam">📷 사진 찍기 · Camera</button><button type="button" class="b-ghost" id="btnPhotoLib">🖼 여러 장 고르기 · Choose</button></div>' +
    '<div id="phGrid" class="phgrid"></div><div class="hint" id="phHint"></div>' +
    '<button class="b-blue" id="btnSend" style="background:var(--amber);margin-top:14px;padding:16px" ' + (pend.length ? '' : 'disabled') + '>📧 Daily Report 전송 · Send</button>' +
    '<div class="hint" style="text-align:center;margin-top:10px"><b>아직 안 보낸 건만</b> 전송됩니다 (한 번 보낸 건은 다시 안 감). 전송 후 취소는 담당자를 통해야 합니다.<br><span class="en">Only entries not yet reported are sent. After sending, ask the office to cancel.</span></div></div>';
  $('hubBody').innerHTML = h;
  $('rDate').onchange = () => { TODAY_D = $('rDate').value || today(); paintToday(); };
  $('btnPhotoCam').onclick = () => $('rPhotoCam').click(); $('btnPhotoLib').onclick = () => $('rPhotoLib').click();
  $('rPhotoCam').onchange = e => { addPhotos(e.target.files); e.target.value = ''; }; $('rPhotoLib').onchange = e => { addPhotos(e.target.files); e.target.value = ''; };
  renderPhotos();
  document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => Router.go('entry', b.dataset.ed));
  document.querySelectorAll('[data-vd]').forEach(b => b.onclick = async () => { if (!(await confirmBox('이 건을 취소하시겠습니까? · Void this entry?', '취소 Void'))) return; busy(true); try { await S.DB.update('entries', b.dataset.vd, { void: true, updatedAt: new Date().toISOString() }); clearEntryCache(); toast('취소 처리됨 · Voided', 'good'); paintToday(); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); });
  PEND_N = pend.length; sendBtnState();
  $('btnSend').onclick = () => sendReport(pend);
}
function entCard(r) {
  const vd = !!r.void;
  const bits = (r.pays || []).map(p => esc(p.m) + (p.ref ? ' #' + esc(p.ref) : '') + ' ' + money(p.amt) + (p.mob ? ' <span class="mobtag">📱</span>' : '') + (p.repl ? ' <span class="rpltag">🔁 대체' + (p.orig ? ' · 원래 #' + esc(p.orig) : '') + '</span>' : '') + (p.dep && p.dep !== r.d ? (p.dep > today() ? ' <span class="posttag">입금 Dep ' + esc(p.dep) + '</span>' : ' · 입금 ' + esc(p.dep)) : ''));
  if (r.d !== TODAY_D && r.rep === false) bits.unshift('<span class="latetag">지난 건 ' + esc(md(r.d)) + ' · not sent</span>');
  return '<div class="ent' + (vd ? ' void' : '') + (r.mismatch ? ' bad' : '') + '"><div class="t"><div class="store">' + esc(r.store) + (r.acct ? '<span class="code">' + esc(r.acct) + '</span>' : '') + (r.newStore ? '<span class="newtag">NEW</span>' : '') + '</div><div class="amt">' + money(r.total) + '</div></div>' +
    '<div class="meta">' + bits.join(' · ') + (r.addr ? '<br>' + esc(r.addr) : '') +
    ((r.invs || []).length ? '<div class="invs">' + r.invs.map(v => '<span class="' + esc(v.t || '') + (v.amt < 0 ? ' neg' : '') + '">' + esc(v.no) + (v.acct ? ' <b>🏬' + esc(v.acct) + '</b>' : '') + ' ' + money(v.amt) + (v.partial ? ' 파샬' : '') + '</span>').join('') + '</div>' : '') +
    (r.memo ? '📝 ' + esc(r.memo) + '<br>' : '') + (r.mismatch ? '<span class="warn">' + esc(r.mismatch) + '</span><br>' : '') +
    '<span class="pill' + (r.rep ? ' sent' : '') + '">' + (vd ? '취소됨 Void' : r.rep ? '리포트 전송됨 Sent' : '전송 대기 Pending') + '</span> <span class="muted">' + esc(stageText(r)) + '</span></div>' +
    (!vd && r.rep !== true && !r.sb ? '<div class="act"><button type="button" data-ed="' + esc(r.id) + '" style="color:#1d4ed8;border-color:#bfdbfe">수정 Edit</button><button type="button" data-vd="' + esc(r.id) + '">취소 Void</button></div>' : '') + '</div>';
}
/* 체크 사진 줄이기 — 한 장씩 차례로 (여러 장을 한꺼번에 줄이면 폰 메모리가 모자라 빈 사진 "data:," 이 되던 문제 · 수금 앱 v81 과 같음)
 *  결과가 비었으면 더 작게 한 번 더, 그래도 안 되면 실패로. 20초 안에 못 읽어도 실패 */
function shrink(file, max) {
  max = max || 1100;
  return new Promise(res => {
    const url = URL.createObjectURL(file), img = new Image(); let done = false;
    const fin = d => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch (e) {} res(d); };
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, sc = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL('image/jpeg', 0.55); c.width = 0; c.height = 0;   // 메모리 바로 돌려주기
        if (!/^data:image\/jpeg;base64,/.test(d) || d.length < 3000) { if (max > 800) { done = true; try { URL.revokeObjectURL(url); } catch (e) {} return shrink(file, 800).then(res); } return fin(null); }
        fin(d);
      } catch (e) { fin(null); }
    };
    img.onerror = () => fin(null);
    setTimeout(() => fin(null), 20000);
    img.src = url;
  });
}
let PH_BUSY = 0;
async function addPhotos(files) {
  let list = Array.from(files || []); if (!list.length) return;
  if (PHOTOS.length + list.length > 15) { toast('사진은 15장까지. · Up to 15 photos.', 'bad'); list = list.slice(0, Math.max(0, 15 - PHOTOS.length)); }
  let fail = 0; PH_BUSY += list.length; renderPhotos();
  for (const f of list) {
    const d = await shrink(f); PH_BUSY = Math.max(0, PH_BUSY - 1);
    if (d && PHOTOS.reduce((a, x) => a + x.length, 0) + d.length > 900000) { toast('사진 용량이 한도를 넘었습니다 — 더 넣을 수 없습니다. · Photo size limit reached.', 'bad'); PH_BUSY = 0; break; }
    if (d) PHOTOS.push(d); else fail++;
    renderPhotos(); await new Promise(r => setTimeout(r, 30));
  }
  renderPhotos();
  if (fail) toast('사진 ' + fail + '장을 읽지 못했습니다 — 다시 찍어 주세요. · Could not read ' + fail + ' photo(s).', 'bad');
}
function renderPhotos() {
  const g = $('phGrid'); if (!g) return;
  g.innerHTML = PHOTOS.map((d, i) => '<div class="ph"><img src="' + d + '"><button type="button" data-phx="' + i + '">✕</button></div>').join('');
  g.querySelectorAll('[data-phx]').forEach(b => b.onclick = () => { PHOTOS.splice(+b.dataset.phx, 1); renderPhotos(); });
  if ($('btnPhotoCam')) $('btnPhotoCam').textContent = PHOTOS.length ? '📷 한 장 더 찍기 · One more' : '📷 사진 찍기 · Camera';
  if ($('phHint')) $('phHint').innerHTML = PH_BUSY ? '사진 준비 중… ' + PH_BUSY + '장 남음 · Preparing photos…' : PHOTOS.length ? '<b>' + PHOTOS.length + '장</b> 첨부됩니다 (최대 15장). 리포트를 이미 보냈어도 <b>전송</b>을 누르면 사진만 따로 보냅니다.' : '';
  sendBtnState();
}
/* 리포트를 이미 보냈어도 사진이 있으면 버튼을 켜서 "사진만" 보낼 수 있게 (수금 앱 v81) */
let PEND_N = 0;
function sendBtnState() {
  const b = $('btnSend'); if (!b) return;
  b.disabled = !PEND_N && !PHOTOS.length;
  b.textContent = !PEND_N && PHOTOS.length ? '📷 체크 사진만 전송 · Send photos' : '📧 Daily Report 전송 · Send';
}
async function sendReport(pend) {
  if (PH_BUSY) return toast('사진을 아직 준비 중입니다 — 잠시 후 다시 눌러 주세요. · Photos still preparing.', 'bad');
  if (!pend.length) return sendPhotosOnly();
  if (!(await confirmBox(TODAY_D + ' 수금 ' + pend.length + '건 · ' + money(sum(pend, r => r.total)) + ' 을 ' + REPORT_TO() + ' 로 전송합니다.' + (PHOTOS.length ? '\n📷 체크 사진 ' + PHOTOS.length + '장 첨부' : '\n(체크 사진 없음 · no photo)') + '\n계속하시겠습니까? · Continue?', '전송 Send'))) return;
  busy(true);
  try {
    const now = new Date().toISOString(), id = me() + '_' + TODAY_D + '_' + now.substring(11, 19).replace(/:/g, '');
    let bytes = 0; const photos = []; for (const p of PHOTOS) { bytes += p.length; if (bytes > 850000) { toast('사진 용량이 많아 ' + photos.length + '장까지만 첨부됩니다', ''); break; } photos.push(p); }
    /* 📧 메일용 표 — 구글 Apps Script(apps-script/Code.gs)가 1분마다 mail:'wait' 을 찾아 보낸 사람 + 담당자 알림 이메일로 보냄 */
    const rows = pend.map(r => { const a = (S.accounts.byCode && S.accounts.byCode[r.acct]) || {}; const pays = r.pays || [], ck = pays.filter(p => p.m === 'CHECK'); return { store: r.store || '', acct: r.acct || '', addr: [a.addr || r.addr || '', [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ' ' + a.zip : '')].filter(Boolean).join(', '), pay: Array.from(new Set(pays.map(p => p.m))).join(', '), ref: pays.map(p => p.ref).filter(Boolean).join(', '), amt: R2(r.total || 0), invs: (r.invs || []).map(v => ({ no: v.no, amt: R2(v.amt || 0) })), memo: r.memo || '', rcv: r.d || TODAY_D, dep: (ck.find(p => p.dep) || {}).dep || '' }; });
    try { await S.DB.set('reports', id, { id, sm: me(), d: TODAY_D, n: pend.length, total: R2(sum(pend, r => r.total)), entries: pend.map(r => r.id), rows, photos, to: REPORT_TO(), sentAt: now, by: S.user.email, mail: 'wait' }); }
    catch (e) { if (String(e.code).includes('permission')) throw new Error('리포트 저장 권한이 없습니다 — Firestore 규칙에 reports 를 추가해야 합니다 (루크)'); throw e; }
    for (const r of pend) await S.DB.update('entries', r.id, { rep: true, repAt: now, repId: id });
    clearEntryCache(); PHOTOS = [];
    /* 메일은 Apps Script 가 1~2분 안에 자동으로 보냄 — 안 갔으면 기록 탭 "📧 보낸 Daily Report" 에서 다시 보내기 */
    toast(S.DB.queued ? '📱 ' + bt('인터넷이 없어 폰에 보관했습니다 — 연결되면 자동으로 보내집니다', 'No internet — kept on this phone, sends automatically when online') + ' · ' + pend.length + bt('건', '') : '전송했습니다 · Sent — ' + pend.length + '건 · 메일은 자동으로 갑니다', 'good');
    paintToday();
  } catch (e) { toast('전송 실패: ' + (e.message || e.code), 'bad'); }
  busy(false);
}

/** 📷 리포트는 이미 보냈고 체크 사진만 나중에 — 사진만 담은 리포트를 만들어 메일로 (Apps Script 가 "체크 사진 N장 (추가)" 로 보냄) */
async function sendPhotosOnly() {
  if (!PHOTOS.length) return;
  if (!(await confirmBox(TODAY_D + ' 체크 사진 ' + PHOTOS.length + '장만 ' + REPORT_TO() + ' 로 보냅니다. · Send photos only?', '전송 Send'))) return;
  busy(true);
  try {
    const now = new Date().toISOString(), id = me() + '_' + TODAY_D + '_' + now.substring(11, 19).replace(/:/g, '') + '_PH';
    let bytes = 0; const photos = []; for (const p of PHOTOS) { bytes += p.length; if (bytes > 850000) { toast('사진 용량이 많아 ' + photos.length + '장까지만 보냅니다', ''); break; } photos.push(p); }
    await S.DB.set('reports', id, { id, sm: me(), d: TODAY_D, n: 0, total: 0, entries: [], rows: [], photos, photoOnly: true, to: REPORT_TO(), sentAt: now, by: S.user.email, mail: 'wait' });
    PHOTOS = PHOTOS.slice(photos.length);
    toast('📷 체크 사진 ' + photos.length + '장을 보냈습니다 · Photos sent', 'good'); paintToday();
  } catch (e) { toast('전송 실패 — 사진은 그대로 있습니다. 신호 좋은 곳에서 다시 눌러 주세요. · ' + (e.code || e.message), 'bad'); }
  busy(false);
}

/* ============================================================
 *  ③ 기록 · 기간 리포트
 * ============================================================ */
async function paintHist() {
  const from = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })();
  $('hubBody').innerHTML = '<div class="card"><label>기록 조회 <span class="en">Collection history</span></label><div class="pdrow"><input id="hQ" autocomplete="off" placeholder="계정코드 / 가게 이름 / 체크번호" value="' + esc(HQ) + '"><button type="button" class="pdclr" id="hGo" style="background:var(--blue);color:#fff;border-color:var(--blue)">검색 Search</button></div>' +
    '<div class="hint">예) <b>4001</b> (계정코드) · <b>ali fl</b> (가게 이름) · <b>10432</b> (체크번호). 가게 이름은 <b>일부만 쳐도</b> 됩니다. 그 가게의 수금 · COD · ACH · 카드 기록이 모두 나오고, 합계 · 마지막 수금일이 위에 표시됩니다.<br><span class="en">e.g. account #, store name words, or check #</span></div>' +
    '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:600"><input type="checkbox" id="hOther" style="width:20px;height:20px" checked> COD · ACH · 카드도 같이 <span class="en">incl. COD / ACH / card</span></label></div>' +
    '<div id="hSum"></div><div id="hList"></div>' +
    '<div class="card"><details id="rpBox"><summary><label style="display:inline">📧 보낸 Daily Report <span class="en">Sent daily reports</span></label> <span class="muted">— 최근 10일 · 메일이 안 갔으면 다시 보내기</span></summary><div id="rpList" style="margin-top:8px"></div></details></div>' +
    '<div class="card"><label>🧾 기간 리포트 <span class="en">Period report</span> <span style="font-weight:400">(회사에 체크 · 캐쉬 보낼 때)</span></label><div class="two"><div class="fg"><label>시작 From</label><input id="pFrom" type="date" value="' + from + '"></div><div class="fg"><label>끝 To</label><input id="pTo" type="date" value="' + today() + '"></div></div>' +
    '<button type="button" class="b-ghost" id="pPrev">🖨 미리보기 · Preview / Print</button><button type="button" class="b-ghost" id="pMail" style="margin-top:8px">📧 이메일로 보내기 · Email</button><div class="hint" style="margin-top:8px">받은 날짜 기준입니다. 날짜별 소계와 CHECK · CASH · ZELLE 합계, 서명란이 들어갑니다.<br><span class="en">By received date — daily subtotals, totals by type, and signature lines.</span></div></div>';
  $('hGo').onclick = histSearch; $('hQ').onkeydown = e => { if (e.key === 'Enter') histSearch(); }; $('hOther').onchange = () => { if ($('hQ').value.trim()) histSearch(); };
  $('pPrev').onclick = () => periodReport(false); $('pMail').onclick = () => periodReport(true);
  $('rpBox').ontoggle = () => { if ($('rpBox').open) sentReports(); };
  if (HQ) histSearch();
}
/** 📧 내가 보낸 Daily Report — 메일 상태 (⏳ 보내는 중 · ✅ 보냄 · ⚠️ 실패) 와 다시 보내기 · 이메일 앱으로 */
async function sentReports() {
  const box = $('rpList'); if (!box) return; box.innerHTML = '<div class="load">읽는 중…</div>';
  const days = []; for (let i = 0; i < 10; i++) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  let list = [];
  try { list = sortBy(await S.DB.list('reports', { where: [['sm', '==', me()], ['d', 'in', days]] }), r => r.sentAt || '', true); }
  catch (e) { box.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="none">최근 10일 동안 보낸 리포트가 없습니다 · No reports</div>'; return; }
  const hm = t => t ? new Date(t).toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const stat = r => r.mail === 'sent' ? '<span class="tag t-k">✅ 메일 보냄 · Sent ' + esc(hm(r.mailAt)) + '</span>' : r.mail === 'error' ? '<span class="tag t-r">⚠️ 메일 실패 · Failed</span><div class="warn" style="font-size:12px">' + esc(r.mailErr || '') + '</div>' : '<span class="tag t-c">⏳ 보내는 중 · Sending</span>';
  box.innerHTML = list.map(r => '<div class="pr"><div class="ct"><b>' + esc(r.d) + ' · ' + (r.photoOnly ? '📷 체크 사진만 · Photos only' : (r.n || 0) + '건 · ' + money(r.total || 0)) + '</b><small>전송 ' + esc(hm(r.sentAt)) + ((r.photos || []).length ? ' · 📷 ' + r.photos.length : '') + (r.mailTo ? ' · ' + esc(r.mailTo) : '') + '</small><div style="margin-top:4px">' + stat(r) + '</div></div>' +
    '<div style="display:flex;flex-direction:column;gap:6px;flex:0 0 auto"><button type="button" class="b-ghost b-sm" data-rsend="' + esc(r.id) + '">📧 다시 보내기</button><button type="button" class="b-ghost b-sm" data-rapp="' + esc(r.id) + '">✉️ 이메일 앱</button></div></div>').join('');
  box.querySelectorAll('[data-rsend]').forEach(b => b.onclick = async () => {
    const r = list.find(x => x.id === b.dataset.rsend); if (!r) return;
    if (r.mail === 'sent' && !(await confirmBox(r.d + ' 리포트는 이미 메일로 보냈습니다. 한 번 더 보낼까요?', '다시 보내기'))) return;
    busy(true);
    try { await S.DB.update('reports', r.id, { mail: 'wait', mailErr: '', resendAt: new Date().toISOString(), resendBy: S.user.email }); toast('1~2분 안에 다시 보냅니다 · Resending', 'good'); sentReports(); }
    catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  });
  box.querySelectorAll('[data-rapp]').forEach(b => b.onclick = () => {
    const r = list.find(x => x.id === b.dataset.rapp); if (!r) return;
    const lines = (r.rows || []).map(x => x.store + (x.acct ? ' (' + x.acct + ')' : '') + ' — ' + (x.pay || '') + (x.ref ? ' #' + x.ref : '') + ' ' + money(x.amt || 0) + ((x.invs || []).length ? ' → ' + x.invs.map(v => v.no).join(', ') : ''));
    const body = 'Daily Report ' + r.d + ' — ' + r.sm + '\n' + (r.n || 0) + '건 · ' + money(r.total || 0) + '\n\n' + lines.join('\n') + ((r.photos || []).length ? '\n\n체크 사진 ' + r.photos.length + '장은 THE ONE 앱(수금 확인)에 있습니다.' : '');
    location.href = 'mailto:' + (r.to || REPORT_TO()) + '?subject=' + encodeURIComponent('Daily Report ' + r.d + ' ' + r.sm) + '&body=' + encodeURIComponent(body);
  });
}
async function allMine() {
  const yms = []; const d = new Date(); for (let i = 0; i < 24; i++) { yms.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); }
  const out = []; for (let i = 0; i < yms.length; i += 10) { const wh = [['ym', 'in', yms.slice(i, i + 10)]]; if (isSales()) wh.unshift(['sm', '==', me()]); out.push(...await S.DB.list('entries', { where: wh }).catch(() => [])); }
  return out;
}
async function histSearch() {
  const q = $('hQ').value.trim(); HQ = q; if (!q) return toast('검색어를 입력하세요. · Enter a search.', 'bad');
  $('hSum').innerHTML = '<div class="hsum">검색 중… Searching</div>'; $('hList').innerHTML = '';
  const rows = await allMine();
  let cods = []; if ($('hOther').checked) { try { const wh = isSales() ? [['sm', '==', me()]] : []; cods = (await S.DB.list('cod', wh.length ? { where: wh } : {})).filter(c => !c.void); } catch (e) {} }
  const digits = q.replace(/[^0-9]/g, ''), isAcct = /^\d{1,4}$/.test(q), isCheck = /^\d{5,}$/.test(q), words = q.split(/\s+/).map(nz).filter(Boolean);
  const matchStore = x => words.every(w => nz(x.store).includes(w));
  let items = [];
  if (isAcct) { const k = pad4(q); items = rows.filter(e => e.acct === k).map(e => Object.assign({ src: 'FIELD' }, e)).concat(cods.filter(c => c.acct === k).map(c => Object.assign({ src: c.method === 'ACH' ? 'ACH' : c.method === 'COD' ? 'COD' : 'CARD' }, c, { total: c.amt }))); }
  else if (isCheck) items = rows.filter(e => (e.pays || []).some(p => String(p.ref).replace(/[^0-9]/g, '') === digits)).map(e => Object.assign({ src: 'FIELD' }, e));
  else items = rows.filter(matchStore).map(e => Object.assign({ src: 'FIELD' }, e)).concat(cods.filter(matchStore).map(c => Object.assign({ src: c.method === 'ACH' ? 'ACH' : c.method === 'COD' ? 'COD' : 'CARD' }, c, { total: c.amt })));
  items = sortBy(items.filter(x => !x.void), x => x.d + (x.createdAt || ''), true);
  if (!items.length) { $('hSum').innerHTML = '<div class="hsum">"' + esc(q) + '" — 기록 없음 · No records</div>'; return; }
  const kind = isAcct ? '계정코드 Acct' : isCheck ? '체크번호 Check #' : '가게 이름 Store';
  let head = '<div class="hsum">' + kind + ' "' + esc(q) + '" — ' + items.length + '건 · 합계 Total ' + money(sum(items, x => x.total)) + '</div>';
  const stores = groupBy(items, x => (x.acct || '') + '|' + x.store), keys = Object.keys(stores);
  if (keys.length === 1) {
    const L = stores[keys[0]], a = L[0], by = { CHECK: 0, CASH: 0, ZELLE: 0, other: 0 };
    L.forEach(x => { if (x.src !== 'FIELD') by.other += num(x.total); else (x.pays || []).forEach(p => { by[p.m === 'CASH' ? 'CASH' : p.m === 'ZELLE' ? 'ZELLE' : 'CHECK'] += num(p.amt); }); });
    const last = L[0].d, first = L[L.length - 1].d;
    head += '<div class="card"><div style="font-weight:800;font-size:16px;margin-bottom:10px">' + esc(a.store) + (a.acct ? '<span class="code">' + esc(a.acct) + '</span>' : '') + '</div><div class="kpi" style="grid-template-columns:repeat(3,1fr)"><div><b>' + money(sum(L, x => x.total)) + '</b><span>총 수금 Total</span></div><div><b>' + L.length + '건</b><span>횟수 Count</span></div><div><b>' + esc(last) + '</b><span>마지막 Last · ' + daysBetween(last, today()) + '일 전</span></div></div>' +
      '<div class="muted" style="text-align:center;margin-top:8px">CHECK ' + money(by.CHECK) + ' · CASH ' + money(by.CASH) + ' · ZELLE ' + money(by.ZELLE) + (by.other ? ' · COD/ACH/카드 ' + money(by.other) : '') + '<br>처음 받은 날 First ' + esc(first) + '</div></div>';
  } else {
    head += '<div class="card"><div style="font-weight:800;margin-bottom:6px">가게별 · By store (' + keys.length + '곳)</div>' + keys.map(k => { const L = stores[k]; return '<div class="pr tap" data-hs="' + esc(L[0].acct || L[0].store) + '"><div class="ct"><b>' + esc(L[0].store) + (L[0].acct ? '<span class="code">' + esc(L[0].acct) + '</span>' : '') + '</b><small>' + L.length + '건</small></div><div class="pa"><b>' + money(sum(L, x => x.total)) + '</b></div></div>'; }).join('') + '<div class="hint" style="text-align:center">가게를 누르면 그 가게 기록만 봅니다 · tap a store</div></div>';
  }
  $('hSum').innerHTML = head;
  document.querySelectorAll('[data-hs]').forEach(el => el.onclick = () => { $('hQ').value = el.dataset.hs; histSearch(); });
  const SRC = { FIELD: ['수금', '#e0f2fe', '#075985'], COD: ['COD', '#fef3c7', '#92400e'], ACH: ['ACH', '#ede9fe', '#5b21b6'], CARD: ['카드', '#dcfce7', '#14532d'] };
  $('hList').innerHTML = items.map(x => { const sd = SRC[x.src] || SRC.FIELD; return '<div class="hent"><div class="t"><span><span class="tag" style="background:' + sd[1] + ';color:' + sd[2] + '">' + sd[0] + '</span> ' + esc(x.store) + (x.acct ? '<span class="code">' + esc(x.acct) + '</span>' : '') + '</span><span class="amt">' + money(x.total) + '</span></div>' +
    '<div class="meta"><span class="kv2"><b>받은 날 Rcvd</b> ' + esc(x.d) + '</span>' + (x.src === 'FIELD' ? (x.pays || []).map(p => '<span class="kv2"><b>' + esc(p.m) + '</b>' + (p.ref ? ' #' + esc(p.ref) : '') + ' ' + money(p.amt) + (p.mob ? ' 📱' : '') + (p.repl ? ' 🔁' : '') + '</span>').join('') : '<span class="kv2"><b>' + esc(x.method || '') + '</b>' + (x.ref ? ' ' + esc(x.ref) : '') + '</span>') +
    ((x.invs || []).length ? '<br>📄 ' + x.invs.map(v => esc(v.no) + ' ' + money(v.amt)).join(' · ') : '') + '<br><span class="kv2">👤 ' + esc(x.sm) + '</span><span class="kv2">' + (x.src === 'FIELD' ? (x.rep ? '리포트 전송됨 Sent' : '전송 대기 Pending') + ' · ' + esc(stageText(x)) : (x.v ? '확인됨' : '입력됨')) + '</span></div></div>'; }).join('');
}
async function periodReport(mail) {
  const f = $('pFrom').value, t = $('pTo').value; if (!f || !t) return toast('기간을 선택하세요. · Choose a date range.', 'bad');
  const rows = sortBy((await allMine()).filter(e => !e.void && e.d >= f && e.d <= t), e => e.d + (e.createdAt || ''));
  if (!rows.length) return toast('그 기간에 기록이 없습니다. · No records in that range.', 'bad');
  const by = groupBy(rows, r => r.d), days = Object.keys(by).sort(), tt = { CHECK: 0, CASH: 0, ZELLE: 0 };
  rows.forEach(r => (r.pays || []).forEach(p => { tt[p.m === 'CASH' ? 'CASH' : p.m === 'ZELLE' ? 'ZELLE' : 'CHECK'] += num(p.amt); }));
  if (mail) {
    const body = ['수금 리포트 ' + f + ' ~ ' + t + ' — ' + me(), rows.length + '건 · 합계 ' + money(sum(rows, r => r.total)) + ' (CHECK ' + money(tt.CHECK) + ' · CASH ' + money(tt.CASH) + ' · ZELLE ' + money(tt.ZELLE) + ')', ''].concat(days.map(d => d + ' (' + money(sum(by[d], r => r.total)) + ')\n' + by[d].map(r => '  ' + r.store + ' — ' + (r.pays || []).map(p => p.m + (p.ref ? ' #' + p.ref : '')).join(', ') + ' ' + money(r.total)).join('\n'))).join('\n');
    location.href = 'mailto:' + REPORT_TO() + '?subject=' + encodeURIComponent('수금 리포트 ' + f + '~' + t + ' ' + me()) + '&body=' + encodeURIComponent(body); return;
  }
  printOpen('<div style="font-family:Arial,sans-serif;font-size:13px"><h2 style="margin:0">THE ONE — 수금 리포트 Collection Report</h2><div>' + esc(me()) + ' · ' + esc(f) + ' ~ ' + esc(t) + ' · ' + rows.length + '건</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:12.5px"><tr><th style="text-align:left;border-bottom:1px solid #333;padding:4px">날짜</th><th style="text-align:left;border-bottom:1px solid #333;padding:4px">가게</th><th style="text-align:left;border-bottom:1px solid #333;padding:4px">결제</th><th style="text-align:left;border-bottom:1px solid #333;padding:4px">인보이스</th><th style="text-align:right;border-bottom:1px solid #333;padding:4px">금액</th></tr>' +
    days.map(d => by[d].map(r => '<tr><td style="padding:4px">' + esc(r.d) + '</td><td style="padding:4px">' + esc(r.store) + (r.acct ? ' (' + esc(r.acct) + ')' : '') + '</td><td style="padding:4px">' + esc((r.pays || []).map(p => p.m + (p.ref ? ' #' + p.ref : '')).join(', ')) + '</td><td style="padding:4px">' + esc((r.invs || []).map(v => v.no).join(', ')) + '</td><td style="padding:4px;text-align:right">' + money(r.total) + '</td></tr>').join('') + '<tr><td colspan="4" style="padding:4px;text-align:right;font-weight:700;border-top:1px solid #999">' + esc(d) + ' 소계</td><td style="padding:4px;text-align:right;font-weight:700;border-top:1px solid #999">' + money(sum(by[d], r => r.total)) + '</td></tr>').join('') +
    '<tr><td colspan="4" style="padding:6px 4px;text-align:right;font-weight:800;border-top:2px solid #333">합계 TOTAL · CHECK ' + money(tt.CHECK) + ' · CASH ' + money(tt.CASH) + ' · ZELLE ' + money(tt.ZELLE) + '</td><td style="padding:6px 4px;text-align:right;font-weight:800;border-top:2px solid #333">' + money(sum(rows, r => r.total)) + '</td></tr></table>' +
    '<div style="display:flex;gap:40px;margin-top:40px"><div style="flex:1;border-top:1px solid #333;padding-top:4px">세일즈맨 Salesman: ' + esc(me()) + '</div><div style="flex:1;border-top:1px solid #333;padding-top:4px">받은 사람 Received by</div><div style="flex:1;border-top:1px solid #333;padding-top:4px">날짜 Date</div></div></div>');
}

/* ============================================================
 *  ④ 미수금 (내 담당 AR)
 * ============================================================ */
const ARC = {};
async function arDocMine() {
  if (ARC.doc && Date.now() - ARC.at < 600000) return ARC.doc;
  let ar = null; try { ar = await S.DB.get('ar', me()); } catch (e) { ar = null; }
  /* 내가 발행한(앱) 인보이스 중 덜 받은 것도 — 앱을 쓰면 미수금이 저절로 맞춰짐 */
  let app = [], ents = []; try { [app, ents] = await Promise.all([S.DB.list('invoices', { where: [['sm', '==', me()], ['st', '==', 'open']] }), myEntries()]); } catch (e) {}
  const m = mergeAppInvoices(ar, app, ents); ARC.doc = m.stores.length ? m : ar; ARC.at = Date.now(); return ARC.doc;
}
const BK = ['기한 전', '1-30일', '31-60일', '61-90일', '90일+'];
let AR_F = 'all';
async function paintAR() {
  const ar = await arDocMine();
  if (!ar || !ar.stores) { $('hubBody').innerHTML = '<div class="card"><div class="none">아직 올라온 AR 이 없습니다. 담당자가 미수금(AR)을 올리면 여기에 보입니다.<br><span class="en">No AR uploaded yet.</span></div></div>'; return; }
  const rows = await myEntries(), paid = {};
  rows.forEach(e => { if (e.d <= (ar.asOf || '') || e.repl) return; (e.invs || []).forEach(v => { const k = (v.acct || e.acct) + '|' + v.no; paid[k] = R2((paid[k] || 0) + num(v.amt)); }); });
  const stores = ar.stores.map(s => { let net = 0; const b = [0, 0, 0, 0, 0]; const invs = (s.invs || []).map(v => { const p = v.app ? 0 : (paid[s.acct + '|' + v.inv] || 0); const bal = R2(v.bal - p); return Object.assign({}, v, { paid: p, net: bal }); }); invs.forEach(v => { net += v.net; if (v.net > 0) b[Math.max(0, Math.min(4, v.bk || 0))] += v.net; else b[0] += v.net; }); return Object.assign({}, s, { net: R2(net), b: b.map(R2), invs, done: net <= 0.005, maxPdd: Math.max(0, ...invs.filter(v => v.net > 0.005).map(v => v.pdd || 0)) }); });
  const live = stores.filter(s => !s.done), done = stores.filter(s => s.done), total = sum(live, s => s.net), bk = [0, 1, 2, 3, 4].map(i => sum(live, s => s.b[i])), stale = daysBetween(ar.asOf, today()), dormant = live.filter(s => s.dormant);
  const cnt = [0, 1, 2, 3, 4].map(i => live.filter(s => s.b[i] > 0.005).length);
  const filt = AR_F === 'all' ? live : AR_F === 'z' ? dormant : AR_F === 'done' ? done : live.filter(s => s.b[+AR_F] > 0.005);
  let h = '<div class="card"><label>내 미수금 <span class="en">My open AR</span></label><div class="hero">' + money(total) + '</div><div class="heroSub">' + live.length + '곳 · 기준일 ' + esc(ar.asOf) + (stale > 0 ? ' <span class="warn">(그 뒤 받은 돈은 뺐습니다)</span>' : '') + '</div>' +
    '<div class="arbk">' + bk.map((v, i) => '<div class="k' + i + '"><b>' + (Math.abs(v) >= 1000 ? '$' + Math.round(v / 1000) + 'K' : '$' + Math.round(v)) + '</b><span>' + BK[i] + '</span></div>').join('') + '</div></div>' +
    '<div class="card"><label>오래된 순 <span class="en">Oldest first</span></label><div class="chips">' + [['all', '전체 ' + live.length]].concat([4, 3, 2, 1, 0].filter(i => cnt[i]).map(i => [String(i), BK[i] + ' ' + cnt[i]])).concat(dormant.length ? [['z', '💤 1년+ 거래 없음 ' + dormant.length]] : []).concat(done.length ? [['done', '✅ 받을 것 없음 ' + done.length]] : []).map(c => '<button class="' + (AR_F === c[0] ? 'on' : '') + '" data-arf="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
    (filt.length ? sortBy(filt, s => s.maxPdd, true).map(s => { const bkI = s.maxPdd <= 0 ? 0 : s.maxPdd <= 30 ? 1 : s.maxPdd <= 60 ? 2 : s.maxPdd <= 90 ? 3 : 4; return '<div class="pr tap" data-ars="' + esc(s.acct) + '"><div class="ct"><b>' + esc(s.store) + '</b><small>' + esc(s.acct) + ' · ' + s.invs.filter(v => v.net > 0.005).length + '건' + (s.lastPaid ? ' · 마지막 수금 ' + esc(s.lastPaid) : '') + (s.dormant ? ' · <span class="warn">💤 1년+ 수금 없음</span>' : '') + (s.done ? ' · <span class="ok">받을 것 없음</span>' : '') + '</small></div><span class="agebadge a' + bkI + '">' + (s.maxPdd > 0 ? s.maxPdd + '일 연체' : BK[0]) + '</span><div class="pa"><b>' + money(s.net) + '</b></div></div>'; }).join('') : '<div class="none">해당하는 가게가 없습니다</div>') +
    '<div class="hint" style="margin-top:10px">가게를 누르면 인보이스별 내역이 나옵니다. 거기서 바로 수금 입력으로 넘어갈 수 있습니다.</div></div>';
  $('hubBody').innerHTML = h;
  document.querySelectorAll('[data-arf]').forEach(b => b.onclick = () => { AR_F = b.dataset.arf; paintAR(); });
  document.querySelectorAll('[data-ars]').forEach(el => el.onclick = () => arStore(stores.find(x => x.acct === el.dataset.ars), ar.asOf));
}
function arStore(s, asOf) {
  openModal('<div style="font-weight:800;font-size:17px">' + esc(s.store) + '</div><div class="muted">' + esc(s.acct) + ' · ' + s.invs.filter(v => Math.abs(v.net) > 0.005).length + '건 · 기준일 ' + esc(asOf || '') + '</div><div class="hero" style="margin-top:8px">' + money(s.net) + '</div>' +
    s.invs.filter(v => Math.abs(v.net) > 0.005).map(v => { const bkI = Math.max(0, Math.min(4, v.bk || 0)); return '<div class="pr tap" data-ari="' + esc(v.inv) + '"><div class="ct"><b>' + esc(v.inv) + ' ›</b><small>' + esc(md(v.d)) + (v.paid ? ' · 받음 ' + money(v.paid) : '') + '</small></div><span class="agebadge a' + bkI + '">' + (v.pdd > 0 ? v.pdd + '일 연체' : 'D' + (v.pdd || 0)) + '</span><div class="pa"><b>' + money(v.net) + '</b></div></div>'; }).join('') +
    '<div class="hint">D-17 은 아직 기한까지 17일 남았다는 뜻입니다. 마이너스 금액은 CM(크레딧)입니다.</div><div class="btns"><button class="b-ghost" id="arX">닫기 Close</button><button class="b-ghost" id="arSt">🏬 ' + bi('가게 창 · 인보이스 전체', 'Store · all invoices') + '</button><button class="b-blue" id="arGo">＋ 이 가게 수금 입력</button></div>');
  $('arX').onclick = closeModal;
  /* 인보이스를 누르면 인보이스 · AR · 수금을 한 화면에 (‹ 로 여기로 돌아옴) */
  document.querySelectorAll('#mbox [data-ari]').forEach(el => el.onclick = () => Store.invDetail(el.dataset.ari, s.acct, () => arStore(s, asOf)));
  if ($('arSt')) $('arSt').onclick = () => Store.storeSheet(s.acct, null, 'invh');
  $('arGo').onclick = () => { closeModal(); resetForm(); const a = S.accounts.byCode[s.acct]; if (a) { F.acct = a.acct; F.store = a.store; } else { F.store = s.store; F.acct = s.acct; } Router.go('entry'); };
}
