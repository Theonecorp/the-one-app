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
  ['factory', '🏭 공장 송금', '#b91c1c', 'out'], ['payroll', '👥 급여 · 커미션', '#b91c1c', 'out'], ['tax', '🏛 세금', '#b91c1c', 'out'], ['ship', '🚚 운송 (UPS · 화물)', '#b91c1c', 'out'], ['rent', '🏢 임대 · 공과금', '#b91c1c', 'out'], ['ccpay', '💳 카드 대금 결제', '#b91c1c', 'out'], ['fee', '🏦 은행 수수료', '#b91c1c', 'out'], ['bounce', '↩️ 바운스 (Returned)', '#b91c1c', 'out'], ['checkout', '🖊 발행 체크 (Checks paid)', '#b91c1c', 'out'], ['xfer', '🔁 계좌 이체', '#64748b', ''], ['other', '❓ 기타 · 분류 전', '#64748b', '']];
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
  const MS = await bankMonths(year);
  const msTable = MS.length ? '<div class="card"><h2>📄 월별 명세서 요약 — ' + year + '</h2><table style="font-size:12.5px"><tr><th>월</th><th class="r">기초</th><th class="r">입금</th><th class="r">출금</th><th class="r">기말</th><th class="r">순</th></tr>' + MS.map(x => '<tr><td><b>' + Number(x.ym.substring(5)) + '월</b>' + (x.rows ? ' <small class="muted">' + x.rows + '줄</small>' : '') + '</td><td class="r">' + (x.begin != null ? money(x.begin) : '—') + '</td><td class="r" style="color:#15803d"><b>' + money(x.in) + '</b></td><td class="r" style="color:#b91c1c"><b>' + money(x.out) + '</b></td><td class="r">' + (x.end != null ? money(x.end) : '—') + '</td><td class="r ' + (x.in - x.out >= 0 ? 'ok' : 'warn') + '">' + money(R2(x.in - x.out)) + '</td></tr>').join('') + '<tr class="tot"><td>합계</td><td></td><td class="r" style="color:#15803d"><b>' + money(sum(MS, x => x.in)) + '</b></td><td class="r" style="color:#b91c1c"><b>' + money(sum(MS, x => x.out)) + '</b></td><td></td><td class="r"><b>' + money(R2(sum(MS, x => x.in - x.out))) + '</b></td></tr></table><div class="hint">매달 PDF 명세서를 관리 → 📥 가져오기에 올리면 이 표에 쌓입니다.</div></div>' : '';
  if (!all.length) { box.innerHTML = msTable + '<div class="card"><h2>🏦 은행</h2><div class="none">' + (MS.length ? year + '년은 월별 요약만 있습니다 (거래 줄 없음) — 분류 · 대조는 거래 줄이 읽힌 명세서에서만' : year + '년 은행 명세서가 없습니다 — 관리 → 📥 가져오기에 매달 PDF(또는 CSV · 엑셀)를 올리세요') + '</div></div>'; return; }
  const byM = groupBy(all, x => x.ym), M = sortBy(all.filter(x => x.ym === BM), x => x.d + x.id, true);
  const inM = R2(sum(M.filter(x => x.amt > 0), x => x.amt)), outM = R2(-sum(M.filter(x => x.amt < 0), x => x.amt)), byCat = groupBy(M, x => x.cat);
  /* 앱과 대조 — 이 달 수금 입력(체크 · 현금 · Zelle) · COD · 카드 · ACH vs 은행 입금 분류 · 공장 송금 vs 은행 공장 송금 */
  const E = ents.filter(e => !e.void && !e.repl && !e.bounced), pm = {}; E.forEach(e => (e.pays || []).forEach(p => { pm[p.m] = R2((pm[p.m] || 0) + num(p.amt)); })); cods.filter(c => !c.void).forEach(c => { pm[c.method] = R2((pm[c.method] || 0) + num(c.amt)); });
  const bk = c => R2(sum(byCat[c] || [], x => Math.abs(x.amt)));
  const cmp = [['🧾 체크 · 현금 입금', R2((pm.CHECK || 0) + (pm.CASH || 0) + (pm.COD || 0)), bk('dep')], ['📲 Zelle', pm.ZELLE || 0, bk('zelle')], ['🏦 ACH', pm.ACH || 0, bk('achin')], ['💳 카드', pm['CREDIT CARD'] || 0, bk('card')], ['🏭 공장 송금', R2(sum(fpay.filter(p => !p.void && String(p.d || '').startsWith(BM)), p => p.amt)), bk('factory')]];
  const months = '<div class="chips">' + yms.map(m => '<button class="' + (m === BM ? 'on' : '') + '" data-bm="' + m + '" ' + (byM[m] ? '' : 'style="opacity:.45"') + '>' + Number(m.substring(5)) + '월' + (byM[m] ? ' <span class="en">' + byM[m].length + '</span>' : '') + '</button>').join('') + '</div>';
  const yr = yms.map(m => ({ m, inn: R2(sum((byM[m] || []).filter(x => x.amt > 0), x => x.amt)), out: R2(-sum((byM[m] || []).filter(x => x.amt < 0), x => x.amt)) })), mx = Math.max(1, ...yr.map(x => Math.max(x.inn, x.out)));
  box.innerHTML = msTable + '<div class="card"><h2>🏦 은행 거래 줄 — ' + year + '</h2>' + months +
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
  if (!L.length) {   /* 거래 줄이 없으면 월별 요약(PDF) 로 — 기간에 든 달만 */
    const MS = (await S.DB.list('bankM').catch(() => [])).filter(x => yms.includes(x.ym)); if (!MS.length) return null;
    const last = sortBy(MS, x => x.ym, true)[0];
    return { n: 0, in: R2(sum(MS, x => x.in)), out: R2(sum(MS, x => x.out)), bal: last.end != null ? last.end : null, balD: last.to || last.ym + '-31', other: 0, factory: 0, months: MS.map(x => x.ym) };
  }
  const last = sortBy(L.filter(x => x.bal != null), x => x.d + x.id, true)[0];
  return { n: L.length, in: R2(sum(L.filter(x => x.amt > 0), x => x.amt)), out: R2(-sum(L.filter(x => x.amt < 0), x => x.amt)), bal: last ? last.bal : null, balD: last ? last.d : '', other: L.filter(x => x.cat === 'other').length, factory: R2(sum(L.filter(x => x.cat === 'factory'), x => -x.amt)) };
}

/* ============================================================
 *  📄 PDF 명세서 — 매달 은행 PDF 를 올리면 입금 합계 · 출금 합계 · 기초/기말 잔액을 뽑아 bankM/{ym} 에, 거래 줄이 읽히면 bank/ 에도
 *    pdf.js(cdnjs) 로 글자를 뽑아 줄로 묶음 → ① 요약 글귀(Beginning Balance · Deposits and Additions · Withdrawals/Checks/Fees · Ending Balance)
 *    ② 거래 줄(MM/DD 내용 금액) — 구역 제목(DEPOSITS / WITHDRAWALS / CHECKS PAID / FEES)으로 입금 · 출금 판단 (체이스 · BofA · Wells 식)
 *    요약을 못 찾으면 거래 줄 합으로, 둘 다 없으면 안내만. 월은 명세서 기간(through MM/DD/YYYY) 또는 거래 날짜에서
 * ============================================================ */
let PDFJS = null;
async function pdfjs() {
  if (PDFJS) return PDFJS;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  PDFJS = window.pdfjsLib; PDFJS.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return PDFJS;
}
/** PDF → 줄 글자 배열 (페이지 순, 같은 y 끼리 묶고 x 순) */
export async function pdfLines(file) {
  const lib = await pdfjs(), buf = await file.arrayBuffer(), doc = await lib.getDocument({ data: buf }).promise, out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), tc = await page.getTextContent(), rows = {};
    tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const y = Math.round(it.transform[5] / 3) * 3, x = it.transform[4]; (rows[y] = rows[y] || []).push({ x, s: it.str }); });
    Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => { out.push(rows[y].sort((a, b) => a.x - b.x).map(z => z.s).join(' ').replace(/\s+/g, ' ').trim()); });
  }
  return out;
}
const AMT = '\\(?-?\\$?([\\d,]+\\.\\d{2})\\)?', money2 = s => { const neg = /^\(|-/.test(s); const n = Number(String(s).replace(/[^0-9.]/g, '')); return isNaN(n) ? null : (neg ? -n : n); };
/** 글자 줄 → { ym, from, to, begin, in, out, end, rows, warn, how } */
export function parseBankText(lines, fileName) {
  const L = (lines || []).map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean), txt = L.join('\n');
  /* 기간 · 연도 */
  let from = '', to = '';
  const MON = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12, JAN: 1, FEB: 2, MAR: 3, APR: 4, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
  const long = s => { const m = String(s).match(/([A-Za-z]+)\.? (\d{1,2}),? (\d{4})/); if (m && MON[m[1].toUpperCase()]) return m[3] + '-' + String(MON[m[1].toUpperCase()]).padStart(2, '0') + '-' + m[2].padStart(2, '0'); const n = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (n) return (n[3].length === 2 ? '20' + n[3] : n[3]) + '-' + n[1].padStart(2, '0') + '-' + n[2].padStart(2, '0'); return ''; };
  let m = txt.match(/([A-Za-z]+\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:through|to|-|–|thru)\s*([A-Za-z]+\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) { from = long(m[1]); to = long(m[2]); }
  if (!to) { m = txt.match(/(?:Statement (?:Period|Date|Ending)|Ending Date|As of|For the period ending|Closing Date)[:\s]*([A-Za-z]+\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i); if (m) to = long(m[1]); }
  const year = (to || from || '').substring(0, 4) || String(new Date().getFullYear());
  /* 요약 */
  const grab = re => { const r = txt.match(re); return r ? money2(r[1]) : null; };
  const begin = grab(new RegExp('(?:Beginning|Opening|Previous|Starting) Balance[^\\n$\\d]*' + AMT, 'i'));
  const end = grab(new RegExp('(?:Ending|Closing|New) Balance[^\\n$\\d]*' + AMT, 'i'));
  let inn = grab(new RegExp('(?:Deposits and Additions|Deposits and Other Additions|Deposits and other credits|Total Deposits(?: and Credits)?|Deposits\\/Credits|Total Credits|Additions)[^\\n$\\d]*' + AMT, 'i'));
  let outT = null; const outParts = [];
  ['Checks Paid', 'ATM & Debit Card Withdrawals', 'Electronic Withdrawals', 'Withdrawals and Other Subtractions', 'Withdrawals and other debits', 'Other Withdrawals', 'Total Withdrawals(?: and Debits)?', 'Withdrawals\\/Debits', 'Total Debits', 'Fees', 'Service Fees', 'Subtractions'].forEach(k => { const v = grab(new RegExp(k + '[^\\n$\\d]*' + AMT, 'i')); if (v != null) outParts.push([k, Math.abs(v)]); });
  if (outParts.length) { const tot = outParts.find(p => /^Total|Subtractions|Withdrawals\\\/Debits/.test(p[0])); outT = tot ? tot[1] : R2(outParts.reduce((a, p) => a + p[1], 0)); }
  /* 거래 줄 — 구역 제목으로 부호 */
  const rows = [], warn = []; let sign = 0, cur = '';
  const seen = {};
  L.forEach(ln => {
    const U = ln.toUpperCase();
    if (/^(DEPOSITS AND ADDITIONS|DEPOSITS AND OTHER ADDITIONS|DEPOSITS AND OTHER CREDITS|DEPOSITS|CREDITS|ADDITIONS)\b/.test(U)) { sign = 1; cur = U; return; }
    if (/^(CHECKS PAID|ATM & DEBIT CARD WITHDRAWALS|ELECTRONIC WITHDRAWALS|WITHDRAWALS AND OTHER SUBTRACTIONS|WITHDRAWALS AND OTHER DEBITS|OTHER WITHDRAWALS|WITHDRAWALS|DEBITS|FEES|SERVICE FEES|SUBTRACTIONS|CHECKS)\b/.test(U)) { sign = -1; cur = U; return; }
    if (/^(DAILY ENDING BALANCE|DAILY BALANCE|BALANCE SUMMARY|ACCOUNT SUMMARY|SUMMARY)/.test(U)) { sign = 0; cur = ''; return; }
    if (!sign) return;
    let r = ln.match(new RegExp('^(\\d{1,2}\\/\\d{1,2})(?:\\/\\d{2,4})?\\s+(.+?)\\s+' + AMT + '(?:\\s+' + AMT + ')?$'));
    let d = '', desc = '', amt = null;
    if (r) { d = r[1]; desc = r[2]; amt = money2(r[3]); }
    else { const c = ln.match(new RegExp('^(\\d{3,6})\\s*[\\^*]?\\s*(\\d{1,2}\\/\\d{1,2})\\s+' + AMT + '$')); if (c && sign < 0) { d = c[2]; desc = 'CHECK #' + c[1]; amt = money2(c[3]); } }
    if (!d || amt == null) return;
    const [mm, dd] = d.split('/'); const dt = year + '-' + mm.padStart(2, '0') + '-' + dd.padStart(2, '0');
    const val = R2(sign * Math.abs(amt)), cat = /CHECK #/.test(desc) ? 'other' : categorize(desc, val);
    let id = 'BK' + dt.replace(/-/g, '') + '-' + hash(desc + '|' + val + '|'); if (seen[id]) { seen[id]++; id += '-' + seen[id]; } else seen[id] = 1;
    rows.push({ id, d: dt, ym: dt.substring(0, 7), desc, amt: val, bal: null, cat: /CHECK #/.test(desc) ? 'checkout' : cat, file: fileName || '', sec: cur });
  });
  const rin = R2(sum(rows.filter(x => x.amt > 0), x => x.amt)), rout = R2(-sum(rows.filter(x => x.amt < 0), x => x.amt));
  if (inn == null && rows.length) inn = rin; if (outT == null && rows.length) outT = rout;
  const ym = (to || (rows[0] && rows[0].d) || '').substring(0, 7);
  if (inn != null && rows.length && Math.abs(rin - inn) > 0.01) warn.push('거래 줄 입금 합 ' + money(rin) + ' ≠ 요약 입금 ' + money(inn) + ' (읽지 못한 줄이 있을 수 있음)');
  if (outT != null && rows.length && Math.abs(rout - outT) > 0.01) warn.push('거래 줄 출금 합 ' + money(rout) + ' ≠ 요약 출금 ' + money(outT));
  return { ym, from, to, begin, in: inn, out: outT, end, rows, warn, how: inn != null || outT != null ? (rows.length ? 'summary+rows' : 'summary') : 'none', outParts };
}
export async function bankPdfFile(file, out) {
  out.innerHTML = '<div class="load">PDF 글자 읽는 중…</div>';
  try {
    const lines = await pdfLines(file); const P = parseBankText(lines, file.name);
    if (P.how === 'none') { out.innerHTML = '<div class="alert a-red">이 PDF 에서 입금 · 출금 합계를 찾지 못했습니다. 글자가 아닌 그림(스캔)이거나 요약 글귀가 다른 은행입니다.<div class="muted" style="font-size:12px;margin-top:6px;max-height:160px;overflow:auto">' + lines.slice(0, 40).map(esc).join('<br>') + '</div><div class="hint">위 줄을 캡처해 보내 주시면 그 은행 형식을 추가하겠습니다. 당장은 아래 칸에 입금 · 출금 합계를 직접 넣어도 됩니다.</div>' + manualBox(P) + '</div>'; bindManual(out, P, file.name); return; }
    out.innerHTML = '<div class="card"><h2>📄 ' + esc(file.name) + '</h2><div class="muted">' + (P.from ? esc(P.from) + ' ~ ' : '') + esc(P.to || P.ym) + (P.ym ? ' · <b>' + P.ym + '</b>' : '') + '</div>' +
      '<div class="kpi" style="grid-template-columns:repeat(4,1fr);margin-top:8px"><div><b>' + (P.begin != null ? money(P.begin) : '—') + '</b><span>기초 잔액</span></div><div style="background:#dcfce7"><b>' + (P.in != null ? money(P.in) : '—') + '</b><span>입금 합계</span></div><div style="background:#fee2e2"><b>' + (P.out != null ? money(P.out) : '—') + '</b><span>출금 합계</span></div><div><b>' + (P.end != null ? money(P.end) : '—') + '</b><span>기말 잔액</span></div></div>' +
      (P.outParts && P.outParts.length > 1 ? '<div class="muted" style="font-size:12px;margin-top:4px">출금 내역: ' + P.outParts.map(p => esc(p[0]) + ' ' + money(p[1])).join(' · ') + '</div>' : '') +
      (P.begin != null && P.end != null && P.in != null && P.out != null && Math.abs(R2(P.begin + P.in - P.out) - P.end) > 0.01 ? '<div class="alert a-amb" style="margin-top:6px">⚠️ 기초 + 입금 − 출금 ≠ 기말 (차이 ' + money(R2(P.begin + P.in - P.out - P.end)) + ') — 요약 글귀를 일부 잘못 읽었을 수 있습니다. 숫자를 확인하고 아래에서 고치세요.</div>' : '') +
      '<div class="muted" style="font-size:12px;margin-top:6px">거래 줄 ' + P.rows.length + '개 읽음' + (P.rows.length ? ' (입금 ' + P.rows.filter(x => x.amt > 0).length + ' · 출금 ' + P.rows.filter(x => x.amt < 0).length + ') — 🏦 은행 탭에서 분류 · 대조에 쓰입니다' : ' — 요약만 넣습니다') + '</div>' +
      (P.warn.length ? '<div class="alert a-amb">' + P.warn.map(esc).join('<br>') + '</div>' : '') + manualBox(P) +
      '<div class="btns"><button class="b-blue" id="bpGo">이 달 넣기</button></div></div>';
    bindManual(out, P, file.name);
  } catch (e) { out.innerHTML = '<div class="alert a-red">PDF 를 읽지 못했습니다: ' + esc(e.message) + '</div>'; }
}
const manualBox = P => '<div class="two" style="margin-top:8px"><div class="fg"><label>월 (YYYY-MM)</label><input id="bpYm" value="' + esc(P.ym || '') + '" placeholder="2026-10"></div><div class="fg"><label>기초 잔액</label><input id="bpB" inputmode="decimal" value="' + (P.begin != null ? P.begin : '') + '" style="text-align:right"></div></div><div class="two"><div class="fg"><label>입금 합계 *</label><input id="bpI" inputmode="decimal" value="' + (P.in != null ? P.in : '') + '" style="text-align:right;color:#15803d;font-weight:800"></div><div class="fg"><label>출금 합계 *</label><input id="bpO" inputmode="decimal" value="' + (P.out != null ? P.out : '') + '" style="text-align:right;color:#b91c1c;font-weight:800"></div></div><div class="fg"><label>기말 잔액</label><input id="bpE" inputmode="decimal" value="' + (P.end != null ? P.end : '') + '" style="text-align:right"></div>' + (P.how === 'none' ? '<div class="btns"><button class="b-blue" id="bpGo">이 달 넣기</button></div>' : '');
function bindManual(out, P, fileName) {
  const go = out.querySelector('#bpGo'); if (!go) return;
  go.onclick = async () => {
    const ym = out.querySelector('#bpYm').value.trim(), inn = num(out.querySelector('#bpI').value), o = num(out.querySelector('#bpO').value);
    if (!/^\d{4}-\d{2}$/.test(ym)) return toast('월을 YYYY-MM 으로 넣으세요', 'bad'); if (!inn && !o) return toast('입금 · 출금 합계를 넣으세요', 'bad');
    busy(true);
    try {
      const now = new Date().toISOString(), doc = { id: ym, ym, begin: num(out.querySelector('#bpB').value) || null, in: R2(inn), out: R2(o), end: num(out.querySelector('#bpE').value) || null, from: P.from || '', to: P.to || '', file: fileName || '', rows: P.rows.length, by: S.user.email, at: now };
      const ops = [{ op: 'set', col: 'bankM', id: ym, data: doc }];
      if (P.rows.length) { const have = new Set((await S.DB.list('bank', { where: [['ym', '==', ym]] }).catch(() => [])).map(x => x.id)); P.rows.filter(x => !have.has(x.id)).forEach(x => ops.push({ op: 'set', col: 'bank', id: x.id, data: Object.assign({}, x, { by: S.user.email, at: now }) })); }
      await S.DB.batch(ops);
      out.innerHTML = '<div class="alert a-grn">🏦 ' + ym + ' — 입금 ' + money(doc.in) + ' · 출금 ' + money(doc.out) + (ops.length > 1 ? ' · 거래 줄 ' + (ops.length - 1) + '개' : '') + ' 넣었습니다. <u data-gobank style="cursor:pointer">경영 → 🏦 은행</u></div>';
      out.querySelectorAll('[data-gobank]').forEach(u => u.onclick = () => { location.hash = '#/mg/bank'; }); toast('🏦 ' + ym, 'good');
    } catch (e) { toast('실패: ' + (e.code || e.message), 'bad'); }
    busy(false);
  };
}
/** 월별 요약(bankM) — 🏦 탭 위 표 · 홈 현금 흐름 (거래 줄이 없을 때) */
export async function bankMonths(year) { return sortBy((await S.DB.list('bankM').catch(() => [])).filter(x => String(x.ym || '').startsWith(String(year))), x => x.ym); }
