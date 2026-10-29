/* ============================================================
 *  🏦 은행 명세서 — 올리면 현금 흐름이 자동으로 (bank/{id})
 *    · 어느 은행 파일이든: 날짜 · 내용 · 금액(또는 입금/출금 두 열) · 잔액 열을 머리글로 알아봄 (CSV · 엑셀)
 *    · 줄마다 분류(cat): 고객 입금(체크 · 현금) · Zelle · ACH 입금 · 카드 매출 입금 · 공장 송금 · 급여 · 세금 · 운송 · 임대 · 카드 결제 · 은행 수수료 · 바운스 · 이체 · 기타
 *      기본 글자 규칙 + 관리자가 고친 규칙(settings.app.bankRules = [{ kw, cat }]) · 줄에서 직접 바꾸면 "이 글자는 항상 이 분류" 로 저장 가능
 *    · 같은 줄(날짜 · 내용 · 금액 · 잔액)은 같은 id → 다시 올려도 겹치지 않음
 *    · 경영 → 🏦 은행: 월별 입금 · 출금 · 분류별 합 · 앱 수금(체크 · 현금 · COD · 카드 · ACH)과 대조 · 공장 송금과 대조 · 분류 안 된 줄
 *    · 오너 · 관리자 홈 현금 흐름 칸에 "🏦 은행 실제 입금 · 출금 · 잔액"
 * ============================================================ */
import { $, esc, money, k, R2, num, today, md, toast, busy, openModal, closeModal, confirmBox, sortBy, groupBy, sum, sel, bt, bi } from './ui.js';

let S = null;
export function register(state) { S = state; }
export const CATS = [['dep', '🧾 고객 입금 (체크 · 현금)', '#15803d', 'in'], ['zelle', '📲 Zelle 입금', '#15803d', 'in'], ['achin', '🏦 ACH 입금', '#15803d', 'in'], ['card', '💳 카드 매출 입금', '#15803d', 'in'], ['otherin', '➕ 기타 입금', '#15803d', 'in'],
  ['factory', '🏭 공장 송금', '#b91c1c', 'out'], ['payroll', '👥 급여 · 커미션', '#b91c1c', 'out'], ['tax', '🏛 세금', '#b91c1c', 'out'], ['ship', '🚚 운송 (UPS · 화물)', '#b91c1c', 'out'], ['rent', '🏢 임대 · 공과금', '#b91c1c', 'out'], ['ccpay', '💳 카드 대금 결제', '#b91c1c', 'out'], ['fee', '🏦 은행 수수료', '#b91c1c', 'out'], ['bounce', '↩️ 바운스 (Returned)', '#b91c1c', 'out'], ['xfer', '🔁 계좌 이체', '#64748b', ''], ['other', '❓ 기타 · 분류 전', '#64748b', '']];
export const catName = c => (CATS.find(x => x[0] === c) || CATS[CATS.length - 1])[1];
const DEFAULT_RULES = [['RETURNED ITEM', 'bounce'], ['RETURN ITEM', 'bounce'], ['NSF', 'bounce'], ['CHARGEBACK', 'bounce'], ['ZELLE', 'zelle'], ['SQUARE', 'card'], ['STRIPE', 'card'], ['CLOVER', 'card'], ['MERCHANT', 'card'], ['BANKCARD', 'card'], ['CARD SETTLEMENT', 'card'], ['PAYPAL', 'card'],
  ['WIRE', 'factory'], ['INTL', 'factory'], ['FOREIGN', 'factory'], ['SHENGXING', 'factory'], ['ZHEJIANG', 'factory'], ['QINGDAO', 'factory'], ['QUINGDAO', 'factory'], ['JUDA', 'factory'], ['RUMINO', 'factory'], ['JINRUIJIA', 'factory'],
  ['PAYROLL', 'payroll'], ['ADP', 'payroll'], ['GUSTO', 'payroll'], ['PAYCHEX', 'payroll'], ['IRS', 'tax'], ['USATAXPYMT', 'tax'], ['TAX', 'tax'], ['DEPT OF REV', 'tax'], ['FL DEPT', 'tax'],
  ['UPS', 'ship'], ['FEDEX', 'ship'], ['USPS', 'ship'], ['FREIGHT', 'ship'], ['RENT', 'rent'], ['DUKE ENERGY', 'rent'], ['FPL', 'rent'], ['COMCAST', 'rent'], ['SPECTRUM', 'rent'], ['AT&T', 'rent'],
  ['AMEX', 'ccpay'], ['AMERICAN EXPRESS', 'ccpay'], ['CHASE CARD', 'ccpay'], ['CAPITAL ONE', 'ccpay'], ['CITI CARD', 'ccpay'], ['SERVICE FEE', 'fee'], ['MONTHLY FEE', 'fee'], ['WIRE FEE', 'fee'], ['ANALYSIS', 'fee'],
  ['TRANSFER', 'xfer'], ['ONLINE TRANSFER', 'xfer'], ['XFER', 'xfer'], ['DEPOSIT', 'dep'], ['MOBILE DEPOSIT', 'dep'], ['REMOTE DEPOSIT', 'dep'], ['CHECK DEPOSIT', 'dep'], ['CASH DEPOSIT', 'dep'], ['ACH CREDIT', 'achin'], ['ACH', 'achin']];
export function rules() { const mine = (S && S.settings && Array.isArray(S.settings.bankRules)) ? S.settings.bankRules.map(r => [String(r.kw || '').toUpperCase(), r.cat]) : []; return mine.concat(DEFAULT_RULES); }
/* 글자 규칙은 단어 경계로 — 'NSF' 가 TRANSFER 안에서, 'ACH' 가 MACHINE 안에서 걸리지 않게 */
const RX = {}; const hit = (U, kw) => { let r = RX[kw]; if (!r) { r = RX[kw] = new RegExp('(^|[^A-Z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Z0-9]|$)'); } return r.test(U); };
export function categorize(desc, amt) {
  const U = String(desc || '').toUpperCase();
  for (const [kw, cat] of rules()) { if (kw && hit(U, kw)) { if (amt > 0 && ['factory', 'payroll', 'tax', 'ship', 'rent', 'ccpay', 'fee'].includes(cat)) continue; if (amt < 0 && ['dep', 'zelle', 'achin', 'card', 'otherin'].includes(cat)) { if (cat === 'achin' && amt < 0) return 'other'; continue; } return cat; } }
  return amt > 0 ? 'otherin' : 'other';
}
const sv = v => String(v == null ? '' : v).trim();
const toNum = v => { if (v == null || v === '') return null; if (typeof v === 'number') return v; let s = String(v).trim(); const neg = /^\(.*\)$/.test(s) || /-/.test(s); s = s.replace(/[^0-9.]/g, ''); if (!s) return null; const n = Number(s); return isNaN(n) ? null : (neg ? -n : n); };
export function dstr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return ''; return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().substring(0, 10); }
  const s = sv(v); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'); }
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/); if (m) return today().substring(0, 4) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return '';
}
/** 은행 명세서인지 + 열 찾기 — 머리글 줄에 날짜 + (금액 | 입금/출금 | credit/debit) + 내용 */
export function findHeader(rows) {
  for (let i = 0; i < Math.min(15, (rows || []).length); i++) {
    const h = (rows[i] || []).map(x => sv(x).toLowerCase());
    const f = re => h.findIndex(x => re.test(x));
    const desc1 = f(/description|memo|payee|narrative|내용|적요/), desc2 = f(/^details$|transaction$/);   /* 체이스 CSV 의 Details 는 종류(CREDIT/DEBIT) — Description 이 있으면 그것 */
    const ix = { d: f(/^(posting |post |transaction |trans |value )?date$|^posted$|^date posted$|날짜|거래일/), desc: desc1 >= 0 ? desc1 : desc2, amt: f(/^amount$|^amt$|transaction amount|금액/), cr: f(/^credit|^deposit|^deposits|^credits?$|^in$|입금|^money in/), db: f(/^debit|^withdrawal|^withdrawals|^debits?$|^out$|출금|^money out/), bal: f(/balance|잔액/), typ: f(/^type$|^details$|dr\/cr|구분/) };
    if (ix.d >= 0 && ix.desc >= 0 && (ix.amt >= 0 || (ix.cr >= 0 && ix.db >= 0))) return { hi: i, ix };
  }
  return null;
}
export const looksLikeBank = rows => !!findHeader(rows);
/** rows(aoa) → { rows: [{ id, d, ym, desc, amt, bal, cat }], from, to, in, out, bal, warn } — amt: 입금 + · 출금 − */
export function parseBank(rows, fileName) {
  const H = findHeader(rows); if (!H) throw new Error('은행 명세서 머리글(날짜 · 내용 · 금액 또는 입금/출금)을 찾지 못했습니다');
  const { hi, ix } = H, out = [], warn = []; const seen = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.some(c => sv(c) !== '')) continue;
    const d = dstr(r[ix.d]); if (!d) { if (sv(r[ix.desc])) warn.push((i + 1) + '행: 날짜를 읽지 못함 (' + sv(r[ix.d]) + ')'); continue; }
    const desc = sv(r[ix.desc]); let amt = null;
    if (ix.amt >= 0) { amt = toNum(r[ix.amt]); if (amt != null && ix.typ >= 0) { const ty = sv(r[ix.typ]).toLowerCase(); if (/debit|withdraw|dr\b|출금/.test(ty) && amt > 0) amt = -amt; } }
    else { const cr = toNum(r[ix.cr]), db = toNum(r[ix.db]); if (cr != null && cr !== 0) amt = Math.abs(cr); else if (db != null && db !== 0) amt = -Math.abs(db); }
    if (amt == null || amt === 0) continue;
    amt = R2(amt); const bal = ix.bal >= 0 ? toNum(r[ix.bal]) : null;
    let id = 'BK' + d.replace(/-/g, '') + '-' + hash(desc + '|' + amt + '|' + (bal == null ? '' : bal)); if (seen[id]) { seen[id]++; id += '-' + seen[id]; } else seen[id] = 1;
    out.push({ id, d, ym: d.substring(0, 7), desc, amt, bal: bal == null ? null : R2(bal), cat: categorize(desc, amt), file: fileName || '' });
  }
  out.sort((a, b) => a.d.localeCompare(b.d));
  return { rows: out, from: out.length ? out[0].d : '', to: out.length ? out[out.length - 1].d : '', in: R2(sum(out.filter(x => x.amt > 0), x => x.amt)), out: R2(-sum(out.filter(x => x.amt < 0), x => x.amt)), bal: (() => { const L = out.filter(x => x.bal != null); return L.length ? L[L.length - 1].bal : null; })(), warn };
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }

/* ---------- 관리 → 가져오기 ---------- */
export async function bankFile(file, out, readBook, aoa, parseCsv, csvDelim) {
  out.innerHTML = '<div class="load">읽는 중…</div>';
  try {
    let rows;
    if (/\.(csv|txt)$/i.test(file.name)) { const text = (await file.text()).replace(/^﻿/, ''); rows = parseCsv(text, csvDelim(text.split(/\r?\n/)[0] || '')); }
    else { const { XLSX, wb } = await readBook(file); rows = null; for (const n of wb.SheetNames) { const a = aoa(XLSX, wb, n) || []; if (looksLikeBank(a)) { rows = a; break; } } if (!rows) throw new Error('은행 명세서 탭을 찾지 못했습니다'); }
    const P = parseBank(rows, file.name);
    if (!P.rows.length) throw new Error('읽을 줄이 없습니다');
    const existing = await S.DB.list('bank', { where: [['ym', 'in', Array.from(new Set(P.rows.map(x => x.ym))).slice(0, 10)]] }).catch(() => []);
    const have = new Set(existing.map(x => x.id)), fresh = P.rows.filter(x => !have.has(x.id)), byCat = groupBy(P.rows, x => x.cat);
    out.innerHTML = '<div class="card"><h2>🏦 은행 명세서 — ' + esc(file.name) + '</h2><div class="muted">' + esc(P.from) + ' ~ ' + esc(P.to) + ' · ' + P.rows.length + '줄 · 입금 <b style="color:#15803d">' + money(P.in) + '</b> · 출금 <b style="color:#b91c1c">' + money(P.out) + '</b>' + (P.bal != null ? ' · 마지막 잔액 <b>' + money(P.bal) + '</b>' : '') + '</div>' +
      '<table style="margin-top:8px;font-size:12.5px"><tr><th>분류 (자동)</th><th class="r">줄</th><th class="r">금액</th></tr>' + CATS.filter(c => byCat[c[0]]).map(c => '<tr><td>' + c[1] + '</td><td class="r">' + byCat[c[0]].length + '</td><td class="r" style="color:' + c[2] + '">' + money(sum(byCat[c[0]], x => x.amt)) + '</td></tr>').join('') + '</table>' +
      (byCat.other ? '<div class="alert a-amb" style="margin-top:8px">❓ 분류 못 한 줄 ' + byCat.other.length + '개 — 넣은 뒤 경영 → 🏦 은행에서 분류를 고르면 "이 글자는 항상 이 분류" 로 기억합니다.</div>' : '') +
      (P.warn.length ? '<div class="alert a-amb">⚠️ ' + P.warn.length + '줄은 읽지 못해 빠집니다<div style="font-size:12px;max-height:100px;overflow:auto">' + P.warn.slice(0, 20).map(esc).join('<br>') + '</div></div>' : '') +
      '<div class="hint">이미 들어 있는 줄 ' + (P.rows.length - fresh.length) + '개는 건너뛰고 새 줄 ' + fresh.length + '개만 넣습니다 (같은 날짜 · 내용 · 금액 · 잔액 = 같은 줄). 분류를 손으로 고친 줄은 그대로 둡니다.</div>' +
      '<div class="btns"><button class="b-blue" id="bkGo"' + (fresh.length ? '' : ' disabled') + '>' + fresh.length + '줄 넣기</button></div></div>';
    $('bkGo').onclick = async () => { busy(true); try { const now = new Date().toISOString(); await S.DB.batch(fresh.map(x => ({ op: 'set', col: 'bank', id: x.id, data: Object.assign({}, x, { by: S.user.email, at: now }) }))); out.innerHTML = '<div class="alert a-grn">🏦 ' + fresh.length + '줄 넣었습니다. <u data-gobank style="cursor:pointer">경영 → 🏦 은행</u>에서 분류와 대조를 확인하세요.</div>'; out.querySelectorAll('[data-gobank]').forEach(u => u.onclick = () => { location.hash = '#/mg/bank'; }); toast('🏦 ' + fresh.length + '줄', 'good'); } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; } busy(false); };
  } catch (e) { out.innerHTML = '<div class="alert a-red">' + esc(e.message) + '</div>'; }
}

/* ---------- 경영 → 🏦 은행 ---------- */
let BM = '';
export async function paintBank(box, year) {
  BM = BM && BM.startsWith(String(year)) ? BM : (String(year) === today().substring(0, 4) ? today().substring(0, 7) : year + '-12');
  box.innerHTML = '<div class="load">읽는 중…</div>';
  const yms = Array.from({ length: 12 }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
  const [all, ents, cods, fpay] = await Promise.all([S.DB.list('bank', { where: [['ym', 'in', yms.slice(0, 10)]] }).catch(() => []).then(async a => a.concat(await S.DB.list('bank', { where: [['ym', 'in', yms.slice(10)]] }).catch(() => []))),
    S.DB.list('entries', { where: [['ym', '==', BM]] }).catch(() => []), S.DB.list('cod', { where: [['ym', '==', BM]] }).catch(() => []), S.DB.list('factoryPayments').catch(() => [])]);
  if (!all.length) { box.innerHTML = '<div class="card"><h2>🏦 은행</h2><div class="none">' + year + '년 은행 명세서가 없습니다 — 관리 → 📥 가져오기에 은행 CSV · 엑셀을 올리세요 (날짜 · 내용 · 금액 또는 입금/출금 열이 있으면 알아봅니다)</div></div>'; return; }
  const byM = groupBy(all, x => x.ym), M = sortBy(all.filter(x => x.ym === BM), x => x.d + x.id, true);
  const inM = R2(sum(M.filter(x => x.amt > 0), x => x.amt)), outM = R2(-sum(M.filter(x => x.amt < 0), x => x.amt)), byCat = groupBy(M, x => x.cat);
  /* 앱과 대조 — 이 달 수금 입력(체크 · 현금 · Zelle) · COD · 카드 · ACH vs 은행 입금 분류 · 공장 송금 vs 은행 공장 송금 */
  const E = ents.filter(e => !e.void && !e.repl && !e.bounced), pm = {}; E.forEach(e => (e.pays || []).forEach(p => { pm[p.m] = R2((pm[p.m] || 0) + num(p.amt)); })); cods.filter(c => !c.void).forEach(c => { pm[c.method] = R2((pm[c.method] || 0) + num(c.amt)); });
  const bk = c => R2(sum(byCat[c] || [], x => Math.abs(x.amt)));
  const cmp = [['🧾 체크 · 현금 입금', R2((pm.CHECK || 0) + (pm.CASH || 0) + (pm.COD || 0)), bk('dep')], ['📲 Zelle', pm.ZELLE || 0, bk('zelle')], ['🏦 ACH', pm.ACH || 0, bk('achin')], ['💳 카드', pm['CREDIT CARD'] || 0, bk('card')], ['🏭 공장 송금', R2(sum(fpay.filter(p => !p.void && String(p.d || '').startsWith(BM)), p => p.amt)), bk('factory')]];
  const months = '<div class="chips">' + yms.map(m => '<button class="' + (m === BM ? 'on' : '') + '" data-bm="' + m + '" ' + (byM[m] ? '' : 'style="opacity:.45"') + '>' + Number(m.substring(5)) + '월' + (byM[m] ? ' <span class="en">' + byM[m].length + '</span>' : '') + '</button>').join('') + '</div>';
  const yr = yms.map(m => ({ m, inn: R2(sum((byM[m] || []).filter(x => x.amt > 0), x => x.amt)), out: R2(-sum((byM[m] || []).filter(x => x.amt < 0), x => x.amt)) })), mx = Math.max(1, ...yr.map(x => Math.max(x.inn, x.out)));
  box.innerHTML = '<div class="card"><h2>🏦 은행 — ' + year + '</h2>' + months +
    '<div class="bars" style="margin-top:8px">' + yr.map(x => '<div style="flex:1;display:flex;gap:1px;align-items:flex-end;height:70px" title="' + x.m + ' 입금 ' + k(x.inn) + ' · 출금 ' + k(x.out) + '"><div class="b on" style="height:' + Math.max(2, Math.round(x.inn / mx * 68)) + 'px;background:#4ade80"></div><div class="b" style="height:' + Math.max(2, Math.round(x.out / mx * 68)) + 'px;background:#fca5a5"></div></div>').join('') + '</div><div class="muted" style="font-size:11.5px">월별 입금(초록) · 출금(빨강) · 올해 입금 ' + money(sum(yr, x => x.inn)) + ' · 출금 ' + money(sum(yr, x => x.out)) + '</div></div>' +
    '<div class="card"><h2>' + Number(BM.substring(5)) + '월 — 입금 <span style="color:#15803d">' + money(inM) + '</span> · 출금 <span style="color:#b91c1c">' + money(outM) + '</span> · 순 <b>' + money(R2(inM - outM)) + '</b>' + (M.some(x => x.bal != null) ? ' · 말일 잔액 ' + money((sortBy(M.filter(x => x.bal != null), x => x.d + x.id, true)[0] || {}).bal) : '') + '</h2>' +
    '<table style="font-size:12.5px"><tr><th>분류</th><th class="r">줄</th><th class="r">금액</th></tr>' + CATS.filter(c => byCat[c[0]]).map(c => '<tr><td>' + c[1] + '</td><td class="r">' + byCat[c[0]].length + '</td><td class="r" style="color:' + c[2] + '"><b>' + money(sum(byCat[c[0]], x => x.amt)) + '</b></td></tr>').join('') + '</table>' +
    '<h2 style="margin-top:12px;font-size:14px">🔍 앱 기록과 대조 (' + Number(BM.substring(5)) + '월)</h2><table style="font-size:12.5px"><tr><th></th><th class="r">앱</th><th class="r">은행</th><th class="r">차이</th></tr>' + cmp.map(c => { const d = R2(c[1] - c[2]); return '<tr><td>' + c[0] + '</td><td class="r">' + money(c[1]) + '</td><td class="r">' + money(c[2]) + '</td><td class="r ' + (Math.abs(d) < 0.01 ? 'ok' : 'warn') + '">' + (Math.abs(d) < 0.01 ? '✓' : (d > 0 ? '+' : '−') + money(Math.abs(d))) + '</td></tr>'; }).join('') + '</table><div class="hint">체크 · 현금은 입금일이 수금일과 다를 수 있어(모아서 입금) 달 경계에서 차이가 납니다. 큰 차이는 입력 누락 · 분류 오류 · 바운스를 확인하세요.</div></div>' +
    '<div class="card"><h2>' + Number(BM.substring(5)) + '월 줄 ' + M.length + (byCat.other ? ' · <span class="warn">❓ 분류 전 ' + byCat.other.length + '</span>' : '') + '</h2>' + (M.length ? '<div class="xwrap"><table class="ledg" style="font-size:12px"><tr><th>날짜</th><th>내용</th><th class="r">금액</th><th>분류</th></tr>' + M.map(x => '<tr' + (x.cat === 'other' ? ' style="background:#fffbeb"' : '') + '><td>' + md(x.d) + '</td><td class="nt" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.desc) + '">' + esc(x.desc) + (x.manual ? ' <span class="tag t-g">손</span>' : '') + '</td><td class="r" style="color:' + (x.amt > 0 ? '#15803d' : '#b91c1c') + '"><b>' + money(x.amt) + '</b></td><td>' + sel('bc_' + x.id, CATS.map(c => [c[0], c[1]]), x.cat) + '</td></tr>').join('') + '</table></div>' : '<div class="none">없음</div>') + '</div>';
  box.querySelectorAll('[data-bm]').forEach(b => b.onclick = () => { BM = b.dataset.bm; paintBank(box, year); });
  box.querySelectorAll('select[id^="bc_"]').forEach(s2 => s2.onchange = async () => { const id = s2.id.substring(3), x = M.find(r => r.id === id), cat = s2.value;
    try { busy(true); await S.DB.update('bank', id, { cat, manual: true }); x.cat = cat; busy(false);
      const kw = keyOf(x.desc);   /* 물어볼 때는 바쁨 화면을 걷어야 창을 누를 수 있음 */
      if (kw && await confirmBox('「' + kw + '」 가 들어간 줄은 앞으로 늘 ' + catName(cat) + ' 로 분류할까요?', '규칙으로 기억')) { busy(true); const cur = (S.settings.bankRules || []).filter(r => String(r.kw).toUpperCase() !== kw); cur.unshift({ kw, cat }); await S.DB.update('settings', 'app', { bankRules: cur }); S.settings.bankRules = cur; const same = M.filter(r => r.id !== id && !r.manual && String(r.desc).toUpperCase().includes(kw) && r.cat !== cat); for (const r of same) { try { await S.DB.update('bank', r.id, { cat }); r.cat = cat; } catch (e) {} } if (same.length) toast(same.length + '줄도 같이 바꿈', 'good'); busy(false); }
      paintBank(box, year); } catch (e) { busy(false); toast('실패: ' + (e.code || e.message), 'bad'); } });
}
/** 내용에서 규칙으로 쓸 글자 — 숫자 · 날짜 · 참조번호를 뺀 앞 단어 2~3개 */
function keyOf(desc) { const w = String(desc || '').toUpperCase().replace(/[#*]/g, ' ').split(/\s+/).filter(x => x && !/^\d[\d\/\-:.]*$/.test(x) && !/^(ID|REF|CONF|TRACE|PPD|CCD|WEB|DES|INDN|CO)$/.test(x)); return w.slice(0, w.length >= 3 ? 3 : w.length).join(' ').substring(0, 30); }
/** 오너 · 관리자 홈 — 기간의 은행 입금 · 출금 · 마지막 잔액 */
export async function bankSummary(from, to) {
  const yms = []; let m = from.substring(0, 7); while (m <= to.substring(0, 7) && yms.length < 10) { yms.push(m); const y = Number(m.substring(0, 4)), mm = Number(m.substring(5, 7)); m = mm === 12 ? (y + 1) + '-01' : y + '-' + String(mm + 1).padStart(2, '0'); }
  const L = (await S.DB.list('bank', { where: [['ym', 'in', yms]] }).catch(() => [])).filter(x => x.d >= from && x.d <= to);
  if (!L.length) return null;
  const last = sortBy(L.filter(x => x.bal != null), x => x.d + x.id, true)[0];
  return { n: L.length, in: R2(sum(L.filter(x => x.amt > 0), x => x.amt)), out: R2(-sum(L.filter(x => x.amt < 0), x => x.amt)), bal: last ? last.bal : null, balD: last ? last.d : '', other: L.filter(x => x.cat === 'other').length, factory: R2(sum(L.filter(x => x.cat === 'factory'), x => -x.amt)) };
}
