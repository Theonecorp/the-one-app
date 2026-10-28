/* ============================================================
 *  🏭 경영 (관리자) — 옛 대시보드 b17~b19 와 같은 흐름
 *    요약 · 🏭 공장(중국 공장 장부: 인보이스 물품+운임 · 송금 · 잔액 · 월별 · 연도별 · 명세 인쇄)
 *    🧾 1099(커미션 세일즈맨 자동 + 고정 지급 회차 일괄 · 대상 관리 · 인쇄 · CSV)
 *    🎁 오피스 보너스(정산 확정 때 OFFICE 공제가 쌓임 · 배분표 · 배분 실행 · 수동 적립)
 *    📈 회사 매출(월별 숫자 입력: TOTAL SALES · 품목 · 세일즈맨 · 주 · 현금 흐름)
 *  자료: factories · factoryInvoices · factoryPayments · pay1099 · payees · bonusAcc · bonusDist · bonusSplit/main · sales/{year}
 * ============================================================ */
import { $, esc, money, k, num, R2, today, ym, md, toast, busy, openModal, closeModal, confirmBox, Router, inputDate, sel, sum, sortBy, groupBy, printOpen, pct } from './ui.js';
import { newId } from './db.js';
import { salesMonth, rebuildSalesM, invTypes } from './invoicing.js';

let S = null, TAB = 'home', YEAR = Number(today().substring(0, 4)), FAC = '', MON = Number(today().substring(5, 7)) - 1;
let LV = 'grid';   // 📒 장부 보기: 엑셀식 · 카드식
const D = { fac: null, inv: null, pay: null, p99: null, payees: null, acc: null, dist: null, split: null, sales: {} };
export function register(state) { S = state; Router.on('mg', a => { if (a) TAB = a; page(); }); }
const signed = n => { n = Number(n) || 0; return (n < 0 ? '−' : '') + money(Math.abs(n)); };
const pct2 = p => (Number(p) || 0).toFixed(1) + '%';
const MON_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
async function load(force) {
  if (D.fac && !force) return;
  const g = (c, q) => S.DB.list(c, q).catch(() => []);
  [D.fac, D.inv, D.pay, D.p99, D.payees, D.acc, D.dist] = await Promise.all([g('factories'), g('factoryInvoices'), g('factoryPayments'), g('pay1099'), g('payees'), g('bonusAcc'), g('bonusDist')]);
  D.split = (await S.DB.get('bonusSplit', 'main').catch(() => null)) || { id: 'main', rows: [] };
  D.fac = sortBy(D.fac.filter(f => f.active !== false), f => f.name);
  if (!FAC && D.fac.length) FAC = D.fac[0].code;
}
function years() { const y0 = Number(today().substring(0, 4)), ys = new Set([YEAR, y0, y0 - 1, y0 - 2]); /* 매출은 지난 2년도 (가져온 인보이스) */ [].concat(D.inv, D.pay, D.p99, D.acc).forEach(x => { if (x.d) ys.add(Number(x.d.substring(0, 4))); }); return Array.from(ys).sort(); }
async function page() {
  $('page').innerHTML = '<div class="load">경영 자료 읽는 중…</div>';
  await load();
  const T = [['home', '요약'], ['fac', '🏭 공장'], ['p99', '🧾 1099'], ['bon', '🎁 보너스'], ['sales', '📈 매출']];
  let h = '<div class="seg">' + T.map(t => '<button class="' + (TAB === t[0] ? 'on' : '') + '" data-mt="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
  if (TAB !== 'bon') h += '<div class="chips">' + years().map(y => '<button class="' + (y === YEAR ? 'on' : '') + '" data-my="' + y + '">' + y + '</button>').join('') + '</div>';
  h += '<div id="mgBody"></div>';
  $('page').innerHTML = h;
  document.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => { TAB = b.dataset.mt; page(); });
  document.querySelectorAll('[data-my]').forEach(b => b.onclick = () => { YEAR = Number(b.dataset.my); page(); });
  if (TAB === 'home') paintHome(); else if (TAB === 'fac') paintFac(); else if (TAB === 'p99') paint99(); else if (TAB === 'bon') paintBon(); else await paintSales();
}
const refresh = async () => { await load(true); page(); };

/* ---------- 공장 계산 ---------- */
function facStat(code, year) {
  const inv = D.inv.filter(x => x.f === code && !x.void), pay = D.pay.filter(x => x.f === code && !x.void);
  const yS = year + '-01-01', yE = year + '-12-31';
  const before = R2(sum(inv.filter(x => x.d < yS), x => x.amt) - sum(pay.filter(x => x.d < yS), x => x.amt));
  const yi = inv.filter(x => x.d >= yS && x.d <= yE), yp = pay.filter(x => x.d >= yS && x.d <= yE);
  const item = sum(yi.filter(x => x.type === '인보이스'), x => x.item), frt = sum(yi.filter(x => x.type === '인보이스' || x.type === '운임만'), x => x.frt), buy = sum(yi, x => x.amt), paid = sum(yp, x => x.amt);
  const mon = Array.from({ length: 12 }, (_, i) => { const mm = year + '-' + String(i + 1).padStart(2, '0'); const mi = yi.filter(x => x.d.substring(0, 7) === mm), mp = yp.filter(x => x.d.substring(0, 7) === mm); const it = sum(mi.filter(x => x.type === '인보이스'), x => x.item), fr = sum(mi, x => x.frt); return { m: i + 1, n: mi.length, item: it, frt: fr, frtPct: it ? fr / it * 100 : 0, buy: sum(mi, x => x.amt), paid: sum(mp, x => x.amt) }; });
  const monthsWithBuy = mon.filter(m => m.buy > 0).length, avg = monthsWithBuy ? buy / monthsWithBuy : 0;
  const balance = R2(before + buy - paid);
  const rows = sortBy(yi.map(x => Object.assign({ k: 'inv' }, x)).concat(yp.map(x => Object.assign({ k: 'pay' }, x))), x => x.d + (x.createdAt || ''));
  let run = before; rows.forEach(x => { run = R2(run + (x.k === 'inv' ? x.amt : -x.amt)); x.run = run; });
  const allYears = Array.from(new Set(inv.concat(pay).map(x => Number(x.d.substring(0, 4))))).sort();
  let carry = 0; const yearly = allYears.map(y => { const a = inv.filter(x => x.d.substring(0, 4) == y), b = pay.filter(x => x.d.substring(0, 4) == y); const it = sum(a.filter(x => x.type === '인보이스'), x => x.item), fr = sum(a, x => x.frt), bb = sum(a, x => x.amt), pp = sum(b, x => x.amt); const row = { y, carry, buy: bb, paid: pp, frtPct: it ? fr / it * 100 : 0, endBal: R2(carry + bb - pp) }; carry = row.endBal; return row; });
  const lastPay = yp.concat(pay).map(x => x.d).sort().pop() || '';
  return { openBal: before, item, frt, frtPct: item ? frt / item * 100 : 0, buy, paid, n: yi.length, balance, mon, rows: rows.reverse(), yearly, monthsOwed: avg ? balance / avg : 0, lastPay, hiFrt: yi.filter(x => x.type === '인보이스' && x.item > 0 && x.frt / x.item > 0.15).map(x => ({ d: x.d, item: x.item, frt: x.frt, pct: x.frt / x.item * 100 })) };
}
/** 송금을 오래된 인보이스부터 메움 — 인보이스마다 paid · left · st(ok/part/open). 크레딧(음수)은 송금처럼 셈. 전 기간 기준 */
function facAlloc(code) {
  const inv = sortBy(D.inv.filter(x => x.f === code && !x.void), x => x.d + (x.createdAt || ''));
  let pool = R2(sum(D.pay.filter(x => x.f === code && !x.void), x => x.amt) + sum(inv.filter(x => x.amt < 0), x => -x.amt));
  const out = { inv: {}, okN: 0, partN: 0, partLeft: 0, openN: 0, openAmt: 0, over: 0 };
  inv.filter(x => x.amt > 0).forEach(x => { const paid = Math.min(pool, x.amt); pool = R2(pool - paid); const left = R2(x.amt - paid), st = left <= 0.005 ? 'ok' : paid > 0.005 ? 'part' : 'open'; out.inv[x.id] = { paid, left, st }; if (st === 'ok') out.okN++; else if (st === 'part') { out.partN++; out.partLeft = R2(out.partLeft + left); } else { out.openN++; out.openAmt = R2(out.openAmt + left); } });
  out.over = pool;
  return out;
}
function bonusStat() {
  const pool = sum(D.acc.filter(a => !a.void), a => a.amt), paid = sum(D.dist, d => d.sum), avail = R2(pool - paid);
  const bySm = sortBy(Object.entries(groupBy(D.acc.filter(a => !a.void), a => a.sm || '—')).map(([sm, L]) => ({ sm, amt: sum(L, a => a.amt), n: L.length, last: L.map(a => a.d).sort().pop() })), x => x.amt, true);
  const byQ = Object.entries(groupBy(D.acc.filter(a => !a.void), a => a.d.substring(0, 4) + ' Q' + (Math.floor((Number(a.d.substring(5, 7)) - 1) / 3) + 1))).sort().slice(-6).map(([q, L]) => ({ q, amt: sum(L, a => a.amt) }));
  const rows = (D.split.rows || []).filter(r => r.who); const grps = groupBy(rows, r => r.grp || 'A'); const shareTot = Object.values(grps).reduce((a, L) => a + (Number(L[0].share) || 0), 0) || 100;
  const preview = []; Object.entries(grps).forEach(([g, L]) => { const gAmt = avail * (Number(L[0].share) || 0) / shareTot, pTot = L.reduce((a, r) => a + (Number(r.pct) || 0), 0) || 100; L.forEach(r => preview.push({ grp: g, who: r.who, pct: (Number(L[0].share) || 0) / shareTot * (Number(r.pct) || 0) / pTot * 100, amt: R2(gAmt * (Number(r.pct) || 0) / pTot) })); });
  return { pool, paid, avail, bySm, byQ, preview, rounds: sortBy(D.dist, d => d.d, true) };
}
function p99Stat(year) {
  const rows = sortBy(D.p99.filter(r => !r.void && r.d.substring(0, 4) == year), r => r.d, true), prevRows = D.p99.filter(r => !r.void && r.d.substring(0, 4) == year - 1);
  const t = today(), nextDay = Number(t.substring(8, 10)) <= 15 ? t.substring(0, 8) + '15' : t.substring(0, 7) + '-' + new Date(Number(t.substring(0, 4)), Number(t.substring(5, 7)), 0).getDate();
  const list = sortBy(D.payees.map(p => { const mine = rows.filter(r => r.who === p.who), mon = Array.from({ length: 12 }, (_, i) => sum(mine.filter(r => Number(r.d.substring(5, 7)) === i + 1), r => r.amt)); const last = sortBy(mine, r => r.d, true)[0];
    const missing = []; if (p.kind === '고정' && p.active !== false && year == t.substring(0, 4)) { for (let m = 1; m <= Number(t.substring(5, 7)); m++) { const mm = year + '-' + String(m).padStart(2, '0'); if (p.cycle === '월') { if (!mine.some(r => r.d.substring(0, 7) === mm)) missing.push(mm); } else if ((p.cycle || '반월') === '반월') { ['a', 'b'].forEach(hf => { const key = mm + hf; if (key > nextDay.substring(0, 7) + (Number(nextDay.substring(8, 10)) <= 15 ? 'a' : 'b')) return; if (!mine.some(r => r.d.substring(0, 7) === mm && (Number(r.d.substring(8, 10)) <= 15 ? 'a' : 'b') === hf)) missing.push(key); }); } } }
    return Object.assign({ cycle: '반월', active: true }, p, { total: sum(mine, r => r.amt), n: mine.length, prev: sum(prevRows.filter(r => r.who === p.who), r => r.amt), mon, last: last ? last.d : '', lastAmt: last ? last.amt : 0, gross: last ? (last.gross || last.amt) : 0, missing }); }), p => p.who);
  rows.forEach(r => { if (!D.payees.some(p => p.who === r.who)) { const ex = list.find(p => p.who === r.who); if (!ex) list.push({ who: r.who, co: r.co || '', kind: '고정', cycle: '수시', active: false, total: sum(rows.filter(x => x.who === r.who), x => x.amt), n: rows.filter(x => x.who === r.who).length, prev: 0, mon: Array.from({ length: 12 }, (_, i) => sum(rows.filter(x => x.who === r.who && Number(x.d.substring(5, 7)) === i + 1), x => x.amt)), last: r.d, lastAmt: r.amt, gross: r.amt, missing: [] }); } });
  const monTot = Array.from({ length: 12 }, (_, i) => sum(rows.filter(r => Number(r.d.substring(5, 7)) === i + 1), r => r.amt));
  return { rows, list, grand: sum(rows, r => r.amt), prevGrand: sum(prevRows, r => r.amt), monTot, nextDay };
}
const perLabel = key => !key ? '' : key.length === 7 ? Number(key.substring(5, 7)) + '월' : Number(key.substring(5, 7)) + '월 ' + (key.charAt(7) === 'a' ? '15일' : '말일');
const kindTag = p => p.kind === '커미션' ? '<span class="tag t-a">커미션</span>' : (p.cycle === '월' ? '<span class="tag t-c">월 고정</span>' : p.cycle === '수시' ? '<span class="tag t-f">고정</span>' : '<span class="tag t-k">반월 고정</span>') + (p.officePct ? ' <span class="tag" style="background:#fce7f3;color:#9d174d">적립 ' + p.officePct + '%</span>' : '');

/* ============================================================
 *  요약
 * ============================================================ */
async function paintHome() {
  await salesDoc(YEAR);
  const facs = D.fac.map(f => Object.assign({ code: f.code, name: f.name }, facStat(f.code, YEAR)));
  const tot = { bal: sum(facs, f => f.balance), buy: sum(facs, f => f.buy), paid: sum(facs, f => f.paid), item: sum(facs, f => f.item), frt: sum(facs, f => f.frt) };
  const p99 = p99Stat(YEAR), bo = bonusStat(), sl = D.sales[YEAR];
  let h = '<div class="card tap" data-go="fac"><h2>🏭 중국 공장 — 미지급 잔액</h2><div class="hero">' + money(tot.bal) + '</div><div class="heroSub">' + YEAR + ' 구매 ' + k(tot.buy) + ' · 송금 ' + k(tot.paid) + ' · 운임 비율 ' + pct2(tot.item ? tot.frt / tot.item * 100 : 0) + '</div>' +
    (facs.length ? '<table style="margin-top:10px"><tr><th>공장</th><th class="r">잔액</th><th class="r">' + YEAR + ' 구매</th><th class="r">송금</th><th class="r">운임%</th></tr>' + facs.map(f => '<tr><td style="font-weight:700">' + esc(f.name) + '<br><small style="color:#94a3b8;font-weight:400">마지막 송금 ' + (f.lastPay || '—') + (f.monthsOwed ? ' · 잔액 ≈ ' + f.monthsOwed.toFixed(1) + '개월치' : '') + '</small></td><td class="r"><b>' + money(f.balance) + '</b></td><td class="r">' + k(f.buy) + '</td><td class="r">' + k(f.paid) + '</td><td class="r">' + pct2(f.frtPct) + '</td></tr>').join('') + '</table>' : '<div class="none">공장을 아직 등록하지 않았습니다 — 🏭 공장 탭에서 ＋ 공장</div>') + '</div>';
  h += '<div class="two-col"><div class="card tap" data-go="p99"><h2>🧾 1099 지급 — ' + YEAR + '</h2><div class="hero" style="font-size:26px">' + money(p99.grand) + '</div><div class="heroSub">' + p99.rows.length + '건 · 세일즈맨 · 컨트랙터 · 월 고정</div></div>' +
    '<div class="card tap" data-go="bon"><h2>🎁 오피스 보너스 적립금</h2><div class="hero" style="font-size:26px">' + money(bo.avail) + '</div><div class="heroSub">적립 ' + money(bo.pool) + ' − 지급 ' + money(bo.paid) + ' · ' + D.acc.length + '건</div></div></div>';
  h += '<div class="card tap" id="mgRep"><h2>📊 리포트 <span class="en">Reports</span></h2><div class="muted">기간을 골라 아이템별 · 손님별 · 세일즈맨별 매출과 수금 — CSV · 인쇄</div></div>';
  h += '<div class="card tap" data-go="sales"><h2>📈 회사 매출 (The One sales amount)</h2>' + (sl && sl.rows ? (() => { const T = sl.rows.find(r => r.label === 'TOTAL SALES'); const lastM = T ? T.m.map((v, i) => v ? i : -1).filter(i => i >= 0).pop() : -1; const ytd = T ? sum(T.m) : 0; return lastM >= 0 ? '<div class="hero" style="font-size:26px">' + money(T.m[lastM]) + '<span style="font-size:13px;color:#64748b;font-weight:600;margin-left:8px">' + YEAR + '년 ' + MON_KO[lastM] + ' TOTAL SALES</span></div><div class="heroSub">YTD ' + money(ytd) + '</div>' : '<div class="none">아직 입력된 달이 없습니다</div>'; })() : '<div class="none">아직 입력된 달이 없습니다 — 📈 매출 탭에서 월별 숫자 입력</div>') + '</div>';
  $('mgBody').innerHTML = h;
  document.querySelectorAll('#page [data-go]').forEach(el => el.onclick = () => { TAB = el.dataset.go; page(); });
  $('mgRep').onclick = () => Router.go('reports');
}

/* ============================================================
 *  📥 과거 데이터 가져오기 — 옛 대시보드 SEED_DATA (엑셀 변환) → Firestore
 *    같은 줄은 항상 같은 id(SD…) 로 들어가서 다시 넣어도 덮어쓰기만 됨
 * ============================================================ */
function seedParse(txt) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('데이터 모양이 아닙니다');
  const o = JSON.parse(txt.substring(a, b + 1)); if (!o || (!o.inv && !o.p1099 && !o.pay)) throw new Error('SEED_DATA 가 아닙니다 (inv · pay · p1099 가 없음)');
  return o;
}
function seedOps(o) {
  const now = new Date().toISOString(), ops = [], pad = n => String(n).padStart(4, '0'), cnt = { fac: 0, inv: 0, pay: 0, p99: 0, bonus: 0, payees: 0, split: 0 };
  (o.fac || []).forEach(f => { const code = String(f.code || '').toUpperCase(); if (!code) return; const ex = D.fac.find(x => x.code === code); ops.push({ op: 'set', col: 'factories', id: code, data: Object.assign({ id: code, code, name: f.name || code, active: true, createdAt: now }, ex || {}, { name: (ex && ex.name) || f.name || code }) }); cnt.fac++; });
  (o.inv || []).forEach((x, i) => { const id = 'SDI' + pad(i + 1); ops.push({ op: 'set', col: 'factoryInvoices', id, data: { id, f: x.f, d: x.d, type: x.type || '인보이스', item: R2(num(x.item)), frt: R2(num(x.frt)), amt: R2(num(x.amt)), note: x.note || '', seed: true, src: x.src || '', createdAt: now, updatedAt: now } }); cnt.inv++; });
  (o.pay || []).forEach((x, i) => { const id = 'SDP' + pad(i + 1); ops.push({ op: 'set', col: 'factoryPayments', id, data: { id, f: x.f, d: x.d, amt: R2(num(x.amt)), note: x.note || '', seed: true, src: x.src || '', createdAt: now } }); cnt.pay++; });
  (o.p1099 || []).forEach((x, i) => { const id = 'SDN' + pad(i + 1), who = String(x.who || '').toUpperCase(); ops.push({ op: 'set', col: 'pay1099', id, data: { id, d: x.d, who, co: x.co || '', amt: R2(num(x.amt)), gross: R2(num(x.amt)), acc: 0, note: x.note || '', ref: '', seed: true, src: x.src || '', createdAt: now } }); cnt.p99++; });
  (o.bonus || []).forEach((x, i) => { const id = 'SDB' + pad(i + 1); ops.push({ op: 'set', col: 'bonusAcc', id, data: { id, d: x.d, sm: String(x.sm || '').toUpperCase(), amt: R2(num(x.amt)), src: '엑셀 이월', note: x.note || '', ref: '', seed: true } }); cnt.bonus++; });
  const names = Object.assign({}, o.payees || {}); Object.keys(o.payeeKinds || {}).forEach(w => { if (!(w in names)) names[w] = ''; });
  Object.keys(names).forEach(w => { const who = w.toUpperCase(), kd = (o.payeeKinds || {})[w] || {}, ex = D.payees.find(p => p.who === who) || {};
    ops.push({ op: 'set', col: 'payees', id: who, data: Object.assign({ id: who, who, co: names[w] || '', kind: kd.kind || '고정', cycle: kd.cycle || '', officePct: num(kd.officePct), active: kd.active !== false }, ex, { co: ex.co || names[w] || '' }) }); cnt.payees++; });
  if ((o.split || []).length && !(D.split.rows || []).filter(r => r.who).length) { ops.push({ op: 'set', col: 'bonusSplit', id: 'main', data: { id: 'main', rows: o.split.map(r => ({ grp: r.grp || 'A', who: String(r.name || r.who || '').toUpperCase(), pct: num(r.pct), share: num(r.share) || 100 })), updatedAt: now } }); cnt.split = o.split.length; }
  return { ops, cnt };
}
/** 관리 → 가져오기에서 부름 — 경영 자료를 읽은 뒤 미리보기 */
export async function seedImport(txt) { await load(); seedPreview(txt); }
/** 관리 → 가져오기(공장 명세서 등)가 자료를 바꾼 뒤 — 다음에 경영 탭을 열 때 다시 읽게 */
export function dropMgCache() { D.fac = null; }
function seedPreview(txt) {
  let o; try { o = seedParse(txt); } catch (e) { return toast('읽을 수 없습니다: ' + e.message, 'bad'); }
  const { ops, cnt } = seedOps(o), has = D.inv.some(x => x.seed) || D.p99.some(x => x.seed);
  const yrs = (o.inv || []).concat(o.p1099 || []).map(x => String(x.d || '').substring(0, 4)).filter(Boolean).sort(); const span = yrs.length ? yrs[0] + ' ~ ' + yrs[yrs.length - 1] : '';
  openModal('<h2>📥 가져올 내용</h2><div class="heroSub">' + span + '</div><table style="margin-top:8px"><tr><td>🏭 공장</td><td class="r"><b>' + cnt.fac + '</b></td></tr><tr><td>공장 인보이스 (물품+운임)</td><td class="r"><b>' + cnt.inv + '</b> 줄 · ' + money(sum(o.inv || [], x => num(x.amt))) + '</td></tr><tr><td>공장 송금</td><td class="r"><b>' + cnt.pay + '</b> 줄 · ' + money(sum(o.pay || [], x => num(x.amt))) + '</td></tr><tr><td>🧾 1099 지급</td><td class="r"><b>' + cnt.p99 + '</b> 줄 · ' + money(sum(o.p1099 || [], x => num(x.amt))) + '</td></tr><tr><td>🎁 보너스 적립</td><td class="r"><b>' + cnt.bonus + '</b> 줄 · ' + money(sum(o.bonus || [], x => num(x.amt))) + '</td></tr><tr><td>👤 1099 대상 (이름·회사·구분)</td><td class="r"><b>' + cnt.payees + '</b> 명</td></tr><tr><td>배분표</td><td class="r">' + (cnt.split ? '<b>' + cnt.split + '</b> 줄' : '<span class="muted">이미 있어 건너뜀</span>') + '</td></tr></table>' +
    (has ? '<div class="alert a-amb" style="margin-top:8px">이미 가져온 적이 있습니다 — 같은 줄은 덮어쓰고, 새 줄만 추가됩니다. 앱에서 직접 입력한 줄은 건드리지 않습니다.</div>' : '') +
    '<div class="hint">⚠️ 표시가 붙은 줄(날짜 없음·금액 불일치 등)은 메모에 그대로 남겨 두니 나중에 장부에서 고쳐 주세요.</div>' +
    '<div class="btns"><button class="b-ghost" id="sX">취소</button><button class="b-blue" id="sGo">' + ops.length + '건 넣기</button></div>');
  $('sX').onclick = closeModal;
  $('sGo').onclick = async () => { busy(true); try { await S.DB.batch(ops); closeModal(); toast('가져왔습니다 — ' + ops.length + '건', 'good'); await load(true); if (location.hash.indexOf('#/mg') === 0) page(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  🏭 공장
 * ============================================================ */
function paintFac() {
  const box = $('mgBody');
  let h = '<div class="chips">' + D.fac.map(f => '<button class="' + (f.code === FAC ? 'on' : '') + '" data-fc="' + esc(f.code) + '">' + esc(f.name) + '</button>').join('') + '<button id="facNew">＋ 공장</button></div>';
  const f = D.fac.find(x => x.code === FAC);
  if (!f) { box.innerHTML = h + '<div class="card"><div class="none">공장을 등록하세요</div></div>'; bindFacHead(); return; }
  const d = facStat(FAC, YEAR), s = d, y = YEAR, TT = { '인보이스': 't-f', '이월': 't-c', '크레딧': 't-k', '운임만': 't-a' };
  h += '<div class="card"><h2>' + esc(f.name) + ' — 미지급 잔액</h2><div class="hero">' + money(d.balance) + '</div><div class="heroSub">연초 이월 ' + money(d.openBal) + ' + ' + y + ' 구매 ' + money(s.buy) + ' − 송금 ' + money(s.paid) + (s.monthsOwed ? ' · 잔액 ≈ 월평균 구매의 ' + s.monthsOwed.toFixed(1) + '배' : '') + '</div>' +
    '<div class="kpi"><div><b>' + k(s.item) + '</b><span>물품 (인보이스)</span></div><div><b>' + k(s.frt) + '</b><span>운임 (쉬핑)</span></div><div><b>' + pct2(s.frtPct) + '</b><span>운임 ÷ 물품</span></div><div><b>' + s.n + '건</b><span>' + y + ' 인보이스</span></div></div>' +
    '<div class="btns"><button class="b-blue" id="facInv">＋ 인보이스 (물품+운임)</button><button class="b-green" id="facPay">＋ 송금</button><button class="b-ghost" id="facPrint">🖨 명세</button><button class="b-ghost" id="facClean">🧹 중복 정리 · 합치기</button></div>' + dupWarn(FAC) + '</div>';
  const max = Math.max(1, ...d.mon.map(m => Math.max(m.buy, m.paid)));
  h += '<div class="card"><h2>' + y + ' 월별 — 구매(파랑) vs 송금(초록)</h2><div class="bars">' + d.mon.map(m => '<div style="flex:1;display:flex;gap:1px;align-items:flex-end;height:80px"><div class="b on" style="height:' + Math.max(2, Math.round(m.buy / max * 78)) + 'px" data-v="' + m.m + '월 구매 ' + k(m.buy) + '"></div><div class="b" style="height:' + Math.max(2, Math.round(m.paid / max * 78)) + 'px;background:#4ade80" data-v="' + m.m + '월 송금 ' + k(m.paid) + '"></div></div>').join('') + '</div><div class="xlab"><span>1월</span><span>6월</span><span>12월</span></div>' +
    '<table style="margin-top:8px;font-size:12.5px"><tr><th>월</th><th class="r">물품</th><th class="r">운임</th><th class="r">운임%</th><th class="r">구매 합</th><th class="r">송금</th></tr>' + d.mon.filter(m => m.buy || m.paid).map(m => '<tr><td>' + m.m + '월 <small class="muted">' + m.n + '건</small></td><td class="r">' + k(m.item) + '</td><td class="r">' + k(m.frt) + '</td><td class="r ' + (m.frtPct > 15 ? 'warn' : '') + '">' + pct2(m.frtPct) + '</td><td class="r"><b>' + k(m.buy) + '</b></td><td class="r" style="color:#15803d">' + k(m.paid) + '</td></tr>').join('') + '<tr style="font-weight:800"><td>합계</td><td class="r">' + k(s.item) + '</td><td class="r">' + k(s.frt) + '</td><td class="r">' + pct2(s.frtPct) + '</td><td class="r">' + k(s.buy) + '</td><td class="r" style="color:#15803d">' + k(s.paid) + '</td></tr></table></div>';
  h += '<div class="card"><h2>연도별 — 얼마나 사고 얼마나 보냈나</h2><table style="font-size:12.5px"><tr><th>연도</th><th class="r">구매</th><th class="r">운임%</th><th class="r">송금</th><th class="r">연말 잔액</th></tr>' + d.yearly.slice().reverse().map(Y => '<tr><td><b>' + Y.y + '</b>' + (Y.carry ? '<br><small class="muted">이월 ' + k(Y.carry) + '</small>' : '') + '</td><td class="r">' + money(Y.buy) + '</td><td class="r">' + pct2(Y.frtPct) + '</td><td class="r" style="color:#15803d">' + money(Y.paid) + '</td><td class="r"><b>' + money(Y.endBal) + '</b></td></tr>').join('') + '</table>' +
    (d.hiFrt.length ? '<div class="alert a-amb" style="margin-top:10px">🚢 <b>운임 비율이 높은 인보이스</b> (' + y + ')<br>' + d.hiFrt.map(x => '· ' + md(x.d) + ' 물품 ' + money(x.item) + ' / 운임 ' + money(x.frt) + ' → <b>' + pct2(x.pct) + '</b>').join('<br>') + '</div>' : '') + '</div>';
  /* 📒 장부 — 엑셀처럼: 날짜 | 내용 | 인보이스 $ | 송금 $ | 잔액 | 송금 상태. 송금은 오래된 인보이스부터 순서대로 메운 것으로 보아
   *   "어느 인보이스까지 보냈는지" 가 바로 보임 (✓ 완납 · ◐ 일부 · ○ 미송금). 파샬로 보낸 것은 ◐ 에 남은 금액이 적힘 */
  const al = facAlloc(FAC), asc = d.rows.slice().reverse();
  let lastPaidSeen = false;
  const stTag = x => { const a = al.inv[x.id]; if (!a) return ''; return a.st === 'ok' ? '<span class="tag t-k">✓ 완납</span>' : a.st === 'part' ? '<span class="tag t-c">◐ 일부 · 남음 ' + money(a.left) + '</span>' : '<span class="tag" style="background:#fee2e2;color:#991b1b">○ 미송금</span>'; };
  const ledRows = asc.map(x => { const inv = x.k === 'inv', a = inv ? al.inv[x.id] : null; let mark = '';
    if (inv && x.amt > 0 && a && a.st !== 'ok' && !lastPaidSeen) { lastPaidSeen = true; mark = '<tr class="mark"><td colspan="5">▲ 여기까지 송금 완료 · paid through here ▲</td></tr>'; }
    return mark + '<tr class="tap ' + (inv ? (x.amt < 0 ? 'cr' : 'inv') : 'pay') + '" data-fe="' + x.k + '|' + x.id + '"><td>' + md(x.d) + '</td><td class="nt">' + (inv ? '<span class="tag ' + (TT[x.type] || 't-f') + '">' + esc(x.type) + '</span>' + (x.type === '인보이스' ? ' <small class="muted">물품 ' + k(x.item) + ' + 운임 ' + k(x.frt) + '</small>' : '') : '<span class="tag t-k">송금</span>') + (x.note ? ' <small>' + esc(x.note) + '</small>' : '') + (inv && x.amt > 0 ? '<div style="margin-top:2px">' + stTag(x) + '</div>' : '') + '</td>' +
      '<td class="r">' + (inv ? '<b>' + signed(x.amt) + '</b>' : '') + '</td><td class="r" style="color:#15803d">' + (inv ? '' : '<b>' + money(x.amt) + '</b>') + '</td><td class="r">' + money(x.run) + '</td></tr>'; });
  if (!lastPaidSeen && asc.some(x => x.k === 'inv' && x.amt > 0)) ledRows.push('<tr class="mark"><td colspan="5">▲ ' + y + ' 인보이스 모두 송금 완료 ▲</td></tr>');
  h += '<div class="card"><h2 style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>📒 ' + y + ' 장부 — ' + d.rows.length + '줄</span><span class="seg" style="margin:0"><button class="' + (LV === 'grid' ? 'on' : '') + '" data-lv="grid">엑셀식</button><button class="' + (LV === 'list' ? 'on' : '') + '" data-lv="list">카드식</button></span></h2>' +
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px"><div><b>' + al.okN + '건</b><span>✓ 완납 인보이스</span></div><div' + (al.partN ? ' style="background:#fef3c7"' : '') + '><b>' + al.partN + '건' + (al.partN ? ' · ' + k(al.partLeft) : '') + '</b><span>◐ 일부 송금 (남음)</span></div><div' + (al.openN ? ' style="background:#fee2e2"' : '') + '><b>' + al.openN + '건 · ' + k(al.openAmt) + '</b><span>○ 미송금</span></div></div>' +
    (al.over > 0.005 ? '<div class="alert a-grn">💚 인보이스보다 ' + money(al.over) + ' 더 보냈습니다 (선지급 · 다음 인보이스에서 차감)</div>' : '') +
    '<div class="muted" style="margin-bottom:6px">송금은 오래된 인보이스부터 차례로 메운 것으로 봅니다 (보통 인보이스 단위로 보내므로). 줄을 누르면 수정. <span class="en">Payments are applied to the oldest invoices first.</span></div>' +
    (d.rows.length ? (LV === 'grid' ? '<div class="xwrap"><table class="ledg"><tr><th>날짜</th><th>내용</th><th class="r">인보이스 $</th><th class="r">송금 $</th><th class="r">잔액</th></tr>' + ledRows.join('') + '<tr class="tot"><td></td><td>' + y + ' 합계</td><td class="r"><b>' + money(d.buy) + '</b></td><td class="r" style="color:#15803d"><b>' + money(d.paid) + '</b></td><td class="r"><b>' + money(d.balance) + '</b></td></tr></table></div>' :
      d.rows.map(x => { const inv = x.k === 'inv'; return '<div class="pr tap" data-fe="' + x.k + '|' + x.id + '"><div class="ct"><b>' + md(x.d) + ' ' + (inv ? '<span class="tag ' + (TT[x.type] || 't-f') + '">' + esc(x.type) + '</span>' : '<span class="tag t-k">송금</span>') + (inv && x.type === '인보이스' ? ' <span style="font-weight:500;color:#64748b;font-size:12px">물품 ' + k(x.item) + ' + 운임 ' + k(x.frt) + (x.item > 0 ? ' (' + pct2(x.frt / x.item * 100) + ')' : '') + '</span>' : '') + (inv && x.amt > 0 ? ' ' + stTag(x) : '') + '</b>' + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</div><div class="pa"><b style="color:' + (inv ? (x.amt < 0 ? '#15803d' : '#0f172a') : '#15803d') + '">' + (inv ? signed(x.amt) : '− ' + money(x.amt)) + '</b><small>잔액 ' + money(x.run) + '</small></div></div>'; }).join('')) : '<div class="none">이 해 기록이 없습니다</div>') + '</div>';
  box.innerHTML = h; bindFacHead();
  box.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { LV = b.dataset.lv; paintFac(); });
  $('facInv').onclick = () => invForm(); $('facPay').onclick = () => payForm(); $('facClean').onclick = () => cleanupModal(FAC);
  $('facPrint').onclick = () => printOpen('<h1>' + esc(f.name) + ' — ' + y + ' Statement</h1><div class="meta">THE ONE CORP · 출력 ' + today() + ' · 연초 이월 ' + money(d.openBal) + ' · 현재 잔액 <b>' + money(d.balance) + '</b></div><table class="box"><tr><td>' + y + ' 구매 (물품 ' + money(d.item) + ' + 운임 ' + money(d.frt) + ')</td><td class="r">' + money(d.buy) + '</td></tr><tr><td>' + y + ' 송금</td><td class="r">' + money(d.paid) + '</td></tr><tr class="fin"><td>잔액 BALANCE</td><td class="r">' + money(d.balance) + '</td></tr></table><table><tr><th>Date</th><th>구분</th><th class="r">Item</th><th class="r">Freight</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th>Note</th></tr>' + d.rows.slice().reverse().map(x => { const inv = x.k === 'inv', a = inv ? al.inv[x.id] : null; return '<tr><td>' + x.d + '</td><td>' + (inv ? esc(x.type) : '송금') + '</td><td class="r">' + (inv && x.type === '인보이스' ? money(x.item) : '') + '</td><td class="r">' + (inv && x.frt ? money(x.frt) : '') + '</td><td class="r">' + (inv ? signed(x.amt) : '') + '</td><td class="r">' + (inv ? '' : money(x.amt)) + '</td><td class="r">' + money(x.run) + '</td><td>' + (a ? (a.st === 'ok' ? 'PAID' : a.st === 'part' ? 'PARTIAL (' + money(a.left) + ' due)' : 'OPEN') : '') + '</td><td>' + esc(x.note || '') + '</td></tr>'; }).join('') + '</table>');
  box.querySelectorAll('[data-fe]').forEach(el => el.onclick = () => { const [kk, id] = el.dataset.fe.split('|'); const x = (kk === 'inv' ? D.inv : D.pay).find(r => r.id === id); if (kk === 'inv') invForm(x); else payForm(x); });
}
/* ---------- 🧹 중복 정리 — 명세서(src 'stmt') 줄과 옛 자료(seed) · 손입력 줄이 같은 연도에 겹칠 때 명세서만 남김 · 공장 합치기 ----------
 *   명세서 가져오기(v0.8.90)가 처음엔 옛 자료 줄을 두고 새 줄만 넣어 겹친 것을 바로잡는 도구. 명세서가 그 연도의 기준이므로 겹치는 연도는 명세서만 남기면 됨 */
const srcOf = x => x.src === 'stmt' ? 'stmt' : (x.seed || x.src) ? 'seed' : 'manual';
function facYears(code) {
  const Y = {}; const add = (x, k) => { const y = String(x.d || '').substring(0, 4); if (!y) return; const o = Y[y] = Y[y] || { y, inv: { stmt: [], seed: [], manual: [] }, pay: { stmt: [], seed: [], manual: [] } }; o[k][srcOf(x)].push(x); };
  D.inv.filter(x => x.f === code && !x.void).forEach(x => add(x, 'inv')); D.pay.filter(x => x.f === code && !x.void).forEach(x => add(x, 'pay'));
  return Object.values(Y).sort((a, b) => a.y.localeCompare(b.y));
}
const dupYears = code => facYears(code).filter(o => (o.inv.stmt.length || o.pay.stmt.length) && (o.inv.seed.length + o.inv.manual.length + o.pay.seed.length + o.pay.manual.length));
function dupWarn(code) {
  const D2 = dupYears(code); if (!D2.length) return '';
  return '<div class="alert a-red" style="margin-top:8px">⚠️ <b>겹치는 줄이 있습니다</b> — ' + D2.map(o => o.y + '년: 명세서 ' + (o.inv.stmt.length + o.pay.stmt.length) + '줄 + 그 전 자료 ' + (o.inv.seed.length + o.inv.manual.length + o.pay.seed.length + o.pay.manual.length) + '줄').join(' · ') + '. 잔액 · 송금이 두 번 잡혀 있으니 <b>🧹 중복 정리</b>로 명세서만 남기세요.</div>';
}
function cleanupModal(code) {
  const f = D.fac.find(x => x.code === code); if (!f) return;
  const Y = facYears(code), cnt = L => L.length + '줄 ' + k(sum(L, x => x.amt));
  const rows = Y.map(o => { const other = o.inv.seed.length + o.inv.manual.length + o.pay.seed.length + o.pay.manual.length, hasS = o.inv.stmt.length + o.pay.stmt.length;
    return '<tr><td><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-cy="' + o.y + '" ' + (hasS && other ? 'checked' : '') + (hasS ? '' : ' disabled') + '><b>' + o.y + '</b></label></td><td class="r" style="font-size:12px">' + (o.inv.stmt.length ? cnt(o.inv.stmt) : '—') + '<br><span style="color:#15803d">' + (o.pay.stmt.length ? cnt(o.pay.stmt) : '—') + '</span></td><td class="r" style="font-size:12px">' + (o.inv.seed.length ? cnt(o.inv.seed) : '—') + '<br><span style="color:#15803d">' + (o.pay.seed.length ? cnt(o.pay.seed) : '—') + '</span></td><td class="r" style="font-size:12px">' + (o.inv.manual.length ? cnt(o.inv.manual) : '—') + '<br><span style="color:#15803d">' + (o.pay.manual.length ? cnt(o.pay.manual) : '—') + '</span></td></tr>'; }).join('');
  const others = D.fac.filter(x => x.code !== code);
  openModal('<h2>🧹 ' + esc(f.name) + ' — 중복 정리</h2><div class="muted">같은 연도에 <b>명세서</b> 줄과 <b>그 전 자료</b>(옛 대시보드 · 손입력) 줄이 함께 있으면 두 번 잡힙니다. 체크한 연도는 <b>명세서 줄만 남기고</b> 나머지를 지웁니다. 위 줄은 인보이스, 아래 초록 줄은 송금.</div>' +
    '<table style="margin-top:8px"><tr><th>연도</th><th class="r">📄 명세서</th><th class="r">옛 자료</th><th class="r">손입력</th></tr>' + (rows || '<tr><td colspan="4" class="muted">기록 없음</td></tr>') + '</table>' +
    '<label class="muted" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="clMan" checked> 손입력 줄도 지움 (명세서에 이미 들어 있는 줄이면 중복) — 명세서에 없는 손입력이 있으면 끄고 따로 두세요</label>' +
    '<div class="btns"><button class="b-ghost" id="clX">닫기</button><button class="b-red" id="clGo">명세서만 남기기</button></div>' +
    (others.length ? '<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><h2 style="font-size:15px">🔗 다른 공장을 이 공장으로 합치기</h2><div class="muted">명세서를 넣을 때 새 공장으로 등록돼 같은 공장이 둘이 됐으면, 그 공장의 모든 줄을 <b>' + esc(f.name) + '</b> 으로 옮기고 그 공장은 비활성으로 둡니다.</div><div class="two" style="margin-top:6px">' + sel('mgFrom', [['', '— 합칠 공장 —']].concat(others.map(x => [x.code, x.name + ' (' + x.code + ') · ' + D.inv.filter(i => i.f === x.code).length + '·' + D.pay.filter(i => i.f === x.code).length + '줄'])), '') + '<button class="b-ghost" id="mgGo">합치기</button></div>' : ''));
  $('clX').onclick = closeModal;
  $('clGo').onclick = async () => {
    const ys = Array.from(document.querySelectorAll('[data-cy]:checked')).map(c => c.dataset.cy); if (!ys.length) return toast('연도를 체크하세요', 'bad');
    const man = $('clMan').checked, ops = [];
    Y.filter(o => ys.includes(o.y)).forEach(o => { ['inv', 'pay'].forEach(kk => { o[kk].seed.concat(man ? o[kk].manual : []).forEach(x => ops.push({ op: 'del', col: kk === 'inv' ? 'factoryInvoices' : 'factoryPayments', id: x.id })); }); });
    if (!ops.length) return toast('지울 줄이 없습니다');
    if (!(await confirmBox(ys.join(', ') + '년의 명세서 아닌 줄 ' + ops.length + '개를 지울까요? 되돌릴 수 없습니다.', ops.length + '줄 지우기'))) return;
    busy(true); try { await S.DB.batch(ops); toast('🧹 ' + ops.length + '줄 정리', 'good'); await load(true); page(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
  if ($('mgGo')) $('mgGo').onclick = async () => {
    const from = $('mgFrom').value; if (!from) return toast('합칠 공장을 고르세요', 'bad'); const g = D.fac.find(x => x.code === from);
    const ops = []; D.inv.filter(x => x.f === from).forEach(x => ops.push({ op: 'update', col: 'factoryInvoices', id: x.id, data: { f: code } })); D.pay.filter(x => x.f === from).forEach(x => ops.push({ op: 'update', col: 'factoryPayments', id: x.id, data: { f: code } }));
    ops.push({ op: 'update', col: 'factories', id: from, data: { active: false, mergedInto: code } });
    if (!(await confirmBox(g.name + ' 의 ' + (ops.length - 1) + '줄을 ' + f.name + ' 으로 옮기고 ' + g.name + ' 은 비활성으로 둘까요?', '합치기'))) return;
    busy(true); try { await S.DB.batch(ops); toast('🔗 합쳤습니다 — ' + (ops.length - 1) + '줄', 'good'); closeModal(); await load(true); page(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false);
  };
}
function bindFacHead() {
  document.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => { FAC = b.dataset.fc; page(); });
  $('facNew').onclick = () => { openModal('<h2>＋ 공장 추가</h2><div class="two"><div class="fg"><label>코드 (영문 2~4자, 예: SX)</label><input id="ncC" maxlength="4" style="text-transform:uppercase"></div><div class="fg"><label>이름</label><input id="ncN"></div></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">저장</button></div>'); $('mX').onclick = closeModal; $('mOk').onclick = async () => { const code = $('ncC').value.trim().toUpperCase(), name = $('ncN').value.trim(); if (!code || !name) return toast('코드와 이름을 넣어 주세요', 'bad'); await S.DB.set('factories', code, { id: code, code, name, active: true, createdAt: new Date().toISOString() }); closeModal(); FAC = code; refresh(); }; };
}
const facSel = (id, v) => sel(id, D.fac.map(f => [f.code, f.name]), v || FAC);
function invForm(x) {
  x = x || {};
  openModal('<h2>' + (x.id ? '인보이스 수정' : '＋ 인보이스 입력') + '</h2><div class="two"><div class="fg"><label>공장</label>' + facSel('fF', x.f) + '</div><div class="fg"><label>날짜</label>' + inputDate('fD', x.d) + '</div></div>' +
    '<div class="fg"><label>구분</label>' + sel('fT', ['인보이스', '운임만', '크레딧', '이월'], x.type || '인보이스') + '</div>' +
    '<div class="two"><div class="fg" id="fgItem"><label>물품 금액 $ (인보이스)</label><input id="fI" inputmode="decimal" value="' + (x.type === '크레딧' || x.type === '이월' ? Math.abs(x.amt || 0) || '' : (x.item != null ? x.item : '')) + '"></div><div class="fg" id="fgFrt"><label>운임 $ (쉬핑)</label><input id="fR" inputmode="decimal" value="' + (x.frt != null ? x.frt : '') + '"></div></div>' +
    '<div class="alert a-blu" id="fSum">합계 —</div><div class="fg"><label>메모 (컨테이너 · 품목 · 통관세 등)</label><input id="fN" value="' + esc(x.note || '') + '"></div>' +
    '<div class="btns">' + (x.id ? '<button class="b-ghost" id="fDel">🗑 삭제</button>' : '') + '<button class="b-blue" id="fOk">저장</button></div>');
  const typeUi = () => { const t = $('fT').value; $('fgFrt').style.display = (t === '인보이스' || t === '운임만') ? '' : 'none'; $('fgItem').style.display = t === '운임만' ? 'none' : ''; $('fgItem').querySelector('label').textContent = t === '크레딧' ? '크레딧 금액 $ (양수로 입력 → 잔액에서 빼 줍니다)' : t === '이월' ? '이월 잔액 $' : '물품 금액 $ (인보이스)'; sumUi(); };
  const calc = () => { const t = $('fT').value, i = num($('fI').value), r = num($('fR').value); return { t, i: t === '운임만' ? 0 : Math.abs(i), r: (t === '인보이스' || t === '운임만') ? r : 0, amt: t === '운임만' ? r : t === '인보이스' ? R2(i + r) : t === '크레딧' ? -Math.abs(i) : i }; };
  const sumUi = () => { const c = calc(); $('fSum').innerHTML = '합계 <b>' + signed(c.amt) + '</b>' + (c.t === '인보이스' && c.i > 0 ? ' · 운임 비율 ' + pct2(c.r / c.i * 100) : ''); };
  $('fT').onchange = typeUi; $('fI').oninput = sumUi; $('fR').oninput = sumUi; typeUi();
  $('fOk').onclick = async () => { const c = calc(); if (!$('fD').value) return toast('날짜를 넣어 주세요', 'bad'); if (!c.amt && c.t !== '이월') return toast('금액을 넣어 주세요', 'bad'); const id = x.id || newId('FI'); busy(true); try { await S.DB.set('factoryInvoices', id, { id, f: $('fF').value, d: $('fD').value, type: c.t, item: R2(c.i), frt: R2(c.r), amt: R2(c.amt), note: $('fN').value.trim(), createdAt: x.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }); closeModal(); toast('저장했습니다 ' + signed(c.amt), 'good'); await refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
  if ($('fDel')) $('fDel').onclick = async () => { if (!(await confirmBox('이 줄을 지울까요? 되돌릴 수 없습니다.', '삭제'))) return; await S.DB.del('factoryInvoices', x.id); closeModal(); refresh(); };
}
function payForm(x) {
  x = x || {};
  openModal('<h2>' + (x.id ? '송금 수정' : '＋ 송금 입력') + '</h2><div class="two"><div class="fg"><label>공장</label>' + facSel('pF', x.f) + '</div><div class="fg"><label>보낸 날</label>' + inputDate('pD', x.d) + '</div></div><div class="fg"><label>금액 $</label><input id="pA" inputmode="decimal" value="' + (x.amt != null ? x.amt : '') + '" style="font-weight:800;text-align:right"></div><div class="fg"><label>메모 (T/T · 캐쉬 · 은행 등)</label><input id="pN" value="' + esc(x.note || '') + '"></div><div class="btns">' + (x.id ? '<button class="b-ghost" id="pDel">🗑 삭제</button>' : '') + '<button class="b-green" id="pOk">저장</button></div>');
  $('pOk').onclick = async () => { const a = R2(num($('pA').value)); if (!a) return toast('금액을 넣어 주세요', 'bad'); const id = x.id || newId('FP'); busy(true); try { await S.DB.set('factoryPayments', id, { id, f: $('pF').value, d: $('pD').value, amt: a, note: $('pN').value.trim(), createdAt: x.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }); closeModal(); toast('송금 기록했습니다', 'good'); await refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
  if ($('pDel')) $('pDel').onclick = async () => { if (!(await confirmBox('이 줄을 지울까요?', '삭제'))) return; await S.DB.del('factoryPayments', x.id); closeModal(); refresh(); };
}

/* ============================================================
 *  🧾 1099
 * ============================================================ */
function paint99() {
  const d = p99Stat(YEAR), y = YEAR, max = Math.max(1, ...d.monTot), warn = d.list.filter(p => p.missing.length);
  let h = '<div class="card"><h2>🧾 ' + y + ' 1099 / 커미션 지급 합계</h2><div class="hero">' + money(d.grand) + '</div><div class="heroSub">' + d.rows.length + '건 · 전년 ' + money(d.prevGrand) + ' ' + pct(d.grand, d.prevGrand) + '</div>' +
    '<div class="bars" style="height:60px">' + d.monTot.map((v, i) => '<div class="b' + (v ? ' on' : '') + '" style="height:' + Math.max(2, Math.round(v / max * 58)) + 'px" data-v="' + (i + 1) + '월 ' + k(v) + '"></div>').join('') + '</div><div class="xlab"><span>1월</span><span>6월</span><span>12월</span></div>' +
    (warn.length ? '<div class="alert a-red">⚠️ <b>아직 안 나간 회차</b> — ' + warn.map(p => '<b>' + esc(p.who) + '</b> ' + (p.missing.length > 3 ? p.missing.slice(-2).map(perLabel).join('·') + ' 외 ' + (p.missing.length - 2) + '회차' : p.missing.map(perLabel).join('·'))).join(' / ') + '<br><small>그만둔 사람이면 👤 대상 관리에서 활성을 꺼 주세요.</small></div>' : (y == today().substring(0, 4) ? '<div class="alert a-grn">고정 지급 회차 모두 나갔습니다 ✓</div>' : '')) +
    '<div class="btns"><button class="b-green" id="p99Batch">⚡ 회차 일괄 지급</button><button class="b-blue" id="p99One">＋ 한 건 입력</button></div><div class="btns" style="margin-top:6px"><button class="b-ghost" id="p99Who">👤 대상 관리</button><button class="b-ghost" id="p99Csv">📤 CPA 파일 (CSV)</button><button class="b-ghost" id="p99Print">🖨</button></div></div>';
  const grp = (title, rows, sub) => { if (!rows.length) return ''; return '<div class="card"><h2>' + title + '</h2>' + (sub ? '<div class="heroSub" style="margin-bottom:6px">' + sub + '</div>' : '') + '<table style="font-size:13px"><tr><th>이름 / 회사</th><th class="r">' + y + '</th><th class="r">전년</th><th class="r">최근</th></tr>' + rows.map(p => '<tr class="tap' + (p.active === false ? ' dim' : '') + '" data-who="' + esc(p.who) + '"><td><b>' + esc(p.who) + '</b> ' + kindTag(p) + (p.active === false ? ' <span class="tag" style="background:#f1f5f9;color:#94a3b8">비활성</span>' : '') + '<br><small class="muted">' + esc(p.co || '—') + '</small></td><td class="r"><b>' + money(p.total) + '</b><br><small class="muted">' + p.n + '건</small></td><td class="r muted">' + k(p.prev) + '</td><td class="r">' + (p.lastAmt ? money(p.lastAmt) + '<br><small class="muted">' + md(p.last) + '</small>' : '—') + '</td></tr>').join('') + '<tr style="font-weight:800"><td>합계</td><td class="r">' + money(sum(rows, p => p.total)) + '</td><td class="r">' + k(sum(rows, p => p.prev)) + '</td><td></td></tr></table></div>'; };
  const L = d.list.filter(p => p.total || p.prev || p.active !== false);
  h += grp('커미션 세일즈맨 — 정산 확정 때 지급액이 자동으로 적힘', L.filter(p => p.kind === '커미션'), '');
  h += grp('고정 — 15일 · 말일 반월 지급', L.filter(p => p.kind === '고정' && (p.cycle || '반월') === '반월'), '적립 %가 있는 사람은 총액의 그 비율이 오피스 보너스로 쌓이고, 나머지 금액이 1099 리스트에 적힙니다.');
  h += grp('고정 — 월 1회', L.filter(p => p.kind === '고정' && p.cycle === '월'), '');
  h += grp('고정 — 수시', L.filter(p => p.kind === '고정' && p.cycle === '수시'), '');
  h += '<div class="card"><h2>최근 지급 (탭하면 수정)</h2>' + (d.rows.length ? d.rows.slice(0, 40).map(r => '<div class="pr tap" data-p9="' + r.id + '"><div class="ct"><b>' + md(r.d) + ' ' + esc(r.who) + '</b><small>' + esc(r.co || '') + (r.note ? ' · ' + esc(r.note) : '') + (r.acc ? ' · 적립 ' + money(r.acc) : '') + '</small></div><div class="pa"><b>' + money(r.amt) + '</b></div></div>').join('') : '<div class="none">기록 없음</div>') + '</div>';
  $('mgBody').innerHTML = h;
  $('p99Batch').onclick = () => batch99(d); $('p99One').onclick = () => form99(); $('p99Who').onclick = () => payeeForm(d);
  $('p99Csv').onclick = () => { const lines = [['Year', 'Payee', 'Company', 'Total', ...MON_KO]].concat(d.list.filter(p => p.total).map(p => [y, p.who, p.co || '', p.total.toFixed(2), ...p.mon.map(v => v.toFixed(2))])); const csv = lines.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'THE_ONE_1099_' + y + '.csv'; a.click(); toast('CSV 를 내려받았습니다 — CPA 에게 이 파일만 보내세요', 'good'); };
  $('p99Print').onclick = () => printOpen('<h1>' + y + ' 1099 / COMMISSION PAID LIST</h1><div class="meta">THE ONE CORP · 출력 ' + today() + ' · 합계 <b>' + money(d.grand) + '</b> (' + d.rows.length + '건)</div><table><tr><th>이름</th><th>회사</th><th>구분</th>' + MON_KO.map(m => '<th class="r">' + m + '</th>').join('') + '<th class="r">합계</th></tr>' + d.list.filter(p => p.total).map(p => '<tr><td><b>' + esc(p.who) + '</b></td><td>' + esc(p.co || '') + '</td><td>' + (p.kind === '커미션' ? '커미션' : (p.cycle === '월' ? '월' : p.cycle === '수시' ? '' : '반월') + ' 고정') + '</td>' + p.mon.map(v => '<td class="r">' + (v ? Math.round(v).toLocaleString() : '') + '</td>').join('') + '<td class="r"><b>' + money(p.total) + '</b></td></tr>').join('') + '<tr class="fin"><td colspan="3">합계</td>' + d.monTot.map(v => '<td class="r">' + (v ? Math.round(v).toLocaleString() : '') + '</td>').join('') + '<td class="r">' + money(d.grand) + '</td></tr></table>');
  document.querySelectorAll('[data-who]').forEach(el => el.onclick = () => who99(d, el.dataset.who));
  document.querySelectorAll('[data-p9]').forEach(el => el.onclick = () => form99(d.rows.find(r => r.id === el.dataset.p9)));
}
function who99(d, who) {
  const p = d.list.find(x => x.who === who); if (!p) return; const rows = d.rows.filter(r => r.who === who);
  openModal('<h2>' + esc(who) + ' ' + kindTag(p) + '</h2><div class="heroSub">' + esc(p.co || '') + ' · ' + YEAR + ' 합계 <b>' + money(p.total) + '</b> · 전년 ' + money(p.prev) + '</div><div class="kpi" style="grid-template-columns:repeat(6,1fr)">' + p.mon.map((v, i) => { const miss = p.missing.some(m => Number(m.substring(5, 7)) === i + 1); return '<div class="' + (miss ? 'k4' : '') + '"><b>' + (v ? k(v) : '—') + '</b><span>' + (i + 1) + '월</span></div>'; }).join('') + '</div>' + (p.missing.length ? '<div class="alert a-red">안 나간 회차: ' + p.missing.map(perLabel).join(' · ') + '</div>' : '') +
    '<table style="margin-top:10px;font-size:13px">' + rows.map(r => '<tr class="tap" data-p9m="' + r.id + '"><td>' + r.d + (r.note ? ' <span class="muted">' + esc(r.note) + '</span>' : '') + '</td><td class="r"><b>' + money(r.amt) + '</b></td></tr>').join('') + '</table><div class="btns"><button class="b-ghost" id="mX">닫기</button><button class="b-blue" id="mNew">＋ ' + esc(who) + ' 지급 입력</button></div>');
  $('mX').onclick = closeModal; $('mNew').onclick = () => form99({ who, co: p.co || '', amt: p.lastAmt || '' });
  document.querySelectorAll('#mbox [data-p9m]').forEach(el => el.onclick = () => form99(rows.find(r => r.id === el.dataset.p9m)));
}
function form99(x) {
  x = x || {}; const W = {}; D.payees.forEach(p => { W[p.who] = p.co || ''; });
  openModal('<h2>' + (x.id ? '지급 수정' : '＋ 지급 입력 (한 건)') + '</h2><div class="fg"><label>받는 사람</label><input id="nW" list="whoDL" value="' + esc(x.who || '') + '" style="text-transform:uppercase" autocomplete="off"><datalist id="whoDL">' + Object.keys(W).map(w => '<option value="' + esc(w) + '">').join('') + '</datalist></div><div class="two"><div class="fg"><label>회사 (1099 받는 이름)</label><input id="nC" value="' + esc(x.co || '') + '"></div><div class="fg"><label>날짜</label>' + inputDate('nD', x.d) + '</div></div><div class="fg"><label>1099 금액 $</label><input id="nA" inputmode="decimal" value="' + (x.amt != null ? x.amt : '') + '" style="font-weight:800;text-align:right"></div><div class="fg"><label>메모</label><input id="nN" value="' + esc(x.note || '') + '"></div><div class="btns">' + (x.id ? '<button class="b-ghost" id="nDel">🗑 삭제</button>' : '') + '<button class="b-blue" id="nOk">저장</button></div>');
  $('nW').oninput = () => { const c = W[$('nW').value.toUpperCase()]; if (c) $('nC').value = c; };
  $('nOk').onclick = async () => { const who = $('nW').value.trim().toUpperCase(), amt = R2(num($('nA').value)); if (!who || !amt) return toast('이름과 금액을 넣어 주세요', 'bad'); const id = x.id || newId('N'); busy(true); try { await S.DB.set('pay1099', id, { id, d: $('nD').value, who, co: $('nC').value.trim(), amt, gross: x.gross || amt, acc: x.acc || 0, note: $('nN').value.trim(), ref: x.ref || '', createdAt: x.createdAt || new Date().toISOString() }); if (!D.payees.some(p => p.who === who)) await S.DB.set('payees', who, { id: who, who, co: $('nC').value.trim(), kind: '고정', cycle: '수시', officePct: 0, active: true }); closeModal(); toast('기록했습니다', 'good'); await refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
  if ($('nDel')) $('nDel').onclick = async () => { if (!(await confirmBox('이 지급 기록을 지울까요?', '삭제'))) return; await S.DB.del('pay1099', x.id); closeModal(); refresh(); };
}
function paidOn(rows, p, day) {
  const mine = rows.filter(r => r.who === p.who);
  if (p.cycle === '월') return mine.some(r => r.d.substring(0, 7) === day.substring(0, 7));
  if ((p.cycle || '반월') === '반월') { const half = Number(day.substring(8, 10)) <= 15 ? 'a' : 'b'; return mine.some(r => r.d.substring(0, 7) === day.substring(0, 7) && (Number(r.d.substring(8, 10)) <= 15 ? 'a' : 'b') === half); }
  return mine.some(r => r.d === day);
}
function batch99(d) {
  const L = d.list.filter(p => p.kind === '고정' && p.active !== false); if (!L.length) return toast('고정 지급 대상이 없습니다 — 👤 대상 관리', 'bad');
  openModal('<h2>⚡ 회차 일괄 지급</h2><div class="heroSub">금액은 최근 지급 총액입니다. 바뀐 사람만 고치세요. 적립 %가 있으면 총액 × % 는 오피스 보너스로, 나머지가 1099 에 적힙니다.</div><div class="fg" style="margin-top:8px"><label>지급일</label>' + inputDate('bD', d.nextDay) + '</div><table style="font-size:13px">' + L.map((p, i) => { const paid = paidOn(d.rows, p, d.nextDay); return '<tr><td style="width:28px"><input type="checkbox" id="bc' + i + '" ' + (paid || !p.gross ? '' : 'checked') + ' style="width:20px;height:20px"></td><td><b>' + esc(p.who) + '</b> ' + kindTag(p) + (paid ? ' <span class="tag t-k">이 회차 지급됨</span>' : '') + '<br><small class="muted">' + esc(p.co || '') + '</small></td><td class="r"><input id="bg' + i + '" value="' + (p.gross || '') + '" inputmode="decimal" style="width:110px;text-align:right;padding:7px"><br><small id="bn' + i + '" class="muted"></small></td></tr>'; }).join('') + '</table><div class="alert a-blu" id="bSum"></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-green" id="bOk">이대로 기록</button></div>');
  const sumUi = () => { let n = 0, s = 0, bon = 0; L.forEach((p, i) => { const g = num($('bg' + i).value), acc = p.officePct ? R2(g * Number(p.officePct) / 100) : 0; $('bn' + i).textContent = g && acc ? '1099 ' + money(g - acc) + ' · 적립 ' + money(acc) : ''; if ($('bc' + i).checked && g) { n++; s += g - acc; bon += acc; } }); $('bSum').innerHTML = '<b>' + n + '명</b> · 1099 합계 <b>' + money(s) + '</b>' + (bon ? ' · 오피스 적립 <b>' + money(bon) + '</b>' : ''); };
  L.forEach((p, i) => { $('bg' + i).oninput = sumUi; $('bc' + i).onchange = sumUi; }); $('bD').onchange = () => { L.forEach((p, i) => { if (paidOn(d.rows, p, $('bD').value)) $('bc' + i).checked = false; }); sumUi(); }; sumUi();
  $('mX').onclick = closeModal;
  $('bOk').onclick = async () => { const day = $('bD').value, ops = [], dup = []; let n = 0, s = 0, bon = 0; L.forEach((p, i) => { if (!$('bc' + i).checked) return; const g = R2(num($('bg' + i).value)); if (!g) return; if (paidOn(d.rows, p, day)) { dup.push(p.who); return; } const acc = p.officePct ? R2(g * Number(p.officePct) / 100) : 0, id = newId('N'); ops.push({ op: 'set', col: 'pay1099', id, data: { id, d: day, who: p.who, co: p.co || '', amt: R2(g - acc), gross: g, acc, note: '회차 일괄', createdAt: new Date().toISOString() } }); if (acc) ops.push({ op: 'set', col: 'bonusAcc', id: 'B' + id, data: { id: 'B' + id, d: day, sm: p.who, amt: acc, src: '고정 지급 적립', note: p.who + ' ' + day, ref: id } }); n++; s += g - acc; bon += acc; });
    if (!n) return toast('선택된 사람이 없습니다' + (dup.length ? ' (이미 있음: ' + dup.join(',') + ')' : ''), 'bad'); if (!(await confirmBox(n + '명 · 1099 합계 ' + money(s) + (bon ? ' · 오피스 적립 ' + money(bon) : '') + '\n' + day + ' 지급으로 기록할까요?', '기록'))) return;
    busy(true); try { await S.DB.batch(ops); closeModal(); toast(n + '명 ' + money(s) + ' 기록' + (bon ? ' · 적립 ' + money(bon) : '') + (dup.length ? ' · 이미 있음: ' + dup.join(',') : ''), 'good'); await refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}
function payeeForm(d) {
  const L = d.list.filter(p => D.payees.some(q => q.who === p.who)), ss = (id, opts, v) => sel(id, opts, v, 'style="padding:6px;font-size:12.5px"');
  openModal('<h2>👤 1099 대상 관리</h2><div class="heroSub" style="margin-bottom:8px">커미션 = 정산 확정 때 자동 기록. 고정 = 회차 일괄 지급 대상. 적립 % = 총액 중 오피스 보너스로 떼는 비율.</div><div style="overflow:auto"><table style="font-size:12.5px"><tr><th>이름</th><th>회사</th><th>구분</th><th>주기</th><th class="r">적립%</th><th>활성</th></tr>' + L.map((p, i) => '<tr><td><b>' + esc(p.who) + '</b></td><td><input id="pc' + i + '" value="' + esc(p.co || '') + '" style="padding:6px;font-size:12.5px;width:120px"></td><td>' + ss('pk' + i, ['고정', '커미션'], p.kind) + '</td><td>' + ss('py' + i, ['반월', '월', '수시'], p.cycle || '반월') + '</td><td><input id="po' + i + '" value="' + (p.officePct || '') + '" inputmode="decimal" style="padding:6px;font-size:12.5px;width:50px;text-align:right"></td><td><input type="checkbox" id="pa' + i + '" ' + (p.active !== false ? 'checked' : '') + ' style="width:18px;height:18px"></td></tr>').join('') + '</table></div>' +
    '<div class="fg" style="margin-top:10px"><label>새 대상</label><div class="two"><input id="pnW" placeholder="이름 (세일즈맨 코드면 커미션 자동)" style="text-transform:uppercase"><input id="pnC" placeholder="회사 (1099 이름)"></div><div class="two" style="margin-top:6px">' + ss('pnK', ['고정', '커미션'], '고정') + ss('pnY', ['반월', '월', '수시'], '반월') + '</div></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">전부 저장</button></div>');
  $('mX').onclick = closeModal;
  $('mOk').onclick = async () => { const ops = []; L.forEach((p, i) => { const o = { id: p.who, who: p.who, co: $('pc' + i).value.trim(), kind: $('pk' + i).value, cycle: $('py' + i).value, officePct: num($('po' + i).value), active: $('pa' + i).checked }; ops.push({ op: 'set', col: 'payees', id: p.who, data: Object.assign({}, D.payees.find(q => q.who === p.who) || {}, o) }); }); const nw = $('pnW').value.trim().toUpperCase(); if (nw) ops.push({ op: 'set', col: 'payees', id: nw, data: { id: nw, who: nw, co: $('pnC').value.trim(), kind: $('pnK').value, cycle: $('pnY').value, officePct: 0, active: true } }); busy(true); try { await S.DB.batch(ops); closeModal(); toast(ops.length + '명 저장', 'good'); await refresh(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}

/* ============================================================
 *  🎁 오피스 보너스
 * ============================================================ */
function paintBon() {
  const d = bonusStat();
  let h = '<div class="card"><h2>🎁 오피스 보너스 — 남은 적립금</h2><div class="hero">' + money(d.avail) + '</div><div class="heroSub">적립 ' + money(d.pool) + ' − 지급 ' + money(d.paid) + ' · 세일즈맨 정산 때 OFFICE 공제가 자동으로 쌓입니다</div>' +
    '<div class="histstrip" style="margin-top:8px">' + d.byQ.map(q => '<div><b>' + k(q.amt) + '</b>' + esc(q.q) + '</div>').join('') + '</div><div class="btns"><button class="b-green" id="boDist">🎁 배분 실행</button><button class="b-ghost" id="boSplit">배분표 수정</button><button class="b-ghost" id="boAdd">＋ 수동 적립</button></div></div>';
  h += '<div class="two-col"><div class="card"><h2>세일즈맨별 적립</h2><table style="font-size:13px">' + (d.bySm.map(s => '<tr><td class="nm">' + esc(s.sm) + '<br><small class="muted">' + s.n + '건 · 마지막 ' + md(s.last) + '</small></td><td class="r"><b>' + money(s.amt) + '</b></td></tr>').join('') || '<tr><td class="none">없음</td></tr>') + '</table></div>' +
    '<div class="card"><h2>지금 배분하면 (배분표 기준)</h2>' + (d.preview.length ? '<table style="font-size:13px"><tr><th>그룹</th><th>직원</th><th class="r">비율</th><th class="r">금액</th></tr>' + d.preview.map(p => '<tr><td>' + esc(p.grp) + '</td><td><b>' + esc(p.who) + '</b></td><td class="r">' + pct2(p.pct) + '</td><td class="r">' + money(p.amt) + '</td></tr>').join('') + '</table>' : '<div class="none">배분표가 비어 있습니다 — 배분표 수정</div>') + '</div></div>';
  h += '<div class="card"><h2>지급 이력</h2>' + (d.rounds.length ? d.rounds.map(r => '<div class="pr"><div class="ct"><b>' + esc(r.d) + ' ' + esc(r.round || '') + '</b><small>' + (r.rows || []).map(x => esc(x.who) + ' ' + money(x.amt)).join(' · ') + '</small></div><div class="pa"><b>' + money(r.sum) + '</b><small>' + r.n + '명</small></div></div>').join('') : '<div class="none">아직 배분한 적이 없습니다</div>') + '</div>';
  h += '<div class="card"><h2>적립 내역 (최신순 · 탭하면 수정)</h2>' + sortBy(D.acc.filter(a => !a.void), a => a.d, true).slice(0, 80).map(a => '<div class="pr tap" data-ba="' + a.id + '"><div class="ct"><b>' + md(a.d) + ' ' + esc(a.sm) + ' <span class="tag ' + (a.src === '정산 확정' ? 't-k' : 't-f') + '">' + esc(a.src || '수동') + '</span></b>' + (a.note ? '<small>' + esc(a.note) + '</small>' : '') + '</div><div class="pa"><b>' + money(a.amt) + '</b></div></div>').join('') + '</div>';
  $('mgBody').innerHTML = h;
  $('boAdd').onclick = () => bonForm(); document.querySelectorAll('[data-ba]').forEach(el => el.onclick = () => bonForm(D.acc.find(a => a.id === el.dataset.ba)));
  $('boSplit').onclick = () => { const rows = (D.split.rows || []).concat([{}, {}, {}]); openModal('<h2>배분표</h2><div class="heroSub">그룹 몫(%)으로 적립금을 먼저 나누고, 그룹 안에서 직원 비율(%)로 나눕니다. 빈 줄은 무시.</div><table style="font-size:13px"><tr><th>그룹</th><th class="r">그룹 몫%</th><th>직원</th><th class="r">그룹 내%</th></tr>' + rows.map((x, i) => '<tr><td><input id="sg' + i + '" value="' + esc(x.grp || '') + '" style="width:44px;padding:6px;text-align:center"></td><td><input id="ss' + i + '" value="' + (x.share != null ? x.share : '') + '" style="width:60px;padding:6px;text-align:right"></td><td><input id="sw' + i + '" value="' + esc(x.who || '') + '" style="padding:6px;text-transform:uppercase"></td><td><input id="sp' + i + '" value="' + (x.pct != null ? x.pct : '') + '" style="width:60px;padding:6px;text-align:right"></td></tr>').join('') + '</table><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">저장</button></div>'); $('mX').onclick = closeModal; $('mOk').onclick = async () => { const out = []; rows.forEach((x, i) => { if ($('sw' + i).value.trim()) out.push({ grp: $('sg' + i).value.trim() || 'A', share: num($('ss' + i).value) || 100, who: $('sw' + i).value.trim().toUpperCase(), pct: num($('sp' + i).value) || 0 }); }); await S.DB.set('bonusSplit', 'main', { id: 'main', rows: out, updatedAt: new Date().toISOString() }); closeModal(); toast('배분표 저장', 'good'); refresh(); }; };
  $('boDist').onclick = () => { if (d.avail <= 0) return toast('남은 적립금이 없습니다', 'bad'); if (!d.preview.length) return toast('배분표를 먼저 만드세요', 'bad'); openModal('<h2>🎁 배분 실행</h2><div class="heroSub">남은 적립금 <b>' + money(d.avail) + '</b> 을 배분표대로 나눕니다. 금액은 고칠 수 있습니다.</div><div class="two" style="margin-top:8px"><div class="fg"><label>지급일</label>' + inputDate('dD') + '</div><div class="fg"><label>회차 이름</label><input id="dR" value="' + today().substring(0, 4) + ' ' + (Number(today().substring(5, 7)) <= 6 ? '상반기' : '하반기') + '"></div></div><table style="font-size:13px">' + d.preview.map((p, i) => '<tr><td>' + esc(p.grp) + ' <b>' + esc(p.who) + '</b><br><small class="muted">' + pct2(p.pct) + '</small></td><td class="r"><input id="da' + i + '" value="' + p.amt + '" inputmode="decimal" style="width:120px;text-align:right;padding:7px"></td></tr>').join('') + '</table><div class="alert a-blu" id="dSum"></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-green" id="mOk">이대로 기록</button></div>');
    const sumUi = () => { const s = d.preview.reduce((a, p, i) => a + num($('da' + i).value), 0), left = R2(d.avail - s); $('dSum').innerHTML = '배분 합계 <b>' + money(s) + '</b> · 배분 후 남는 돈 <b class="' + (left < -0.01 ? 'warn' : '') + '">' + money(left) + '</b>'; }; d.preview.forEach((p, i) => { $('da' + i).oninput = sumUi; }); sumUi(); $('mX').onclick = closeModal;
    $('mOk').onclick = async () => { const rows = d.preview.map((p, i) => ({ who: p.who, pct: p.pct, amt: R2(num($('da' + i).value)) })).filter(r => r.amt > 0), s = sum(rows, r => r.amt); if (!rows.length) return toast('금액이 없습니다', 'bad'); if (!(await confirmBox(rows.length + '명에게 ' + money(s) + ' 배분을 기록할까요?', '기록'))) return; const id = newId('BD'); await S.DB.set('bonusDist', id, { id, d: $('dD').value, round: $('dR').value.trim(), rows, n: rows.length, sum: s, createdBy: S.user.email, createdAt: new Date().toISOString() }); closeModal(); toast(rows.length + '명에게 ' + money(s) + ' 배분 기록', 'good'); refresh(); }; };
}
function bonForm(x) {
  x = x || {};
  openModal('<h2>' + (x.id ? '적립 수정' : '＋ 수동 적립') + '</h2><div class="two"><div class="fg"><label>세일즈맨 / 출처</label><input id="bS" value="' + esc(x.sm || '') + '" style="text-transform:uppercase"></div><div class="fg"><label>날짜</label>' + inputDate('bD', x.d) + '</div></div><div class="fg"><label>금액 $</label><input id="bA" inputmode="decimal" value="' + (x.amt != null ? x.amt : '') + '"></div><div class="fg"><label>메모</label><input id="bN" value="' + esc(x.note || '') + '"></div><div class="btns">' + (x.id ? '<button class="b-ghost" id="bDel">🗑 삭제</button>' : '') + '<button class="b-blue" id="bOk">저장</button></div>');
  $('bOk').onclick = async () => { const a = R2(num($('bA').value)); if (!a) return toast('금액을 넣어 주세요', 'bad'); const id = x.id || newId('B'); await S.DB.set('bonusAcc', id, { id, d: $('bD').value, sm: $('bS').value.trim().toUpperCase(), amt: a, src: x.src || '수동', note: $('bN').value.trim(), ref: x.ref || '' }); closeModal(); toast('저장', 'good'); refresh(); };
  if ($('bDel')) $('bDel').onclick = async () => { if (!(await confirmBox('이 적립을 지울까요?', '삭제'))) return; await S.DB.del('bonusAcc', x.id); closeModal(); refresh(); };
}

/* ============================================================
 *  📈 회사 매출 — sales/{year} = { year, rows: [{ label, grp, m: [12] }] }
 * ============================================================ */
const GRPS = [['total', 'TOTAL SALES'], ['item', '품목'], ['sm', '세일즈맨'], ['state', '주 (State)'], ['cash', '현금 흐름']];
/** 회사 매출 — 인보이스에서 자동 계산 (월별 요약 salesM). "2026 The One sales amount" 시트와 같은 모양:
 *    아이템별 (JEWELRY 한 줄 + 그 외 제품 이름별) · 세일즈맨별 · STATE 별 · 연도 비교. 현금 흐름(은행)만 직접 입력(sales/{year}).
 *  인보이스가 하나도 없는 해는 예전에 손으로 넣은 숫자를 그대로 보여 줌 */
async function salesDoc(y) {
  if (D.sales[y]) return D.sales[y];
  const man = (await S.DB.get('sales', String(y)).catch(() => null)) || { id: String(y), year: y, rows: [] };
  const nowYm = today().substring(0, 7), yms = MON_KO.map((x, i) => y + '-' + String(i + 1).padStart(2, '0'));
  const docs = await Promise.all(yms.map(k => k > nowYm ? null : salesMonth(S, k).catch(() => null)));
  const z = () => Array(12).fill(0), G = { item: {}, sm: {}, state: {} }, total = z();
  const add = (g, label, i, v) => { (G[g][label] = G[g][label] || z())[i] = R2(G[g][label][i] + (v || 0)); };
  let n = 0;
  docs.forEach((d, i) => {
    if (!d || !d.n) return; n += d.n; total[i] = R2(d.total || 0);
    Object.keys(d.bySm || {}).forEach(sm => Object.keys(d.bySm[sm]).forEach(t => add('sm', sm === '—' ? 'NO SALES REP' : sm, i, d.bySm[sm][t].total)));
    Object.keys(d.byItem || {}).forEach(it => add('item', it === '(P)' ? '그 외 (이전 시스템 · 품목 모름)' : it, i, d.byItem[it]));
    Object.keys(d.byState || {}).forEach(st => add('state', st, i, d.byState[st]));
  });
  let out;
  if (n) out = { year: y, auto: true, n, man, total, G, cash: man.rows.filter(r => r.grp === 'cash') };
  else {   // 예전 손 입력 숫자
    const T = man.rows.find(r => r.grp === 'total'), g2 = { item: {}, sm: {}, state: {} };
    man.rows.forEach(r => { if (g2[r.grp]) g2[r.grp][r.label] = r.m.slice(); });
    out = { year: y, auto: false, n: 0, man, total: T ? T.m.slice() : z(), G: g2, cash: man.rows.filter(r => r.grp === 'cash') };
  }
  out.rows = [{ label: 'TOTAL SALES', grp: 'total', m: out.total }];   // 요약 화면 카드용
  D.sales[y] = out; return out;
}
let SV = 'item';   // 매출 화면 보기: item 아이템별 · sm 세일즈맨별 · state STATE 별 · cmp 연도 비교
const MON_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const nf = v => v ? Math.round(v).toLocaleString('en-US') : '';
async function paintSales() {
  $('mgBody').innerHTML = '<div class="load">매출 계산 중… (처음 한 번은 인보이스를 읽어 요약을 만듭니다)</div>';
  const d = await salesDoc(YEAR), pv = await salesDoc(YEAR - 1), m = MON;
  const T = d.total, PT = pv.total, cur = T[m], prevM = m > 0 ? T[m - 1] : 0, ly = PT[m], ytd = sum(T.slice(0, m + 1)), lyYtd = sum(PT.slice(0, m + 1));
  const jw = (d.G.item.JEWELRY || [])[m] || 0;
  let h = '<div class="chips">' + MON_KO.map((x, i) => '<button class="' + (i === m ? 'on' : '') + (!T[i] ? ' dim' : '') + '" data-mon="' + i + '">' + x + '</button>').join('') + '</div>';
  h += '<div class="card"><h2>📈 ' + YEAR + '년 ' + MON_KO[m] + ' TOTAL SALES</h2><div class="hero">' + money(cur) + '</div><div class="heroSub">전월 ' + (prevM ? money(prevM) + ' ' + pct(cur, prevM) : '—') + ' · 전년 같은 달 ' + (ly ? money(ly) + ' ' + pct(cur, ly) : '—') + (cur ? ' · 주얼리 ' + Math.round(jw / cur * 100) + '%' : '') + '</div>' +
    '<div class="kpi"><div><b>' + k(ytd) + '</b><span>YTD (1~' + (m + 1) + '월)</span></div><div><b>' + k(lyYtd) + '</b><span>전년 YTD</span></div><div><b>' + (lyYtd ? pct(ytd, lyYtd) : '—') + '</b><span>전년比</span></div><div><b>' + k(sum(T)) + '</b><span>' + YEAR + ' 합계</span></div></div>' +
    (d.auto ? '<div class="muted" style="margin-top:6px">📄 인보이스 ' + d.n.toLocaleString() + '장에서 자동 계산 — 앱에서 인보이스를 발행 · VOID 하면 바로 반영 <button class="b-ghost b-sm" id="slRe">↻ 다시 계산</button></div>' : '<div class="alert a-amb" style="margin-top:6px">이 해는 앱에 인보이스가 없어 예전에 손으로 넣은 숫자입니다. 인보이스를 가져오면 자동으로 바뀝니다.</div>') + '</div>';
  h += '<div class="seg" style="margin:0 0 8px;flex-wrap:wrap">' + [['item', '📦 아이템별'], ['sm', '👤 세일즈맨별'], ['state', '🗺 STATE 별'], ['cmp', '📊 연도 비교']].map(t => '<button class="' + (SV === t[0] ? 'on' : '') + '" data-sv="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
  /* 시트 모양 표 — 구분 · JAN~DEC · 올해 합계 · 작년 합계 (선택한 달 강조) */
  const grid = (title, rows, note) => {
    const head = '<tr><th class="st">' + YEAR + '</th>' + MON_EN.map((x, i) => '<th class="r' + (i === m ? ' on' : '') + '">' + x + '</th>').join('') + '<th class="r">Total ' + YEAR + '</th><th class="r">Total ' + (YEAR - 1) + '</th></tr>';
    const tr = (label, a, b, cls) => '<tr class="' + (cls || '') + '"><td class="st">' + esc(label) + '</td>' + a.map((v, i) => '<td class="r' + (i === m ? ' on' : '') + (v < 0 ? ' warn' : '') + '">' + nf(v) + '</td>').join('') + '<td class="r"><b>' + nf(sum(a)) + '</b></td><td class="r muted">' + nf(b ? sum(b) : 0) + '</td></tr>';
    return '<div class="card"><h2>' + title + '</h2>' + (note ? '<div class="muted" style="margin-bottom:6px">' + note + '</div>' : '') + '<div class="sgrid"><table>' + head + rows.map(r => tr(r[0], r[1], r[2], r[3])).join('') + '</table></div></div>';
  };
  const block = (g, title, note, first) => {
    const keys = Object.keys(d.G[g]).filter(x => sum(d.G[g][x]) || (pv.G[g][x] && sum(pv.G[g][x])));
    keys.sort((a, b) => (first && a === first ? -1 : first && b === first ? 1 : 0) || sum(d.G[g][b] || []) - sum(d.G[g][a] || []));
    const rows = keys.map(x => [x, d.G[g][x] || Array(12).fill(0), pv.G[g][x]]);
    const totRow = ['TOTAL SALES', T, PT, 'tot'];
    return grid(title, [totRow].concat(rows), note);
  };
  if (SV === 'item') h += block('item', '📦 아이템별 매출', '주얼리는 JEWELRY 한 줄, 그 외 제품은 제품(Level 1) 이름별 — 인보이스 줄 금액을 할인 · 배송비까지 맞춰 나눕니다. 이전 시스템에서 가져온 인보이스는 품목 줄이 없어 A · W 는 JEWELRY, P 는 "그 외" 로 잡힙니다.', 'JEWELRY');
  else if (SV === 'sm') h += block('sm', '👤 세일즈맨별 매출', '인보이스의 세일즈맨 기준. 담당이 없으면 NO SALES REP.');
  else if (SV === 'state') h += block('state', '🗺 STATE 별 매출', '거래처 주소의 주(State) 기준 — 주가 비어 있는 거래처는 "—".');
  else {
    const p2 = await salesDoc(YEAR - 2), jwOf = x => (x.G.item.JEWELRY || Array(12).fill(0));
    h += grid('📊 TOTAL SALES — 연도 비교', [[String(YEAR - 2), p2.total], [String(YEAR - 1), PT], [String(YEAR), T, null, 'tot']].map(r => [r[0], r[1], null, r[3]]));
    h += grid('💍 JEWELRY — 연도 비교', [[String(YEAR - 2), jwOf(p2)], [String(YEAR - 1), jwOf(pv)], [String(YEAR), jwOf(d), null, 'tot']].map(r => [r[0], r[1], null, r[3]]));
    const sms = Array.from(new Set(Object.keys(d.G.sm).concat(Object.keys(pv.G.sm)))).sort((a, b) => sum(d.G.sm[b] || []) - sum(d.G.sm[a] || []));
    h += grid('👤 세일즈맨 — ' + (YEAR - 1) + ' · ' + YEAR, [].concat(...sms.map(x => [[x + ' ' + (YEAR - 1), pv.G.sm[x] || Array(12).fill(0), null, 'sub'], [x + ' ' + YEAR, d.G.sm[x] || Array(12).fill(0), null, 'tot']])));
  }
  /* 현금 흐름 (은행) — 직접 입력 */
  const cash = d.cash || [];
  h += '<div class="card"><h2>🏦 현금 흐름 (은행 · Statement)</h2>' + (cash.length ? '<div class="sgrid"><table><tr><th class="st">' + YEAR + '</th>' + MON_EN.map((x, i) => '<th class="r' + (i === m ? ' on' : '') + '">' + x + '</th>').join('') + '<th class="r">Total</th></tr>' + cash.map(r => '<tr><td class="st">' + esc(r.label) + '</td>' + r.m.map((v, i) => '<td class="r' + (i === m ? ' on' : '') + (v < 0 ? ' warn' : '') + '">' + nf(v) + '</td>').join('') + '<td class="r"><b>' + nf(sum(r.m)) + '</b></td></tr>').join('') + '</table></div>' : '<div class="muted">Statement Deposit · Statement Expense 같은 은행 숫자는 직접 넣습니다.</div>') +
    '<div class="btns"><button class="b-ghost" id="slEdit">✏️ ' + MON_KO[m] + (d.auto ? ' 현금 흐름 입력' : ' 숫자 입력') + '</button></div></div>';
  $('mgBody').innerHTML = h;
  document.querySelectorAll('[data-mon]').forEach(el => el.onclick = () => { MON = Number(el.dataset.mon); paintSales(); });
  document.querySelectorAll('[data-sv]').forEach(el => el.onclick = () => { SV = el.dataset.sv; paintSales(); });
  /* 폰에서는 고른 달이 보이게 표를 옆으로 밀어 둠 */
  document.querySelectorAll('.sgrid').forEach(g => { const th = g.querySelector('th.on'), st = g.querySelector('th.st'); if (th && st) g.scrollLeft = Math.max(0, th.offsetLeft - st.offsetWidth - 60); });
  $('slEdit').onclick = () => salesEdit(d.man || d);
  if ($('slRe')) $('slRe').onclick = async () => { busy(true); try { const yms = MON_KO.map((x, i) => YEAR + '-' + String(i + 1).padStart(2, '0')).filter(kk => kk <= today().substring(0, 7)); await rebuildSalesM(S, yms); delete D.sales[YEAR]; toast('다시 계산했습니다', 'good'); } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); } busy(false); paintSales(); };
}
function salesEdit(d) {
  const m = MON, rows = d.rows.slice(), autoOn = D.sales[YEAR] && D.sales[YEAR].auto;
  if (!autoOn) {
    if (!rows.some(r => r.grp === 'total')) rows.unshift({ label: 'TOTAL SALES', grp: 'total', m: Array(12).fill(0) });
    S.sms.filter(s => s.active !== false).forEach(s => { if (!rows.some(r => r.grp === 'sm' && r.label.toUpperCase() === s.code)) rows.push({ label: s.code, grp: 'sm', m: Array(12).fill(0) }); });
  }
  let h = '<h2>✏️ ' + YEAR + '년 ' + MON_KO[m] + ' 숫자 입력</h2><div class="heroSub">바뀐 칸만 저장됩니다. 항목 추가는 아래에서.</div>';
  GRPS.forEach(([g, name]) => { const L = rows.filter(r => r.grp === g); if (!L.length) return; h += '<div class="dedSub">' + name + '</div><table style="font-size:13px">' + L.map(r => '<tr><td>' + esc(r.label) + '</td><td class="r"><input data-se="' + esc(r.grp + '|' + r.label) + '" value="' + (r.m[m] || '') + '" inputmode="decimal" style="width:130px;text-align:right;padding:6px"></td></tr>').join('') + '</table>'; });
  h += '<div class="dedSub">＋ 항목 추가</div><div class="two">' + sel('naG', GRPS.filter(g => g[0] !== 'total'), 'item') + '<input id="naL" placeholder="항목 이름 (예: WAX · FL · CASH IN)" style="text-transform:uppercase"></div><div class="btns"><button class="b-ghost" id="mX">취소</button><button class="b-blue" id="mOk">저장</button></div>';
  openModal(h); $('mX').onclick = closeModal;
  $('mOk').onclick = async () => { document.querySelectorAll('[data-se]').forEach(inp => { const [g, label] = inp.dataset.se.split('|'); let r = rows.find(x => x.grp === g && x.label === label); if (!r) { r = { label, grp: g, m: Array(12).fill(0) }; rows.push(r); } r.m[m] = R2(num(inp.value)); }); const nl = $('naL').value.trim().toUpperCase(); if (nl && !rows.some(r => r.label.toUpperCase() === nl)) rows.push({ label: nl, grp: $('naG').value, m: Array(12).fill(0) }); busy(true); try { const doc = { id: String(YEAR), year: YEAR, rows, updatedAt: new Date().toISOString() }; await S.DB.set('sales', String(YEAR), doc); delete D.sales[YEAR]; closeModal(); toast('저장했습니다', 'good'); paintSales(); } catch (e) { toast('실패: ' + e.message, 'bad'); } busy(false); };
}
