/* ============================================================
 *  🏦 ACH (담당자) — 옛 ACH 앱과 같은 흐름
 *    탭: 입력 · 할 일 · 거래처 · 달력 · 현황
 *    입력: 가게(코드/이름) → 인보이스 날짜 · 조건(ACH 30 …) → 인출 예정일 자동(영업일 · 휴일) → 인보이스 줄 → 저장
 *    할 일: 셋업 필요 · 전체 · 지연 · 예약됨 · 반송 · 최근 완료 — Cash Pro 셋업 ☑ · 📧 안내 메일 · 상세(라우팅/계좌 복사) · NSF · 재인출
 *    거래처: ACH 거래처 찾기 · 이력 · 신규 등록(Application: 은행 · 라우팅 검사 · 계좌)
 *    달력: 월별 인출 예정 · 날짜별 목록
 *    현황: 지연 · 셋업 필요 · 오늘·내일 · 이번 주 · 반송 · 이번 달 들어온 돈
 *  자료: ach/{id} (건) · achBank/{acct} (은행 정보 — achAccess 있는 사람만) · accounts/{acct}.ach* (상태 표시용)
 *  인출 완료(수동 · 자동: 예정일 + 3영업일) → cod 컬렉션에 method 'ACH' 로 넣어 수금 확인 · 정산으로 흐름
 * ============================================================ */
import { $, esc, money, num, R2, today, ym, md, addDays, daysBetween, toast, busy, openModal, closeModal, confirmBox, Router, sum, sortBy, groupBy, pad4, nz, sel, hasWords } from './ui.js';
import { newId } from './db.js';
import { searchAccounts, sortStores } from './accounts.js';
import { invType } from './comm.js';

let S = null;
export function register(state) { S = state; Router.on('ach', a => hub(a || TAB)); }
const achOk = () => S.role === 'admin' || !!(S.me && S.me.achAccess);
const TERMS = () => (S.settings && S.settings.achTerms) || ['ACH 15', 'ACH 30', 'ACH 45', 'ACH 60', 'ACH 90'];

/* ---------- 영업일 · 휴일 ---------- */
function nthDow(y, m, dow, n) { const d = new Date(y, m, 1); let c = 0; while (true) { if (d.getDay() === dow && ++c === n) return d; d.setDate(d.getDate() + 1); } }
function lastDow(y, m, dow) { const d = new Date(y, m + 1, 0); while (d.getDay() !== dow) d.setDate(d.getDate() - 1); return d; }
const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function observed(y, m, day) { const d = new Date(y, m, day); if (d.getDay() === 6) d.setDate(d.getDate() - 1); else if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; }
let HOL = null, HOLY = '';
function holidays() {
  const y = new Date().getFullYear();
  if (HOL && HOLY === String(y)) return HOL;
  HOL = {}; HOLY = String(y);
  [y - 1, y, y + 1].forEach(Y => {
    [observed(Y, 0, 1), nthDow(Y, 0, 1, 3), nthDow(Y, 1, 1, 3), lastDow(Y, 4, 1), observed(Y, 5, 19), observed(Y, 6, 4), nthDow(Y, 8, 1, 1), nthDow(Y, 9, 1, 2), observed(Y, 10, 11), nthDow(Y, 10, 4, 4), observed(Y, 11, 25)].forEach(d => { HOL[fmt(d)] = 1; });
  });
  ((S.settings && S.settings.holidays) || []).forEach(d => { HOL[d] = 1; });
  return HOL;
}
export function nextBiz(s, add) { const H = holidays(); let d = addDays(s, add || 0); for (let i = 0; i < 40; i++) { const w = new Date(d + 'T12:00:00').getDay(); if (w !== 0 && w !== 6 && !H[d]) return d; d = addDays(d, 1); } return d; }
function bizAfter(s, n) { let d = s; for (let i = 0; i < n; i++) d = nextBiz(addDays(d, 1)); return d; }

/* ============================================================
 *  허브
 * ============================================================ */
let TAB = 'new', SEG = 'need', JF = { sm: '', q: '' }, CAL = { ym: ym(today()), day: '' }, AQ = '';
async function hub(tab) {
  TAB = ['new', 'job', 'acct', 'cal', 'stat'].includes(tab) ? tab : 'new';
  const t = [['new', '➕ 입력', 'New'], ['job', '✅ 할 일', 'Tasks', 'bJob'], ['acct', '🏦 거래처', 'Accounts'], ['cal', '📅 달력', 'Calendar'], ['stat', '📊 현황', 'Stats']];
  $('page').innerHTML = '<div class="ctabs five">' + t.map(x => '<button class="' + (TAB === x[0] ? 'on' : '') + '" data-at="' + x[0] + '">' + x[1] + '<span class="en">' + x[2] + '</span>' + (x[3] ? '<span class="badge" id="' + x[3] + '" style="display:none">0</span>' : '') + '</button>').join('') + '</div><div id="achBody"><div class="load">읽는 중…</div></div>';
  document.querySelectorAll('[data-at]').forEach(b => b.onclick = () => Router.go('ach', b.dataset.at));
  if (TAB === 'new') await paintNew(); else if (TAB === 'job') await paintJobs(); else if (TAB === 'acct') await paintAccts(); else if (TAB === 'cal') await paintCal(); else await paintStats();
  fillBadge();
}
async function fillBadge() { try { const rows = await openRows(); const n = rows.filter(o => bucket(o) === 'need' || bucket(o) === 'late' || bucket(o) === 'nsf').length; const b = $('bJob'); if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; } } catch (e) {} }

/* ---------- 자료 ---------- */
let OPEN = null, OPEN_AT = 0;
async function openRows(force) {
  if (OPEN && !force && Date.now() - OPEN_AT < 60000) return OPEN;
  let rows = (await S.DB.list('ach', { where: [['open', '==', true]] })).filter(o => !o.void);
  rows = await autoComplete(rows);
  OPEN = sortBy(rows, o => (o.drawOn || '9999') + (o.createdAt || '')); OPEN_AT = Date.now(); return OPEN;
}
const drop = () => { OPEN = null; };
/** 예정일 + 3영업일 지난 예약 건은 자동 완료 (Cash Pro 가 예정일에 그대로 빼므로) */
async function autoComplete(rows) {
  const t = today(), keep = [];
  for (const o of rows) {
    if (o.setup && o.st !== 'NSF' && o.st !== 'HOLD' && o.drawOn && bizAfter(o.drawOn, 3) <= t) { try { await markDone(o, o.amt, true); continue; } catch (e) {} }
    keep.push(o);
  }
  return keep;
}
function bucket(o) { const t = today(); if (o.st === 'NSF') return 'nsf'; if (o.st === 'HOLD') return 'hold'; if (o.drawOn && o.drawOn < t) return 'late'; if (!o.setup) return 'need'; return 'wait'; }
export function mailDue(o) { if (!o.setup || o.mail || o.st === 'NSF' || o.st === 'HOLD' || !o.drawOn || o.drawOn < today()) return false; let d = o.drawOn; for (let i = 0; i < 2; i++) { d = addDays(d, -1); while (!isBizDay(d)) d = addDays(d, -1); } return d <= today(); }
function isBizDay(d) { const w = new Date(d + 'T12:00:00').getDay(); return w !== 0 && w !== 6 && !holidays()[d]; }
function isSoon(o) { return !!o.setup && o.st !== 'HOLD' && o.drawOn >= today() && o.drawOn <= nextBiz(today(), 1); }
function acctInfo(code) { const a = S.accounts.byCode[code]; return a || null; }
function achTag(a) { return !a || !a.ach ? '<span class="tag t-k">신규 · Application 필요</span>' : !a.achReady ? '<span class="tag t-c">은행 정보 없음</span>' : a.achCashPro ? '<span class="tag t-g">ACH 준비됨</span>' : '<span class="tag t-c">Cash Pro 등록 대기</span>'; }

/* ============================================================
 *  ① 입력
 * ============================================================ */
const F = { acct: '', store: '', sm: '', invDate: today(), terms: 'ACH 30', drawOn: '', touched: false, lines: [{ no: '', amt: '' }], note: '' };
function resetF() { Object.assign(F, { acct: '', store: '', sm: '', invDate: today(), terms: 'ACH 30', drawOn: '', touched: false, lines: [{ no: '', amt: '' }], note: '' }); }
function calcDraw() { if (F.touched) return; const days = Number(String(F.terms).replace(/[^0-9]/g, '')); if (!F.invDate || !days) { F.drawOn = ''; F.moved = false; return; } const raw = addDays(F.invDate, days); F.drawOn = nextBiz(raw); F.moved = F.drawOn !== raw; }
async function paintNew() {
  calcDraw();
  const a = F.acct ? acctInfo(F.acct) : null;
  let h = '<div class="card"><h2>새 ACH 건 <span class="en">New ACH</span></h2>';
  if (!F.acct) h += '<div class="fg" style="position:relative"><label>가게 · 계정코드 <span class="en">Store / Acct #</span></label><input id="aQ" placeholder="1234 또는 가게 이름" autocomplete="off"><div class="hits" id="aHits" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:30"></div></div>';
  else {
    h += '<div class="info"><div class="nm">' + esc(F.store) + '<span class="code">' + esc(F.acct) + '</span></div><div class="kv"><b>상태</b><span>' + achTag(a) + '</span></div>' + (a && a.sm ? '<div class="kv"><b>담당</b><span>' + esc(a.sm) + (a.city ? ' · ' + esc(a.city) + (a.state ? ', ' + esc(a.state) : '') : '') + '</span></div>' : '') +
      (a && a.ach ? '<div class="kv"><b>📧 메일</b><span>' + (a.achEm ? esc(a.achEm) : '<span style="color:#fde68a">고객 이메일 없음 — 안내 메일이 안 나갑니다</span>') + (a.achRepEm ? ' · ' + esc(a.achRepEm) : '') + ' <button type="button" id="aEm" style="background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:7px;padding:2px 8px;font-size:11.5px">고치기</button></span></div>' : '') +
      '<div class="tools"><button type="button" id="aUnpick">다른 가게 · Change</button>' + (!a || !a.ach || !a.achReady ? '<button type="button" id="aReg">🏦 은행 정보 등록 · Register</button>' : '<button type="button" id="aHist">📜 ACH 이력 · History</button>') + '</div></div>';
    if (!a || !a.ach) h += '<div class="alert a-amb">거래처에 ACH 등록이 안 된 가게입니다. 지금 입력은 그대로 저장해도 되고, Cash Pro 에 올리려면 Application(은행 정보)이 필요합니다.</div>';
  }
  h += '<div class="two" style="margin-top:10px"><div class="fg"><label>인보이스 날짜 <span class="en">Invoice date</span></label><input id="aInvD" type="date" value="' + esc(F.invDate) + '"></div><div class="fg"><label>조건 <span class="en">Terms</span></label>' + sel('aTerms', TERMS().concat(TERMS().includes(F.terms) ? [] : [F.terms]), F.terms) + '</div></div>' +
    '<div class="fg"><label>인출 예정일 <span class="en">Draw date</span> <span style="font-weight:400">— 자동 계산 (고치면 그대로 씁니다)</span></label><div class="pdrow"><input id="aDraw" type="date" value="' + esc(F.drawOn) + '"><button type="button" class="pdclr" id="aDrawAuto">자동 Auto</button></div><div class="hint" style="margin:4px 0 0">' + (F.touched ? '직접 고친 날짜입니다' : F.moved ? '주말·휴일이라 다음 영업일로 옮겼습니다' : '') + '</div></div>' +
    '<label>인보이스 <span class="en">Invoices</span></label><div id="aLines">' + F.lines.map((v, i) => lineRow(v, i)).join('') + '</div><button type="button" class="b-ghost b-sm" id="aMore">＋ 인보이스 추가</button>' +
    '<div class="paytot" style="margin-top:10px">합계 Total <b id="aTot">' + money(lineTotal()) + '</b></div>' +
    '<div class="fg"><label>메모 <span class="en">Note</span> (선택)</label><input id="aNote" value="' + esc(F.note) + '" placeholder="예: 부분 결제 · 손님 요청"></div>' +
    '<button class="b-blue" id="aSave" style="padding:16px;font-size:17px">저장 · SAVE</button></div>';
  h += '<div class="card"><h2>오늘 넣은 건 <span class="en">Entered today</span></h2><div id="aMine" class="load">읽는 중…</div></div>';
  $('achBody').innerHTML = h;
  bindNew();
  loadMine();
}
function lineRow(v, i) { const t = v.no ? invType(v.no) : '?'; return '<div class="ivr" data-li="' + i + '"><span class="ity ' + (t === '?' ? '' : t) + '">' + t + '</span><input class="ino" data-lno="' + i + '" value="' + esc(v.no) + '" placeholder="A00001 / CM0001" autocomplete="off" autocapitalize="characters"><input class="iam" data-lamt="' + i + '" inputmode="decimal" value="' + esc(v.amt) + '" placeholder="0.00"><button type="button" class="idel" data-ldel="' + i + '">✕</button></div>'; }
function lineTotal() { return sum(F.lines, v => num(v.amt)); }
function collectNew() { F.invDate = $('aInvD').value; F.terms = $('aTerms').value; F.note = $('aNote').value; F.lines = Array.from(document.querySelectorAll('[data-lno]')).map(el => ({ no: el.value.trim().toUpperCase(), amt: document.querySelector('[data-lamt="' + el.dataset.lno + '"]').value })); }
function bindNew() {
  const q = $('aQ');
  if (q) {
    q.oninput = () => { const hits = searchAccounts(S.accounts, q.value, 12), box = $('aHits'); const qq = q.value.trim(); box.style.display = qq ? '' : 'none';
      box.innerHTML = (hits.length ? hits.map(a => '<div data-a="' + esc(a.acct) + '"><b>' + esc(a.store) + '</b> <span class="muted">' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + '</span> ' + achTag(a) + '</div>').join('') : '<div class="muted">찾는 가게가 없습니다 — 거래처 탭에서 먼저 등록하세요</div>');
      box.querySelectorAll('[data-a]').forEach(d => d.onclick = () => pickAcct(d.dataset.a)); };
    q.onkeydown = e => { if (e.key === 'Enter') { const f = document.querySelector('#aHits [data-a]'); if (f) f.click(); } };
    setTimeout(() => q.focus(), 0);
  }
  if ($('aUnpick')) $('aUnpick').onclick = () => { collectNew(); F.acct = ''; F.store = ''; F.sm = ''; paintNew(); };
  if ($('aReg')) $('aReg').onclick = () => { collectNew(); REG_BACK = F.acct; AQ = F.acct; Router.go('ach', 'acct'); };
  if ($('aHist')) $('aHist').onclick = () => acctHist(F.acct, F.store);
  if ($('aEm')) $('aEm').onclick = () => { const a = acctInfo(F.acct) || {}; openModal('<h2>안내 메일 받는 곳 — ' + esc(F.store) + '</h2><div class="hint">여기서 고치면 거래처에도 저장됩니다.</div><div class="fg"><label>고객 이메일</label><input id="emC" type="email" value="' + esc(a.achEm || '') + '"></div><div class="fg"><label>담당자 이메일 (선택)</label><input id="emR" type="email" value="' + esc(a.achRepEm || '') + '"></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">저장</button></div>'); $('mX').onclick = closeModal; $('mOk').onclick = async () => { const c = $('emC').value.trim(), r = $('emR').value.trim(); if (!c) return toast('고객 이메일을 넣어 주세요', 'bad'); busy(true); try { await S.DB.update('accounts', F.acct, { achEm: c, achRepEm: r, updatedAt: new Date().toISOString() }); const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer(); closeModal(); toast('저장했습니다', 'good'); collectNew(); paintNew(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); }; };
  $('aInvD').onchange = () => { collectNew(); F.touched = false; paintNew(); };
  $('aTerms').onchange = () => { collectNew(); F.touched = false; paintNew(); };
  $('aDraw').onchange = () => { collectNew(); F.touched = true; F.drawOn = $('aDraw').value; paintNew(); };
  $('aDrawAuto').onclick = () => { collectNew(); F.touched = false; paintNew(); };
  $('aMore').onclick = () => { collectNew(); F.lines.push({ no: '', amt: '' }); paintNew(); setTimeout(() => { const L = document.querySelectorAll('[data-lno]'); L[L.length - 1].focus(); }, 0); };
  document.querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => { collectNew(); F.lines.splice(+b.dataset.ldel, 1); if (!F.lines.length) F.lines.push({ no: '', amt: '' }); paintNew(); });
  document.querySelectorAll('[data-lno]').forEach(el => { el.oninput = () => { el.value = el.value.toUpperCase(); const t = el.value ? invType(el.value) : '?'; const b = el.parentNode.querySelector('.ity'); b.textContent = t; b.className = 'ity ' + (t === '?' ? '' : t); }; el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); document.querySelector('[data-lamt="' + el.dataset.lno + '"]').focus(); } }; });
  document.querySelectorAll('[data-lamt]').forEach(el => { el.oninput = () => { el.value = el.value.replace(/[^0-9.]/g, ''); collectNew(); $('aTot').textContent = money(lineTotal()); }; el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey || e.metaKey) return saveNew(false); $('aMore').click(); } }; });
  $('aSave').onclick = () => saveNew();
}
function pickAcct(code) { const a = acctInfo(code); if (!a) return; F.acct = a.acct; F.store = a.store; F.sm = a.sm || ''; if (a.terms && /ACH/i.test(a.terms)) { const t = a.terms.toUpperCase().replace(/ACH\s*/, 'ACH '); F.terms = t; } F.touched = false; paintNew(); setTimeout(() => { const f = document.querySelector('[data-lno]'); if (f) f.focus(); }, 0); }
async function saveNew(force) {
  collectNew();
  if (!F.acct) return toast('가게를 골라 주세요', 'bad');
  const lines = F.lines.filter(v => v.no || num(v.amt));
  if (!lines.length) return toast('인보이스를 넣어 주세요', 'bad');
  for (const v of lines) { if (!v.no) return toast('인보이스 번호가 빈 줄이 있습니다', 'bad'); if (!num(v.amt)) return toast('[' + v.no + '] 금액이 없습니다', 'bad'); }
  if (!F.invDate) return toast('인보이스 날짜를 넣어 주세요', 'bad');
  if (!F.drawOn) return toast('인출 예정일이 없습니다', 'bad');
  lines.forEach(v => { if (invType(v.no) === 'CM' && num(v.amt) > 0) v.amt = String(-Math.abs(num(v.amt))); });   /* 크레딧 메모는 마이너스로 */
  const amt = sum(lines, v => num(v.amt));
  /* 중복: 같은 가게 · 같은 인보이스 번호가 미완료 건에 있으면 */
  if (!force) {
    const open = await openRows(); const nos = lines.map(v => v.no);
    const dup = open.filter(o => o.acct === F.acct && (o.lines || []).some(l => nos.includes(l.no)));
    if (dup.length) { if (!(await confirmBox('이미 들어 있는 인보이스입니다:\n' + dup.map(o => o.inv + ' · ' + money(o.amt) + ' · 인출 ' + o.drawOn).join('\n') + '\n\n그래도 저장할까요?', '그래도 저장'))) return; }
    else if (!(await confirmBox(F.store + ' · ' + money(amt) + ' · 인출 ' + F.drawOn + '\n' + nos.join(', ') + '\n저장할까요? · Save?', '저장 Save'))) return;
  }
  const id = newId('H'), now = new Date().toISOString();
  const doc = { id, acct: F.acct, store: F.store, sm: F.sm || '', lines: lines.map(v => ({ no: v.no, t: invType(v.no), amt: R2(num(v.amt)) })), inv: lines.map(v => v.no).join(', '), amt, invDate: F.invDate, terms: F.terms, drawOn: F.drawOn, drawYm: ym(F.drawOn), moved: !!F.moved && !F.touched, fixed: !!F.touched,
    setup: false, setupBy: '', setupAt: '', mail: '', st: '', open: true, done: false, doneOn: '', doneYm: '', doneAmt: 0, auto: false, codId: '', note: F.note.trim(), void: false, createdBy: S.user.email, createdAt: now, updatedAt: now };
  busy(true);
  try { await S.DB.set('ach', id, doc); drop(); toast('저장했습니다 · ' + money(amt) + ' · 인출 예정 ' + F.drawOn, 'good'); resetF(); paintNew(); }
  catch (e) { toast('저장 실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}
async function loadMine() {
  const box = $('aMine'); if (!box) return;
  try {
    const rows = sortBy((await S.DB.list('ach', { where: [['createdBy', '==', S.user.email]] })).filter(o => !o.void && (o.createdAt || '').substring(0, 10) === today()), o => o.createdAt, true);
    if (!$('aMine')) return;
    box.className = ''; box.innerHTML = rows.length ? rows.map(o => '<div class="pr tap" data-det="' + o.id + '"><div class="ct"><b>' + esc(o.store) + '</b><small>' + esc(o.inv) + ' · 인출 ' + esc(o.drawOn) + '</small></div><div class="pa"><b>' + money(o.amt) + '</b></div></div>').join('') : '<div class="none">아직 없습니다</div>';
    box.querySelectorAll('[data-det]').forEach(el => el.onclick = () => detail(el.dataset.det));
  } catch (e) { box.className = ''; box.innerHTML = '<div class="none">' + esc(e.code || e.message) + '</div>'; }
}

/* ============================================================
 *  ② 할 일
 * ============================================================ */
async function paintJobs() {
  const rows = await openRows(true);
  const c = { late: 0, need: 0, wait: 0, nsf: 0, hold: 0, mail: 0 }; let soon = 0; rows.forEach(o => { c[bucket(o)]++; if (isSoon(o)) soon++; if (mailDue(o)) c.mail++; });
  const defs = [['need', '셋업 필요 ' + c.need], ['all', '전체 ' + rows.length], ['late', '지연 ' + c.late], ['wait', '예약됨 ' + c.wait + (soon ? ' · 오늘·내일 ' + soon : '')]]; if (c.mail) defs.push(['mail', '📧 안내 메일 ' + c.mail]); if (c.nsf) defs.push(['nsf', '반송 ' + c.nsf]); if (c.hold) defs.push(['hold', '⏸ 보류 ' + c.hold]); defs.push(['done', '최근 완료']);
  if (SEG !== 'done' && SEG !== 'all' && !c[SEG]) SEG = rows.length ? 'all' : 'need';
  const sms = Object.keys(groupBy(rows.filter(o => o.sm), o => String(o.sm).toUpperCase())).sort();
  let h = '<div class="seg">' + defs.map(d => '<button class="' + (SEG === d[0] ? 'on' : '') + '" data-seg="' + d[0] + '">' + d[1] + '</button>').join('') + '</div>';
  if (sms.length > 1 || JF.q) h += '<div class="chips" style="margin-bottom:6px"><button class="' + (JF.sm ? '' : 'on') + '" data-jsm="">전체</button>' + sms.map(n => '<button class="' + (JF.sm === n ? 'on' : '') + '" data-jsm="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>';
  h += '<input id="jq" placeholder="가게 · 코드 · 인보이스 검색" value="' + esc(JF.q) + '" autocomplete="off" style="margin-bottom:8px"><div id="jobList"></div>';
  $('achBody').innerHTML = h;
  document.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { SEG = b.dataset.seg; paintJobs(); });
  document.querySelectorAll('[data-jsm]').forEach(b => b.onclick = () => { JF.sm = b.dataset.jsm; paintJobs(); });
  $('jq').oninput = () => { JF.q = $('jq').value; paintJobList(rows); };
  paintJobList(rows);
}
function applyFilter(list) { const q = JF.q.trim().toUpperCase(); return list.filter(o => (!JF.sm || String(o.sm || '').toUpperCase() === JF.sm) && (!q || hasWords(String(o.store || '') + ' ' + o.acct + ' ' + String(o.inv || '') + ' ' + String(o.sm || ''), q))); }
async function paintJobList(rows) {
  const box = $('jobList'); if (!box) return;
  if (SEG === 'done') return paintDone(box);
  const list = applyFilter(SEG === 'all' ? rows : SEG === 'mail' ? rows.filter(mailDue) : rows.filter(o => bucket(o) === SEG));
  if (!list.length) { box.innerHTML = '<div class="none">없습니다 👍</div>'; return; }
  const grouped = SEG === 'need' || SEG === 'late'; let last = null;
  let h = '<div class="hsum">' + list.length + '건 · ' + money(sum(list, o => o.amt)) + (SEG === 'all' ? ' <span style="font-weight:400;color:#64748b">— 인출 예정일 순 (🔴 지연 · 🟠 오늘·내일 · 🔵 예약됨 · ⚪ 셋업 전)</span>' : '') + '</div>';
  list.forEach(o => {
    if (grouped && (o.drawOn || '') !== last) { last = o.drawOn || ''; const g = list.filter(x => (x.drawOn || '') === last), need = g.filter(x => !x.setup).length, late = last && last < today(); h += '<div class="dayhd' + (late ? ' late' : '') + '"><span>' + (last ? '📅 ' + last + (late ? ' (지남)' : '') : '📅 인출일 없음') + ' · ' + g.length + '건 · ' + money(sum(g, x => x.amt)) + '</span>' + (need && last ? '<button data-setday="' + last + '">전부 셋업 ☑ (' + need + ')</button>' : '') + '</div>'; }
    h += jobCard(o);
  });
  box.innerHTML = h; bindJobs(box);
}
function jobCard(o) {
  if (o.done) return '<div class="job set"><div class="tap" data-det="' + o.id + '"><div class="t"><span class="st">' + esc(o.store || o.acct) + '</span><span class="am">' + money(o.doneAmt || o.amt) + '</span></div><div class="m"><span>' + esc(o.inv) + '</span><span>✅ 완료 ' + esc(o.doneOn) + (o.auto ? ' (자동)' : '') + '</span>' + (o.codId ? '<span>💳 COD·ACH 반영</span>' : '') + '</div></div></div>';
  const b = bucket(o), cls = b === 'late' || b === 'nsf' ? 'late' : b === 'hold' ? 'hold' : isSoon(o) ? 'soon' : o.setup ? 'set' : 'wait';
  const meta = []; if (o.drawOn) meta.push('인출 ' + o.drawOn); if (o.terms) meta.push(o.terms); if (o.sm) meta.push(o.sm); if (o.mail) meta.push('📧 보냄'); else if (mailDue(o)) meta.push('📧 안내 메일 보낼 때'); if (o.st === 'HOLD') meta.push('⏸ 보류'); if (o.fixed) meta.push('📌 날짜 고정'); if (o.redrawOf) meta.push('🔁 재인출');
  return '<div class="job ' + cls + '"><div class="tap" data-det="' + o.id + '"><div class="t"><span class="st">' + esc(o.store || o.acct) + '</span><span class="am">' + money(o.amt) + '</span></div><div class="m"><span>' + esc(o.inv) + '</span>' + meta.map(x => '<span>' + esc(x) + '</span>').join('') + '<span class="open">🏦 Cash Pro 정보 ›</span></div></div>' +
    '<div class="acts">' + (o.setup ? '<button class="b-ghost" data-setup="' + o.id + '|0">셋업 취소</button>' : '<button class="b-blue" data-setup="' + o.id + '|1">Cash Pro 셋업 ☑</button>') + '<button class="' + (o.mail ? 'b-ghost' : 'b-amb') + '" data-mail="' + o.id + '">📧 안내 메일' + (o.mail ? ' (보냄)' : '') + '</button></div>' +
    (o.setup && o.st !== 'NSF' ? '<div class="acts"><button class="b-ghost b-sm" data-nsf="' + o.id + '">⚠️ 인출이 안 됐어요 — 반송 (NSF)</button><button class="b-ghost b-sm" data-done="' + o.id + '">✅ 인출 완료 (지금)</button></div>' : '') +
    (o.st === 'NSF' ? '<div class="acts"><button class="b-blue" data-redraw="' + o.id + '">🔁 재인출 — 새 날짜로 다시</button><button class="b-ghost b-sm" data-void="' + o.id + '">취소 (종결)</button></div>' : '') + '</div>';
}
function bindJobs(box) {
  box.querySelectorAll('[data-det]').forEach(el => el.onclick = () => detail(el.dataset.det));
  box.querySelectorAll('[data-setup]').forEach(b => b.onclick = () => { const [id, on] = b.dataset.setup.split('|'); setSetup([id], on === '1'); });
  box.querySelectorAll('[data-setday]').forEach(b => b.onclick = async () => { const d = b.dataset.setday; const ids = applyFilter(OPEN || []).filter(o => !o.setup && o.drawOn === d && o.st !== 'NSF').map(o => o.id); if (!ids.length) return; if (!(await confirmBox(d + ' 인출 ' + ids.length + '건을 전부 Cash Pro 셋업 ☑ 할까요?', '전부 셋업'))) return; setSetup(ids, true); });
  box.querySelectorAll('[data-mail]').forEach(b => b.onclick = () => mailNotice(b.dataset.mail));
  box.querySelectorAll('[data-nsf]').forEach(b => b.onclick = () => nsfAsk(b.dataset.nsf));
  box.querySelectorAll('[data-done]').forEach(b => b.onclick = () => doneAsk(b.dataset.done));
  box.querySelectorAll('[data-redraw]').forEach(b => b.onclick = () => redrawAsk(b.dataset.redraw));
  box.querySelectorAll('[data-void]').forEach(b => b.onclick = async () => { if (!(await confirmBox('이 반송 건을 종결(취소)할까요? 목록에서 빠집니다.', '종결'))) return; busy(true); try { await S.DB.update('ach', b.dataset.void, { void: true, open: false, updatedAt: new Date().toISOString() }); drop(); toast('종결했습니다'); refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); });
}
function refresh() { if (TAB === 'job') paintJobs(); else if (TAB === 'cal') paintCal(); else if (TAB === 'stat') paintStats(); else paintNew(); fillBadge(); }
async function setSetup(ids, on) {
  busy(true); let n = 0;
  try { for (const id of ids) { await S.DB.update('ach', id, { setup: on, setupBy: on ? S.user.email.split('@')[0] + ' ' + today() : '', setupAt: on ? new Date().toISOString() : '', updatedAt: new Date().toISOString() }); n++; } drop(); toast(on ? '셋업 ✓ ' + n + '건 — 인출일까지 목록에 남아 있다가 인출 후 자동으로 완료됩니다' : '셋업 취소', 'good'); }
  catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false); refresh();
}
async function byId(id) { const o = (OPEN || []).find(x => x.id === id); return o || (await S.DB.get('ach', id)); }
/** 인출 완료 → cod 컬렉션(ACH) 로 넘김 (수금 확인 · 정산에 보임) */
async function markDone(o, amt, auto) {
  const d = auto ? o.drawOn : today(), now = new Date().toISOString(), codId = o.codId || newId('C');
  if (!o.codId) await S.DB.set('cod', codId, { id: codId, d, ym: ym(d), sm: o.sm || (acctInfo(o.acct) || {}).sm || '', acct: o.acct, store: o.store, method: 'ACH', ref: 'ACH ' + o.drawOn, amt: R2(amt), invs: (o.lines || []).map(l => ({ no: l.no, t: l.t || invType(l.no), amt: l.amt })), disc: '', note: (auto ? '자동 완료 · ' : '') + (o.note || ''), achId: o.id, v: false, vn: '', settled: '', void: false, createdBy: S.user.email, createdAt: now });
  await S.DB.update('ach', o.id, { done: true, setup: true, doneOn: d, doneYm: ym(d), doneAmt: R2(amt), auto: !!auto, open: false, codId, st: 'done', updatedAt: now });
  drop();
}
function doneAsk(id) {
  byId(id).then(o => { if (!o) return;
    openModal('<h2>인출 완료</h2><div class="muted">' + esc(o.store) + ' · ' + esc(o.inv) + '</div><div class="fg" style="margin-top:8px"><label>실제로 들어온 금액</label><input id="dAmt" inputmode="decimal" value="' + (Number(o.amt) || 0).toFixed(2) + '" style="font-weight:800;text-align:right"></div><div class="hint">인보이스 금액과 다르면 그대로 기록됩니다. 완료되면 💳 COD·ACH 목록에 ACH 로 들어가 정산에 반영됩니다.</div><div class="btns"><button class="b-ghost" id="dX">취소</button><button class="b-blue" id="dOk">완료 처리</button></div>');
    $('dX').onclick = closeModal; $('dOk').onclick = async () => { const a = num($('dAmt').value); closeModal(); busy(true); try { await markDone(o, a, false); toast('인출 완료 ✓ — 💳 COD·ACH 에 넣었습니다', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); refresh(); };
    setTimeout(() => $('dAmt').select(), 50); });
}
function nsfAsk(id) {
  byId(id).then(o => { if (!o) return;
    openModal('<h2>반송 (NSF) 처리</h2><p>' + esc(o.store) + ' — 은행에서 돈이 안 빠졌나요?</p><div class="hint">반송으로 바꾸면 [반송] 칸으로 가고, 자동 완료 대상에서 빠집니다. 재인출은 그 칸에서 새 날짜로 만듭니다.</div><div class="btns"><button class="b-ghost" id="nX">취소</button><button class="b-red" id="nOk">반송으로</button></div>');
    $('nX').onclick = closeModal; $('nOk').onclick = async () => { closeModal(); busy(true); try { const patch = { st: 'NSF', nsfOn: today(), open: true, done: false, updatedAt: new Date().toISOString() }; if (o.codId) { try { await S.DB.update('cod', o.codId, { void: true, note: '반송(NSF) ' + today() }); } catch (e) {} patch.codId = ''; } await S.DB.update('ach', o.id, patch); drop(); toast('반송으로 바꿨습니다 — [반송] 칸으로'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); SEG = 'nsf'; refresh(); }; });
}
function redrawAsk(id) {
  byId(id).then(o => { if (!o) return; const def = nextBiz(today(), 3);
    openModal('<h2>🔁 재인출</h2><p>' + esc(o.store) + ' · ' + money(o.amt) + '</p><div class="fg"><label>새 인출 예정일</label><input id="rdD" type="date" value="' + def + '"></div><div class="fg"><label>메모 (선택)</label><input id="rdN" placeholder="예: 고객이 15일에 다시 빼달라고 함"></div><div class="hint">같은 내용으로 새 건이 생기고(셋업 전), 원래 건은 반송으로 종결됩니다. Cash Pro 에 새 날짜로 다시 올려 주세요.</div><div class="btns"><button class="b-ghost" id="rX">취소</button><button class="b-blue" id="rOk">새 건 만들기</button></div>');
    $('rX').onclick = closeModal; $('rOk').onclick = async () => { const d = $('rdD').value, n = $('rdN').value.trim(); if (!d) return toast('날짜를 골라 주세요', 'bad'); closeModal(); busy(true);
      try { const id2 = newId('H'), now = new Date().toISOString(); await S.DB.set('ach', id2, Object.assign({}, o, { id: id2, drawOn: d, drawYm: ym(d), moved: false, setup: false, setupBy: '', setupAt: '', mail: '', st: '', open: true, done: false, doneOn: '', doneYm: '', doneAmt: 0, auto: false, codId: '', note: [n, '재인출(원래 ' + o.drawOn + ')'].filter(Boolean).join(' · '), redrawOf: o.id, createdBy: S.user.email, createdAt: now, updatedAt: now })); await S.DB.update('ach', o.id, { open: false, st: 'NSF', redrawTo: id2, updatedAt: now }); drop(); toast('재인출 건 생성 → ' + d + ' · [셋업 필요] 에 있습니다', 'good'); SEG = 'need'; }
      catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); refresh(); }; });
}
async function mailNotice(id) {
  const o = await byId(id); if (!o) return; const a = acctInfo(o.acct) || {};
  const to = a.achEm || '', cc = a.achRepEm || '';
  if (!to) { toast('고객 이메일이 없습니다 — 거래처 탭에서 넣어 주세요', 'bad'); return; }
  const subj = '[THE ONE] ACH Debit Notice — ' + money(o.amt) + ' on ' + o.drawOn + (o.inv ? ' (Inv ' + o.inv + ')' : '');
  const pretty = new Date(o.drawOn + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const body = 'Hello ' + o.store + ',\n\nThis is a courtesy reminder that the invoice below will be drafted from your bank account on file by ACH on ' + pretty + '.\n\n  Invoice #:     ' + o.inv + '\n  Invoice date:  ' + (o.invDate || '') + '\n  Terms:         ' + (o.terms || '') + '\n  Amount:        ' + money(o.amt) + '\n  Draft date:    ' + o.drawOn + '\n  Account:       ' + o.acct + '\n\nPlease make sure funds are available on that date. If anything looks wrong, reply to this email before the draft date.\n\n지정하신 은행 계좌에서 위 날짜에 자동 이체됩니다. 확인 부탁드립니다.\n\n— THE ONE Accounting\n';
  window.open('mailto:' + encodeURIComponent(to) + (cc ? '?cc=' + encodeURIComponent(cc) + '&' : '?') + 'subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body), '_self');
  if (await confirmBox('이메일 앱이 열렸습니다. 보냈으면 "보냄" 으로 표시할까요?\n→ ' + to, '보냈음 ✓')) { try { await S.DB.update('ach', o.id, { mail: today() + ' ' + S.user.email.split('@')[0], updatedAt: new Date().toISOString() }); drop(); refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } }
}
async function paintDone(box) {
  box.innerHTML = '<div class="load">읽는 중…</div>';
  const m0 = ym(today()), m1 = ym(addDays(today().substring(0, 7) + '-01', -1));
  let rows = []; try { rows = (await S.DB.list('ach', { where: [['doneYm', 'in', [m0, m1]]] })).filter(o => o.done && !o.void); } catch (e) { box.innerHTML = '<div class="none">' + esc(e.code || e.message) + '</div>'; return; }
  rows = applyFilter(sortBy(rows, o => o.doneOn + (o.updatedAt || ''), true));
  box.innerHTML = '<div class="card" style="padding:12px"><div class="hint" style="margin:0">ACH 는 Cash Pro 에 올려 두면 예정일에 그대로 빠지므로, <b>인출 예정일 + 3영업일</b>이 지나면 자동으로 완료되고 💳 COD·ACH 목록에 들어갑니다.<br>은행에서 <b>반송(NSF) 통지</b>가 오면 그 건만 되돌리세요.</div></div>' +
    (rows.length ? rows.map(o => '<div class="job set"><div class="t"><span class="st">' + esc(o.store) + '</span><span class="am">' + money(o.doneAmt || o.amt) + '</span></div><div class="m"><span>' + esc(o.inv) + '</span><span>완료 ' + esc(o.doneOn) + '</span>' + (o.auto ? '<span>자동</span>' : '') + (o.codId ? '<span>💳 COD·ACH 반영</span>' : '') + '</div><div class="acts"><button class="b-ghost b-sm" data-nsf="' + o.id + '">반송 (NSF) 로 되돌리기</button><button class="b-ghost b-sm" data-undo="' + o.id + '">↩ 완료 취소 (다시 대기)</button></div></div>').join('') : '<div class="none">최근 두 달 완료된 건이 없습니다</div>');
  box.querySelectorAll('[data-nsf]').forEach(b => b.onclick = () => nsfAsk(b.dataset.nsf));
  box.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => undoDone(b.dataset.undo));
}
/** 완료 되돌리기 — 잘못 자동 완료된 건을 다시 예약 상태로. COD·ACH 줄은 취소 */
async function undoDone(id) {
  const o = await byId(id); if (!o) return;
  if (!(await confirmBox(o.store + ' · ' + money(o.doneAmt || o.amt) + ' 의 완료를 취소할까요? 다시 [예약됨] 으로 돌아가고 💳 COD·ACH 의 그 줄은 취소됩니다.', '완료 취소'))) return;
  busy(true);
  try { if (o.codId) { try { await S.DB.update('cod', o.codId, { void: true, note: '완료 취소 ' + today() }); } catch (e) {} } await S.DB.update('ach', o.id, { done: false, open: true, st: '', doneOn: '', doneYm: '', doneAmt: 0, auto: false, codId: '', undoneAt: today(), updatedAt: new Date().toISOString() }); drop(); toast('완료를 취소했습니다 — [예약됨] 에 있습니다', 'good'); }
  catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
  busy(false); SEG = 'wait'; refresh();
}
/* ---- 상세 (Cash Pro 입력용) ---- */
async function detail(id) {
  openModal('<div class="load">읽는 중…</div>');
  const o = await byId(id); if (!o) { closeModal(); return toast('찾을 수 없습니다', 'bad'); }
  const a = acctInfo(o.acct) || {};
  let bank = null, bankErr = '';
  if (achOk()) { try { bank = await S.DB.get('achBank', o.acct); } catch (e) { bankErr = e.code || e.message; } }
  const f = (k, v, opt) => { opt = opt || {}; if (!v && !opt.always) return ''; return '<div class="fld"><span class="fk">' + k + '</span><span class="fv' + (opt.big ? ' big' : '') + '" id="fv-' + opt.id + '">' + esc(v) + '</span>' + (opt.copy ? '<button data-cp="' + opt.id + '">복사</button>' : '') + (opt.hide ? '<button data-rv="' + opt.id + '">보기</button>' : '') + '</div>'; };
  const mask = v => { v = String(v || ''); return v.length > 4 ? '•'.repeat(v.length - 4) + v.slice(-4) : v; };
  const bankH = !achOk() ? '<div class="fld" style="color:#92400e">🔒 은행 정보는 ACH 접근 권한이 있는 담당자만 볼 수 있습니다 (관리 → 사용자)</div>'
    : bank && bank.routing ? f('은행', bank.bank, { id: 'bank' }) + f('라우팅', bank.routing, { id: 'rt', copy: 1, big: 1 }) + f('계좌번호', mask(bank.acctNo), { id: 'an', copy: 1, big: 1, hide: 1 }) + f('종류', bank.acctType, { id: 'ty' })
    : '<div class="fld" style="color:#b91c1c;font-weight:700">⚠️ 은행 정보가 없습니다 — [거래처] 에서 Application 을 먼저 등록하세요' + (bankErr ? ' (' + esc(bankErr) + ')' : '') + '</div>';
  openModal('<h2 style="margin-bottom:2px">' + esc(o.store) + '</h2><div class="muted" style="margin-bottom:10px">' + esc(o.acct) + (o.sm ? ' · ' + esc(o.sm) : '') + (o.st ? ' · ' + (o.st === 'NSF' ? '반송' : o.st === 'done' ? '완료' : esc(o.st)) : '') + (o.setup ? ' · 셋업됨' : ' · 셋업 전') + '</div>' +
    '<div class="muted" style="font-size:12px;font-weight:700;margin:6px 0 2px">CASH PRO 에 넣을 것</div>' + bankH + f('인출 금액', money(o.amt), { id: 'amt', copy: 1, big: 1, always: 1 }) + f('인출 날짜', o.drawOn, { id: 'dr', copy: 1, big: 1, always: 1 }) + f('인보이스', o.inv, { id: 'iv', copy: 1 }) +
    ((o.lines || []).length > 1 ? '<div class="fld"><span class="fk">A/P/W</span><span class="fv" style="font-weight:400">' + o.lines.map(l => (l.t || '') + ' ' + esc(l.no) + ' ' + money(l.amt)).join('<br>') + '</span></div>' : '') +
    '<div class="muted" style="font-size:12px;font-weight:700;margin:14px 0 2px">참고</div>' + f('조건', o.terms, { id: 'tm' }) + f('인보이스일', o.invDate, { id: 'id2' }) + f('주소', [a.addr, a.city, a.state, a.zip].filter(Boolean).join(' '), { id: 'ad', copy: 1 }) + f('고객 메일', a.achEm, { id: 'em', copy: 1 }) + f('셋업 기록', o.setupBy, { id: 'sb' }) + f('안내 발송', o.mail, { id: 'ml' }) + f('메모', o.note, { id: 'nt' }) +
    '<div class="btns" style="margin-top:14px">' + (o.open ? (o.setup ? '<button class="b-ghost" id="dSet">셋업 취소</button>' : '<button class="b-blue" id="dSet">Cash Pro 셋업 ☑</button>') + '<button class="b-ghost" id="dMail">📧</button><button class="b-ghost" id="dHold">' + (o.st === 'HOLD' ? '▶ 보류 해제' : '⏸ 보류') + '</button>' : '') + '<button class="b-ghost" id="dClose">닫기</button></div>');
  const copy = t => { try { navigator.clipboard.writeText(t); } catch (e) {} };
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => { const k = b.dataset.cp; let t = $('fv-' + k).textContent; if (k === 'an' && bank) t = bank.acctNo; if (k === 'amt') t = String(o.amt); copy(t); b.textContent = '복사됨'; setTimeout(() => { b.textContent = '복사'; }, 1400); });
  document.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { const el = $('fv-an'); if (b.textContent === '보기') { el.textContent = bank.acctNo; b.textContent = '가리기'; } else { el.textContent = mask(bank.acctNo); b.textContent = '보기'; } });
  if ($('dSet')) $('dSet').onclick = () => { closeModal(); setSetup([o.id], !o.setup); };
  if ($('dMail')) $('dMail').onclick = () => { closeModal(); mailNotice(o.id); };
  if ($('dHold')) $('dHold').onclick = async () => { closeModal(); const on = o.st !== 'HOLD'; if (on && !(await confirmBox(o.store + ' 을 보류할까요? 보류 중에는 자동 완료 · 지연 표시에서 빠집니다 (Cash Pro 에서도 빼 주세요).', '보류'))) return; await S.DB.update('ach', o.id, { st: on ? 'HOLD' : '', holdOn: on ? today() : '', updatedAt: new Date().toISOString() }); drop(); toast(on ? '보류했습니다' : '보류를 풀었습니다'); refresh(); };
  $('dClose').onclick = closeModal;
}

/* ============================================================
 *  ③ 거래처 — ACH 등록 (Application)
 * ============================================================ */
let REG_BACK = '';
async function paintAccts() {
  const list = AQ ? searchAccounts(S.accounts, AQ, 60) : sortStores(S.accounts.filter(a => a.ach)).slice(0, 80);
  const pre = REG_BACK ? acctInfo(REG_BACK) : null;
  let h = '<div class="card"><h2>ACH 거래처 <span class="en">ACH accounts</span></h2><input id="acq" placeholder="계정코드 또는 가게 이름" value="' + esc(AQ) + '" autocomplete="off">' +
    (list.length ? list.map(a => '<div class="pr tap" data-ah="' + esc(a.acct) + '"><div class="ct"><b>' + esc(a.store) + '</b><small>' + esc(a.acct) + (a.sm ? ' · ' + esc(a.sm) : '') + (a.achBank ? ' · ' + esc(a.achBank) + (a.achLast4 ? ' ••' + esc(a.achLast4) : '') : '') + '</small></div>' + achTag(a) + '</div>').join('') + '<div class="hint">가게를 누르면 ACH 이력 (인출 · 반송 · 미인출) 이 나옵니다</div>' : '<div class="none">' + (AQ ? '없습니다 — 아래에서 등록하세요' : 'ACH 등록된 거래처가 아직 없습니다') + '</div>') + '</div>';
  h += '<div class="card"><h2>' + (pre ? '🏦 ' + esc(pre.store) + ' 은행 정보 등록' : '신규 거래처 ACH 등록 (Application)') + '</h2>' + (achOk() ? '' : '<div class="alert a-amb">🔒 은행 정보(라우팅 · 계좌번호) 저장은 ACH 접근 권한이 있는 담당자만 할 수 있습니다. 이메일 · 조건만 저장됩니다.</div>') +
    '<div class="two"><div class="fg"><label>계정코드 *</label><input id="nAcct" inputmode="numeric" value="' + esc(pre ? pre.acct : (/^\d+$/.test(AQ) ? AQ : '')) + '" ' + (pre ? 'readonly' : '') + '></div><div class="fg"><label>가게 이름 *</label><input id="nStore" value="' + esc(pre ? pre.store : (/^\d+$/.test(AQ) ? '' : AQ.toUpperCase())) + '" style="text-transform:uppercase"></div></div>' +
    '<div class="fg"><label>은행 이름</label><input id="nBank" placeholder="BANK OF AMERICA" style="text-transform:uppercase"></div>' +
    '<div class="two"><div class="fg"><label>라우팅 번호 *</label><input id="nRt" inputmode="numeric" maxlength="9" autocomplete="off"></div><div class="fg"><label>계좌번호 *</label><input id="nAn" inputmode="numeric" autocomplete="off"></div></div><div class="hint" id="rtMsg" style="margin-top:-6px"></div>' +
    '<div class="two"><div class="fg"><label>계좌 종류</label>' + sel('nType', ['CHECKING', 'SAVINGS'], 'CHECKING') + '</div><div class="fg"><label>기본 조건</label>' + sel('nTerms', TERMS(), pre && pre.terms && /ACH/i.test(pre.terms) ? pre.terms : 'ACH 30') + '</div></div>' +
    '<div class="fg"><label>고객 이메일 * <span class="en">(안내 메일용)</span></label><input id="nEm" type="email" value="' + esc(pre ? pre.achEm || pre.email || '' : '') + '"></div>' +
    '<div class="two"><div class="fg"><label>담당자 이메일</label><input id="nRep" type="email" value="' + esc(pre ? pre.achRepEm || '' : '') + '"></div><div class="fg"><label>세일즈맨</label><input id="nSm" value="' + esc(pre ? pre.sm || '' : '') + '" style="text-transform:uppercase"></div></div>' +
    '<label class="muted" style="display:flex;gap:8px;align-items:center;margin:4px 0 12px"><input type="checkbox" id="nApp" checked style="width:20px;height:20px"> Application 받았음 (서류는 사무실 보관)</label>' +
    '<button class="b-blue" id="nSave">거래처 ACH 등록 · Register</button></div>';
  $('achBody').innerHTML = h;
  $('acq').oninput = () => { AQ = $('acq').value; REG_BACK = ''; paintAccts(); setTimeout(() => { const q = $('acq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 0); };
  document.querySelectorAll('[data-ah]').forEach(el => el.onclick = () => acctHist(el.dataset.ah, (acctInfo(el.dataset.ah) || {}).store));
  $('nRt').oninput = () => { const v = $('nRt').value.replace(/[^0-9]/g, ''); $('nRt').value = v; const m = $('rtMsg'); if (v.length < 9) { m.textContent = v ? (9 - v.length) + '자리 남음' : ''; m.style.color = ''; return; } const ok = rtValid(v); m.textContent = ok ? '✓ 라우팅 번호 맞습니다' : '❌ 번호가 맞지 않습니다 — Application 을 다시 확인하세요'; m.style.color = ok ? '#15803d' : '#b91c1c'; };
  $('nSave').onclick = saveAcct;
  if (pre) setTimeout(() => $('nBank').focus(), 0);
}
function rtValid(v) { if (!/^\d{9}$/.test(v) || /^0{9}$/.test(v)) return false; const p = Number(v.substring(0, 2)); if (!((p >= 0 && p <= 12) || (p >= 21 && p <= 32) || (p >= 61 && p <= 72) || p === 80)) return false; const d = v.split('').map(Number); return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0; }
async function saveAcct() {
  const acct = pad4($('nAcct').value.trim()), store = $('nStore').value.trim().toUpperCase(), bank = $('nBank').value.trim().toUpperCase(), rt = $('nRt').value.trim(), an = $('nAn').value.trim(), em = $('nEm').value.trim(), rep = $('nRep').value.trim(), sm = $('nSm').value.trim().toUpperCase(), terms = $('nTerms').value;
  if (!acct || !store) return toast('계정코드와 가게 이름을 넣어 주세요', 'bad');
  if (!em) return toast('고객 이메일을 넣어 주세요 (안내 메일용)', 'bad');
  const withBank = achOk() && (rt || an);
  if (withBank && !rtValid(rt)) return toast('라우팅 번호가 맞지 않습니다', 'bad');
  if (withBank && !/^\d{4,17}$/.test(an)) return toast('계좌번호를 확인하세요', 'bad');
  const exists = acctInfo(acct);
  if (!(await confirmBox((exists ? exists.store + ' (' + acct + ')' : store + ' (' + acct + ') — 거래처 목록에도 새로 만듭니다') + '\nACH 거래처로 등록할까요?' + (withBank ? '\n은행 ' + bank + ' · 라우팅 ' + rt + ' · 계좌 ••' + an.slice(-4) : '\n(은행 정보 없이 — 이메일 · 조건만)'), '등록'))) return;
  busy(true);
  try {
    const now = new Date().toISOString();
    if (withBank) await S.DB.set('achBank', acct, { acct, store, bank, routing: rt, acctNo: an, acctType: $('nType').value, terms, custEm: em, repEm: rep, sm, app: $('nApp').checked, by: S.user.email, updatedAt: now });
    const patch = Object.assign({}, exists || { acct, store, addr: '', city: '', state: '', zip: '', tel: '', note: '', createdAt: now }, { store: exists ? exists.store : store, sm: sm || (exists && exists.sm) || '', terms: terms, ach: true, achReady: !!withBank || !!(exists && exists.achReady), achCashPro: !!(exists && exists.achCashPro), achBank: withBank ? bank : (exists && exists.achBank) || '', achLast4: withBank ? an.slice(-4) : (exists && exists.achLast4) || '', achEm: em, achRepEm: rep, achApp: $('nApp').checked, achAt: now, updatedAt: now });
    Object.keys(patch).forEach(k => { if (k === 'id' || k[0] === '_') delete patch[k]; });
    await S.DB.set('accounts', acct, patch);
    const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer();
    toast('등록했습니다 · ' + acct + ' ' + store + (withBank ? ' — Cash Pro 등록 후 ☑ 해 주세요' : ''), 'good');
    const back = REG_BACK; REG_BACK = ''; AQ = '';
    if (back) { pickAcct(back); Router.go('ach', 'new'); } else paintAccts();
  } catch (e) { toast('등록 실패: ' + (e.code || e.message), 'bad'); }
  busy(false);
}
async function acctHist(code, name) {
  openModal('<div class="load">읽는 중…</div>');
  let rows = []; try { rows = (await S.DB.list('ach', { where: [['acct', '==', code]] })).filter(o => !o.void); } catch (e) { closeModal(); return toast('실패: ' + (e.code || e.message), 'bad'); }
  rows = sortBy(rows, o => o.drawOn || '', true);
  const open = rows.filter(o => o.open), d90 = rows.filter(o => o.done && daysBetween(o.doneOn, today()) <= 90), nsf = rows.filter(o => o.st === 'NSF' || o.nsfOn).length, last = rows.filter(o => o.done).map(o => o.doneOn).sort().pop();
  const a = acctInfo(code) || {};
  openModal('<h2 style="margin:0 0 2px">' + esc(name || code) + ' <span class="muted" style="font-weight:400">' + esc(code) + '</span></h2><div class="muted">' + achTag(a) + (a.achBank ? ' · ' + esc(a.achBank) + (a.achLast4 ? ' ••' + esc(a.achLast4) : '') : '') + (a.achEm ? ' · ' + esc(a.achEm) : '') + '</div>' +
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr);margin:10px 0"><div><b>' + money(sum(open, o => o.amt)) + '</b><span>미인출 ' + open.length + '건</span></div><div><b>' + money(sum(d90, o => o.doneAmt || o.amt)) + '</b><span>90일 인출 ' + d90.length + '건</span></div><div><b style="color:' + (nsf ? '#b91c1c' : 'inherit') + '">' + nsf + '회</b><span>반송</span></div></div>' + (last ? '<div class="hint" style="margin:0 0 6px">마지막 인출 ' + esc(last) + '</div>' : '') +
    (rows.length ? rows.slice(0, 40).map(o => { const st = o.st === 'NSF' ? '<span class="tag t-r">반송</span>' : o.done ? '<span class="tag t-g">완료 ' + esc((o.doneOn || '').substring(5)) + '</span>' : o.setup ? '<span class="tag t-b">예약 ' + esc((o.drawOn || '').substring(5)) + '</span>' : '<span class="tag t-c">셋업 전 ' + esc((o.drawOn || '').substring(5)) + '</span>'; return '<div class="pr tap" data-det="' + o.id + '"><div class="ct"><b>' + esc(o.inv) + '</b><small>' + esc(o.terms || '') + ' · 인보이스일 ' + esc(o.invDate || '') + '</small></div>' + st + '<div class="pa"><b>' + money(o.amt) + '</b></div></div>'; }).join('') : '<div class="none">ACH 기록이 없습니다</div>') +
    (a.ach && a.achReady ? '<label class="cashkeep"><input type="checkbox" id="hCp" ' + (a.achCashPro ? 'checked' : '') + '> <span><b>BoA Cash Pro 에 이 거래처 등록했음</b> ☑ — 둘 다 되면 "ACH 준비됨"</span></label>' : '') +
    '<div class="btns"><button class="b-ghost" id="hX">닫기</button>' + (a.ach ? '<button class="b-blue" id="hNew">＋ 이 가게 ACH 입력</button>' : '') + '</div>');
  if ($('hCp')) $('hCp').onchange = async () => { const on = $('hCp').checked; try { await S.DB.update('accounts', code, { achCashPro: on, achCashProAt: on ? today() : '' }); const { bumpAccountsVer } = await import('./mgr.js'); await bumpAccountsVer(); toast(on ? 'Cash Pro 등록 ✓ — ACH 준비됨' : 'Cash Pro 등록 해제'); } catch (e) { toast('실패: ' + e.message, 'bad'); } closeModal(); if (TAB === 'acct') paintAccts(); };
  $('hX').onclick = closeModal; if ($('hNew')) $('hNew').onclick = () => { closeModal(); resetF(); pickAcct(code); Router.go('ach', 'new'); };
  document.querySelectorAll('#mbox [data-det]').forEach(el => el.onclick = () => detail(el.dataset.det));
}

/* ============================================================
 *  ④ 달력
 * ============================================================ */
async function paintCal() {
  const [Y, M] = CAL.ym.split('-').map(Number);
  const prevYm = ym(addDays(CAL.ym + '-01', -1)), nextYm = ym(addDays(new Date(Y, M, 1).toISOString().substring(0, 10), 0));
  let rows = []; try { rows = (await S.DB.list('ach', { where: [['drawYm', '==', CAL.ym]] })).filter(o => !o.void); } catch (e) {}
  const by = groupBy(rows, o => o.drawOn);
  const first = new Date(Y, M - 1, 1), dow = first.getDay(), days = new Date(Y, M, 0).getDate(), H = holidays();
  let cells = ''; for (let i = 0; i < dow; i++) cells += '<div class="cd off"></div>';
  for (let d = 1; d <= days; d++) { const k = CAL.ym + '-' + String(d).padStart(2, '0'), L = by[k] || [], w = new Date(Y, M - 1, d).getDay(); const dots = ['done', 'set', 'need', 'nsf'].map(c => { const n = L.filter(o => c === 'done' ? o.done : c === 'nsf' ? o.st === 'NSF' : c === 'set' ? (o.setup && o.open) : (!o.setup && o.open && o.st !== 'NSF')).length; return n ? '<i class="c-' + c + '">' + n + '</i>' : ''; }).join('');
    cells += '<div class="cd' + (k === today() ? ' today' : '') + (w === 0 || w === 6 || H[k] ? ' wk' : '') + (CAL.day === k ? ' on' : '') + '" data-cday="' + k + '"><b>' + d + '</b>' + (L.length ? '<small>' + money(sum(L, o => o.amt)).replace('.00', '') + '</small><div class="dots">' + dots + '</div>' : '') + '</div>'; }
  const openSum = sum(rows.filter(o => o.open), o => o.amt), doneSum = sum(rows.filter(o => o.done), o => o.doneAmt || o.amt);
  $('achBody').innerHTML = '<div class="card"><div class="calhd"><button data-cm="' + prevYm + '">‹</button><h2 style="margin:0;flex:1;text-align:center">' + Y + '년 ' + M + '월</h2><button data-cm="' + nextYm + '">›</button><button class="b-ghost b-sm" data-cm="' + ym(today()) + '">오늘</button></div><div class="hint" style="text-align:center">' + rows.length + '건 · 예정 ' + money(openSum) + ' · 인출됨 ' + money(doneSum) + '</div>' +
    '<div class="calg"><div class="ch">일</div><div class="ch">월</div><div class="ch">화</div><div class="ch">수</div><div class="ch">목</div><div class="ch">금</div><div class="ch">토</div>' + cells + '</div><div class="calleg"><span><i class="c-done"></i>인출됨</span><span><i class="c-set"></i>예약됨</span><span><i class="c-need"></i>셋업 전</span><span><i class="c-nsf"></i>반송</span></div></div><div class="card" id="calDay"><div class="none">날짜를 누르면 그날 인출 목록이 나옵니다</div></div>';
  document.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => { CAL.ym = b.dataset.cm; CAL.day = ''; paintCal(); });
  document.querySelectorAll('[data-cday]').forEach(c => c.onclick = () => { CAL.day = c.dataset.cday; document.querySelectorAll('.cd').forEach(x => x.classList.toggle('on', x.dataset.cday === CAL.day)); calDay(by[CAL.day] || []); });
  if (CAL.day && CAL.day.startsWith(CAL.ym)) calDay(by[CAL.day] || []);
}
function calDay(L) {
  const box = $('calDay'); const need = L.filter(o => !o.setup && o.open && o.st !== 'NSF');
  box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><h2 style="margin:0">' + esc(CAL.day) + ' · ' + L.length + '건 · ' + money(sum(L, o => o.amt)) + '</h2>' + (need.length ? '<button class="b-blue b-sm" id="cSetAll">전부 셋업 ☑ (' + need.length + ')</button>' : '') + '</div>' + (L.length ? sortBy(L, o => o.store).map(o => jobCard(o)).join('') : '<div class="none">이 날 인출 건이 없습니다</div>');
  bindJobs(box); if ($('cSetAll')) $('cSetAll').onclick = async () => { if (!(await confirmBox(CAL.day + ' 인출 ' + need.length + '건을 전부 Cash Pro 셋업 ☑ 할까요?', '전부 셋업'))) return; setSetup(need.map(o => o.id), true); };
}

/* ============================================================
 *  ⑤ 현황
 * ============================================================ */
async function paintStats() {
  const rows = await openRows(true), t = today();
  const wkEnd = addDays(t, 7), m0 = ym(t);
  let doneM = []; try { doneM = (await S.DB.list('ach', { where: [['doneYm', '==', m0]] })).filter(o => o.done && !o.void); } catch (e) {}
  const g = { late: rows.filter(o => bucket(o) === 'late'), need: rows.filter(o => bucket(o) === 'need'), soon: rows.filter(isSoon), week: rows.filter(o => o.open && o.st !== 'NSF' && o.drawOn >= t && o.drawOn <= wkEnd), nsf: rows.filter(o => o.st === 'NSF'), hold: rows.filter(o => o.st === 'HOLD'), mail: rows.filter(mailDue), newApp: rows.filter(o => { const a = acctInfo(o.acct); return !a || !a.ach; }) };
  const audit = auditRows(rows);
  const st = (cls, k, L, amtF) => '<div class="stat ' + cls + '"><div class="k">' + k + '</div><div class="n">' + L.length + '</div><div class="a">' + money(sum(L, amtF || (o => o.amt))) + '</div></div>';
  $('achBody').innerHTML = '<div class="stats">' + st('red', '지연 (인출일 지남)', g.late) + st('amber', '셋업 필요', g.need) + st('blue', '오늘·내일 인출', g.soon) + st('', '이번 주 인출 예정', g.week) + st('red', '반송 (NSF)', g.nsf) + st('amber', '📧 안내 메일 보낼 때', g.mail) + st('amber', '신규 · Application 필요', g.newApp) + (g.hold.length ? st('', '⏸ 보류', g.hold) : '') + st('green', '이번 달 들어온 돈', doneM, o => o.doneAmt || o.amt) + st('green', '이번 달 자동 완료', doneM.filter(o => o.auto), o => o.doneAmt || o.amt) + '</div>' +
    '<div class="card"><h2>🔎 입력 점검 <span class="en">Audit</span> <span class="muted" style="font-weight:400">— 실수 · 빠진 것</span></h2>' + (audit.length ? audit.slice(0, 40).map(x => '<div class="pr tap" data-det="' + x.id + '"><div class="mk" style="background:' + (x.sev === 'E' ? '#fee2e2;color:#991b1b' : '#fef9c3;color:#713f12') + '">' + (x.sev === 'E' ? '❌' : '⚠️') + '</div><div class="ct"><b>' + esc(x.store) + ' <span class="muted">' + esc(x.inv) + '</span></b><small>' + esc(x.what) + ' — ' + esc(x.how) + '</small></div></div>').join('') + (audit.length > 40 ? '<div class="hint">외 ' + (audit.length - 40) + '건</div>' : '') : '<div class="alert a-grn">문제를 찾지 못했습니다 👍</div>') + '</div>' +
    '<div class="card"><h2>이번 주 인출 예정 <span class="en">This week</span></h2>' + (g.week.length ? Object.entries(groupBy(g.week, o => o.drawOn)).sort().map(([d, L]) => '<div class="dayhd"><span>📅 ' + d + ' · ' + L.length + '건 · ' + money(sum(L, o => o.amt)) + '</span></div>' + L.map(o => '<div class="pr tap" data-det="' + o.id + '"><div class="ct"><b>' + esc(o.store) + '</b><small>' + esc(o.inv) + (o.sm ? ' · ' + esc(o.sm) : '') + '</small></div>' + (o.setup ? '<span class="tag t-b">예약</span>' : '<span class="tag t-c">셋업 전</span>') + '<div class="pa"><b>' + money(o.amt) + '</b></div></div>').join('')).join('') : '<div class="none">없습니다</div>') + '</div>' +
    '<div class="card"><h2>최근 인출 완료 <span class="en">Recently drawn</span> <span class="muted" style="font-weight:400">— 반송 통지가 오면 되돌리세요</span></h2>' + (doneM.length ? sortBy(doneM, o => o.doneOn, true).slice(0, 15).map(o => '<div class="pr"><div class="ct"><b>' + esc(o.store) + '</b><small>' + esc(o.inv) + ' · 완료 ' + esc(o.doneOn) + (o.auto ? ' · 자동' : '') + '</small></div><div class="pa"><b>' + money(o.doneAmt || o.amt) + '</b></div><button class="b-ghost b-sm" data-nsf="' + o.id + '">반송</button></div>').join('') : '<div class="none">이번 달 완료 건이 없습니다</div>') + '</div>';
  document.querySelectorAll('[data-det]').forEach(el => el.onclick = () => detail(el.dataset.det));
  document.querySelectorAll('[data-nsf]').forEach(b => b.onclick = () => nsfAsk(b.dataset.nsf));
}

/* ---- 🔎 입력 점검 — 옛 ACH 앱 auditFindings_ 의 목록 규칙 (설정: achBigAmt 기본 20000) ---- */
function auditRows(rows) {
  const out = [], t = today(), big = Number(S.settings.achBigAmt) || 20000, seen = {};
  const add = (o, sev, what, how) => out.push({ id: o.id, store: o.store || o.acct, inv: o.inv, sev, what, how });
  rows.forEach(o => {
    if (o.void) return;
    const a = acctInfo(o.acct);
    if (!a || !a.ach) add(o, 'E', '거래처에 ACH 등록이 없습니다 (은행 정보 없음)', 'Application 을 받아 거래처 탭에 먼저 등록하세요');
    else if (!a.achEm) add(o, 'W', '고객 이메일이 없습니다', '안내 메일이 안 나갑니다 — 거래처 탭에서 넣어 주세요');
    else if (a.achReady && !a.achCashPro && o.setup) add(o, 'W', 'Cash Pro 에 거래처 등록 ☑ 가 없는데 건은 셋업됐습니다', '거래처 이력에서 Cash Pro 등록 ☑ 을 확인하세요');
    if (o.amt >= big) add(o, 'W', '금액이 ' + money(o.amt) + ' 입니다 — 오타인지 확인', '맞으면 그냥 두셔도 됩니다');
    if (o.drawOn && !isBizDay(o.drawOn)) add(o, 'W', '인출 예정일 ' + o.drawOn + ' 이 주말/휴일입니다', '은행이 쉬는 날은 돈이 안 빠집니다 — 다음 영업일로');
    if (o.drawOn && o.invDate && o.drawOn < o.invDate) add(o, 'E', '인출 예정일이 인보이스 날짜보다 빠릅니다', '날짜를 다시 확인해 주세요');
    if (o.invDate && o.invDate > t) add(o, 'W', '인보이스 날짜가 미래입니다 (' + o.invDate + ')', '날짜 오타인지 확인해 주세요');
    if (o.invDate && o.createdAt && daysBetween(o.invDate, o.createdAt.substring(0, 10)) >= 7) add(o, 'W', '인보이스 날짜보다 ' + daysBetween(o.invDate, o.createdAt.substring(0, 10)) + '일 늦게 입력됐습니다', '늦게 넣으면 인출일을 놓칠 수 있습니다');
    if (o.invDate && daysBetween(o.invDate, t) > 180 && o.open) add(o, 'W', '인보이스 날짜가 ' + daysBetween(o.invDate, t) + '일 전인데 아직 안 끝났습니다', '실제로 받았는지 확인해 주세요');
    if (o.drawOn && o.drawOn < t && !o.setup && o.st !== 'NSF' && o.st !== 'HOLD') add(o, 'E', '인출일 ' + o.drawOn + ' 이 지났는데 Cash Pro 셋업 표시가 없습니다', '실제로 올렸으면 ☑, 안 올렸으면 지금 올려야 합니다');
    (o.lines || []).forEach(l => { const k = String(l.no).toUpperCase(); if (seen[k] && seen[k] !== o.id) add(o, 'E', '인보이스 ' + l.no + ' 가 다른 건에도 있습니다 (중복 입력)', '두 번 빠져나가면 손님이 화를 냅니다 — 한 건은 취소하세요'); else seen[k] = o.id; });
  });
  return out.sort((a, b) => a.sev === b.sev ? 0 : a.sev === 'E' ? -1 : 1);
}
