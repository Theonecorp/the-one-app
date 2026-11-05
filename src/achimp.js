/* ============================================================
 *  🏦 ACH 시트 가져오기 — 옛 "The One ACH" 구글 시트(엑셀로 받은 것)의 두 탭
 *    'ACH 목록'   → ach/{id}  (셋업 ☑ · 인출 완료 ☑ · 상태 · 계정코드 · 인보이스 # · 날짜 · 금액 · A/P/W · 조건 · 인출 예정일 · 세일즈맨 · 셋업 기록 · 실제 인출일 · 실제 금액 · 안내 발송 · 커미션 정산 · 메모 · ID)
 *    'ACH 거래처' → achBank/{계정코드} (은행 · 라우팅 · 계좌) + accounts/{계정코드} 의 ACH 표시(ach · achReady · achCashPro · achBank · achLast4 · achEm · achRepEm · achTerms)
 *  규칙: 문서를 통째로 바꾸지 않음(merge) · 앱에서 이미 셋업 ☑ · 인출 완료 ☑ · 취소한 건은 파일이 되돌리지 않음 · 같은 ID 를 다시 올려도 두 번 들어가지 않음
 * ============================================================ */
import { $, esc, money, num, R2, pad4, ym, sum } from './ui.js';
import { invNo } from './ui.js';
import { invType } from './comm.js';
import { bumpAccountsVer } from './mgr.js';

const str = v => String(v == null ? '' : v).trim();
const tv = v => v === true || /^(true|y|yes|☑|✓|1)$/i.test(str(v));
export function dstr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return ''; return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().substring(0, 10); }
  const s = str(v); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
  return '';
}
const hdrIdx = (row, names) => { const idx = {}; row = (row || []).map(x => str(x).toLowerCase()); Object.keys(names).forEach(k => { idx[k] = row.findIndex(h => names[k].test(h)); }); return idx; };
/** 조건 글자 → 앱 조건 ('ACH 30' …, '직접 입력 · Manual' → 'Manual') */
const termsOf = v => { const s = str(v); if (/manual|직접/i.test(s)) return 'Manual'; const m = s.match(/(\d{1,3})/); return m ? 'ACH ' + m[1] : s; };
/** 상태 글자 → ach 문서의 st · void */
const stOf = v => { const s = str(v); if (/nsf|반송/i.test(s)) return { st: 'NSF' }; if (/hold|홀드|보류/i.test(s)) return { st: 'HOLD' }; if (/취소|void|cancel/i.test(s)) return { st: '', void: true }; return { st: '' }; };

/** 'ACH 목록' 표 → ach 문서들 */
export function parseAchList(aoa) {
  if (!aoa || aoa.length < 2) return { list: [], skipped: 0 };
  const H = hdrIdx(aoa[0], { setup: /cash\s*pro\s*셋업|^셋업/, done: /인출\s*완료/, st: /^상태/, at: /^입력일/, acct: /계정코드/, store: /가게\s*이름/, inv: /^인보이스\s*#/, invD: /인보이스\s*날짜/, amt: /^금액/, invA: /^a\s*인보이스/, amtA: /^a\s*금액/, invP: /^p\s*인보이스/, amtP: /^p\s*금액/, invW: /^w\s*인보이스/, amtW: /^w\s*금액/, terms: /^조건/, draw: /인출\s*예정일/, sm: /세일즈맨/, setupLog: /셋업\s*기록/, doneOn: /실제\s*인출일/, doneAmt: /실제\s*금액/, mail: /안내\s*발송/, comm: /커미션\s*정산/, note: /^메모/, id: /^id$/ });
  if (H.acct < 0 || H.inv < 0 || H.amt < 0) throw new Error("'ACH 목록' 머리글(계정코드 · 인보이스 # · 금액)을 찾지 못했습니다");
  const v = (r, k) => H[k] < 0 ? '' : r[H[k]];
  const list = [], seen = {}; let skipped = 0;
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] || []; const acct = pad4(v(r, 'acct')), invRaw = str(v(r, 'inv')); if (!acct && !invRaw) continue;
    if (!acct) { skipped++; continue; }
    const amt = R2(num(v(r, 'amt')));
    const lines = []; ['A', 'P', 'W'].forEach(t => { const no = invNo(v(r, 'inv' + t)), a = R2(num(v(r, 'amt' + t))); if (no) no.split(/[\s,&]+/).filter(Boolean).forEach((x, j) => lines.push({ no: invNo(x), t, amt: j === 0 ? a : 0 })); });
    if (!lines.length) invRaw.split(/[\s,&]+/).filter(Boolean).forEach((x, j) => lines.push({ no: invNo(x), t: invType(x), amt: j === 0 ? amt : 0 }));
    const drawOn = dstr(v(r, 'draw')), invDate = dstr(v(r, 'invD')), terms = termsOf(v(r, 'terms')), done = tv(v(r, 'done')), setup = tv(v(r, 'setup')) || done, S_ = stOf(v(r, 'st'));
    let id = str(v(r, 'id')); id = id ? 'SH-' + id : 'SH-' + acct + '-' + lines.map(l => l.no).join('+') + '-' + (invDate || drawOn);
    if (seen[id]) { skipped++; continue; } seen[id] = 1;
    const log = str(v(r, 'setupLog')), lm = log.match(/^([^\s·]+@[^\s·]+)/), doneOn = dstr(v(r, 'doneOn')) || (done ? drawOn : ''), comm = v(r, 'comm');
    list.push({ id, acct, store: str(v(r, 'store')), sm: str(v(r, 'sm')).toUpperCase(), lines, inv: lines.map(l => l.no).join(', '), amt, invDate, terms, drawOn, drawYm: drawOn ? ym(drawOn) : '', moved: false, fixed: terms === 'Manual',
      setup, setupBy: lm ? lm[1] : (setup ? 'sheet' : ''), setupAt: setup ? (dstr(log.split('·').pop()) || '') : '', mail: str(v(r, 'mail')) ? 'sheet' : '', st: S_.st, open: !done && !S_.void, done, doneOn, doneYm: doneOn ? ym(doneOn) : '', doneAmt: done ? (R2(num(v(r, 'doneAmt'))) || amt) : 0,
      auto: false, codId: '', note: str(v(r, 'note')), void: !!S_.void, settled: comm ? 'sheet:' + (dstr(comm) || str(comm)) : '', src: 'sheet', createdBy: 'sheet', createdAt: dstr(v(r, 'at')) || '' });
  }
  return { list, skipped };
}
/** 'ACH 거래처' 표 → achBank 문서 + accounts 표시 */
export function parseAchAccounts(aoa) {
  if (!aoa || aoa.length < 2) return { list: [] };
  const H = hdrIdx(aoa[0], { app: /^application/, cp: /cash\s*pro/, acct: /계정코드/, store: /가게\s*이름/, bank: /은행\s*이름/, routing: /라우팅|routing/, acctNo: /계좌번호|account\s*#/, type: /계좌\s*종류/, last4: /끝\s*4/, terms: /기본\s*조건/, st: /^상태/, em: /고객\s*이메일/, rep: /담당자\s*이메일/, sm: /세일즈맨/, appOn: /application\s*받은/, limit: /한도/, note: /^메모/ });
  if (H.acct < 0) throw new Error("'ACH 거래처' 머리글(계정코드)을 찾지 못했습니다");
  const v = (r, k) => H[k] < 0 ? '' : r[H[k]];
  const list = [], seen = {};
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] || []; const acct = pad4(v(r, 'acct')); if (!acct || seen[acct]) continue; seen[acct] = 1;
    const routing = str(v(r, 'routing')).replace(/\D/g, ''), acctNo = str(v(r, 'acctNo')).replace(/\s/g, ''), st = str(v(r, 'st'));
    list.push({ acct, store: str(v(r, 'store')), bank: str(v(r, 'bank')), routing, acctNo, acctType: str(v(r, 'type')), last4: str(v(r, 'last4')) || acctNo.slice(-4), terms: termsOf(v(r, 'terms')), app: tv(v(r, 'app')) || /승인|approved/i.test(st), cashPro: tv(v(r, 'cp')), custEm: str(v(r, 'em')).toLowerCase(), repEm: str(v(r, 'rep')).toLowerCase(), sm: str(v(r, 'sm')).toUpperCase(), appOn: dstr(v(r, 'appOn')), limit: num(v(r, 'limit')) || '', note: str(v(r, 'note')) });
  }
  return { list };
}
/** 파일 하나로 둘 다 — 있는 탭만 */
export async function achBookFile(S, file, out, readBook, aoa) {
  out.innerHTML = '<div class="muted">읽는 중…</div>';
  try {
    const { XLSX, wb } = await readBook(file);
    const L = wb.SheetNames.includes('ACH 목록') ? parseAchList(aoa(XLSX, wb, 'ACH 목록')) : { list: [], skipped: 0 };
    const A = wb.SheetNames.includes('ACH 거래처') ? parseAchAccounts(aoa(XLSX, wb, 'ACH 거래처')) : { list: [] };
    if (!L.list.length && !A.list.length) throw new Error("'ACH 목록' · 'ACH 거래처' 탭이 없거나 비어 있습니다");
    const now = new Date().toISOString(), ops = []; let nNew = 0, nKeep = 0, nAcct = 0, nBank = 0, noAcct = [];
    /* ① ACH 건 — 있는 것은 적은 칸만, 앱에서 한 ☑ · 취소는 그대로 */
    const old = {}; if (L.list.length) (await S.DB.list('ach')).forEach(x => { old[x.id] = x; });
    L.list.forEach(d => { const o = old[d.id]; const data = Object.assign({}, d, { updatedAt: now }); if (!data.createdAt) data.createdAt = now;
      if (o) { ['setup', 'setupBy', 'setupAt', 'done', 'doneOn', 'doneYm', 'doneAmt', 'void', 'mail', 'codId', 'settled', 'settledAt', 'st', 'nsfOn', 'createdAt', 'createdBy', 'auto'].forEach(k => { if (o[k]) delete data[k]; }); if (o.done || o.void) delete data.open; nKeep++; } else nNew++;
      if (!S.accounts.byCode[d.acct]) noAcct.push(d.acct);
      ops.push({ op: o ? 'merge' : 'set', col: 'ach', id: d.id, data }); });
    /* ② 거래처 — 은행 정보는 achBank 에, 표시는 accounts 에 (적은 칸만 · 앱에서 ☑ 한 것은 되돌리지 않음) */
    A.list.forEach(a => { const ex = S.accounts.byCode[a.acct]; if (!ex) { noAcct.push(a.acct); return; }
      const withBank = !!(a.routing && a.acctNo);
      if (withBank) { ops.push({ op: 'merge', col: 'achBank', id: a.acct, data: { acct: a.acct, store: ex.store || a.store, bank: a.bank, routing: a.routing, acctNo: a.acctNo, acctType: a.acctType, terms: a.terms, custEm: a.custEm, repEm: a.repEm, sm: a.sm || ex.sm || '', app: a.app, by: 'sheet', updatedAt: now } }); nBank++; }
      const patch = { ach: a.app || !!ex.ach, achReady: withBank || !!ex.achReady, achCashPro: a.cashPro || !!ex.achCashPro, updatedAt: now };
      if (a.bank) patch.achBank = a.bank; if (a.last4) patch.achLast4 = a.last4; if (a.custEm) patch.achEm = a.custEm; if (a.repEm) patch.achRepEm = a.repEm; if (a.terms && !ex.terms) patch.terms = a.terms; if (a.terms) patch.achTerms = a.terms;
      if (a.app && !ex.achApp) patch.achApp = true; if (a.appOn) patch.achAt = a.appOn; if (a.cashPro && !ex.achCashProAt) patch.achCashProAt = a.appOn || now.substring(0, 10); if (a.limit) patch.achLimit = a.limit; if (a.note) patch.achNote = a.note;
      ops.push({ op: 'merge', col: 'accounts', id: a.acct, data: patch }); nAcct++; });
    for (let i = 0; i < ops.length; i += 400) await S.DB.batch(ops.slice(i, i + 400));
    if (nAcct) await bumpAccountsVer();
    try { (await import('./ach.js')).dropAchCache(); } catch (e) {}
    const uniq = Array.from(new Set(noAcct));
    out.innerHTML = '<div class="alert a-blu">🏦 ACH ' + L.list.length + '건 (새로 ' + nNew + ' · 있던 ' + nKeep + '건은 적은 칸만 · 셋업 ☑ ' + L.list.filter(x => x.setup).length + ' · 인출 완료 ☑ ' + L.list.filter(x => x.done).length + ') · 합계 ' + money(sum(L.list, x => x.amt)) + (L.skipped ? ' · 계정코드 없음 · 중복 ' + L.skipped + '건 건너뜀' : '') +
      '<br>거래처 ACH 정보 ' + nAcct + '곳 (은행 정보 ' + nBank + '곳 → achBank)' + (uniq.length ? '<br>⚠️ 거래처 목록에 없는 계정코드 ' + uniq.length + '곳 (건은 넣었고 거래처 표시는 건너뜀): ' + esc(uniq.slice(0, 8).join(', ')) + (uniq.length > 8 ? ' …' : '') : '') + '<br><b>저장 완료</b> — 🏦 ACH 허브에서 확인하세요</div>';
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}
