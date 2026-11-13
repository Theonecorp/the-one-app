/* ============================================================
 *  🧮 AR 인보이스 대조 (v0.8.209 · 2026-11-13 관리자: "예전 시스템에서 최근 인보이스까지 모두 넣었어 — AR 을 인보이스 날짜로부터 계산해서 크로스 체크")
 *   올린 AR 파일(ar/{세일즈맨}, 기준일 asOf)과 가져온 인보이스(invoices · 옛 시스템 잔액 bal · 상태 st)를 인보이스 번호로 맞춰 봄
 *   새 AR(인보이스 기준) = 옛 시스템 미결 인보이스 잔액 − 옛 자료 뒤(cut 이후) 앱에 들어온 수금 · 나이는 인보이스 날짜부터
 *   ok 같음 · diff 금액 다름 · paid 파일엔 미결인데 옛 시스템은 완납 · noinv 인보이스 자료 없음 · extra 옛 시스템 미결인데 파일에 없음 · new 파일 기준일 뒤 발행
 *   읽기만 함 (아무것도 바꾸지 않음) — 맞으면 다음 단계에서 가게 창 · 세일즈맨 미수금을 이 기준으로
 * ============================================================ */
import { esc, money, R2, num, today, daysBetween, sortBy, groupBy, sum, invNo, toast } from './ui.js';

export const AGE = [['0-30', 0, 30], ['31-60', 31, 60], ['61-90', 61, 90], ['91-120', 91, 120], ['120+', 121, 1e9]];
export const CAT = [['ok', '✅ 같음'], ['diff', '🟡 금액 다름'], ['paid', '🔵 파일엔 미결 · 옛 시스템 완납'], ['noinv', '⚪ 인보이스 자료 없음'], ['extra', '🔴 옛 시스템 미결 · 파일에 없음'], ['new', '🆕 파일 기준일 뒤 발행']];
export const ageOf = (d, t) => { const n = d ? daysBetween(d, t) : 0; return AGE.findIndex(a => n >= a[1] && n <= a[2]); };

/** 순수 계산 (시험용으로 따로) — file: { asOf, stores:[{acct, store, sm, invs:[{inv, d, bal}]}] } · open: 미결 인보이스 · closed: 파일에 있는데 미결이 아닌 인보이스 · pays: 수금들(entries · cod) */
export function crossCheck(file, open, closed, pays, t) {
  t = t || today();
  const asOf = (file && file.asOf) || '', F = {}, rows = [];
  ((file && file.stores) || []).forEach(s => (s.invs || []).forEach(v => { const k = invNo(v.inv); if (k && !v.app) F[k] = { no: k, d: v.d || '', bal: R2(num(v.bal)), acct: s.acct || '', store: s.store || '', sm: s.sm || '' }; }));
  const leg = {}; (open || []).concat(closed || []).forEach(x => { const k = invNo(x.no || x.id); if (k && x.src !== 'credit') leg[k] = x; });
  /* 옛 자료가 끝나는 날 — 미결 인보이스의 가장 늦은 날짜 · 그 뒤 앱 수금만 뺌 (옛 시스템 잔액에 이미 들어간 수금을 두 번 빼지 않게) */
  const cut = (open || []).filter(x => x.src === 'legacy').map(x => x.d || '').sort().pop() || asOf;
  const after = {}, unv = {}; (pays || []).forEach(e => { if (e.void || e.repl || e.bounced) return; (e.invs || []).forEach(v => { const k = invNo(v.no); if (!k) return; (unv[k] = unv[k] || []).push([e.id, num(v.amt)]); if (String(e.d || '') > cut) after[k] = R2((after[k] || 0) + num(v.amt)); }); });
  /* 앱에서 발행한 인보이스는 그 문서 pays 에 없는 수금만 (💰 미수금의 앱 인보이스와 같은 셈 · arapp.js) */
  const paidOf = (k, x) => x && x.src !== 'legacy' ? R2((unv[k] || []).filter(p => !(p[0] in (x.pays || {}))).reduce((a, p) => a + p[1], 0)) : (after[k] || 0);
  const isOpen = x => x && x.st === 'open' && num(x.bal != null ? x.bal : x.total) > 0.005;
  const legBal = x => R2(num(x.bal != null ? x.bal : x.total));
  const add = (k, cat, f, x) => { const lb = x && isOpen(x) ? legBal(x) : 0, ap = paidOf(k, x), nb = x && isOpen(x) ? R2(Math.max(0, lb - ap)) : 0;
    rows.push({ no: k, cat, d: (x && x.d) || (f && f.d) || '', acct: (x && x.acct) || (f && f.acct) || '', store: (x && x.store) || (f && f.store) || '', sm: (x && x.sm) || (f && f.sm) || '', fileBal: f ? f.bal : 0, legBal: lb, legSt: x ? (x.st || '') : '', appPaid: ap, newBal: nb }); };
  Object.keys(F).forEach(k => { const f = F[k], x = leg[k];
    if (!x) return add(k, 'noinv', f, null);
    if (!isOpen(x)) return add(k, 'paid', f, x);
    add(k, Math.abs(legBal(x) - f.bal) < 0.01 ? 'ok' : 'diff', f, x); });
  Object.keys(leg).forEach(k => { const x = leg[k]; if (F[k] || !isOpen(x)) return; add(k, String(x.d || '') > asOf ? 'new' : 'extra', null, x); });
  const tot = { file: R2(sum(rows, r => r.fileBal)), now: R2(sum(rows, r => r.newBal)), age: AGE.map(() => 0), cat: {} };
  rows.forEach(r => { if (r.newBal > 0) tot.age[Math.max(0, ageOf(r.d, t))] = R2(tot.age[Math.max(0, ageOf(r.d, t))] + r.newBal); const c = tot.cat[r.cat] = tot.cat[r.cat] || { n: 0, file: 0, now: 0 }; c.n++; c.file = R2(c.file + r.fileBal); c.now = R2(c.now + r.newBal); });
  return { asOf, cut, rows, tot };
}

let CK = null, CAT_ON = 'extra', CK_SM = '';
/** 💰 미수금 화면의 🧮 인보이스 대조 칸 — box 에 그림. ctx = { S, file, ents, cods } */
export async function paintArCheck(box, ctx) {
  if (!box) return;
  if (!CK || CK.file !== ctx.file) {
    box.innerHTML = '<div class="load">인보이스 읽는 중… (옛 시스템 인보이스 · 수금 대조)</div>';
    let open = [], closed = [];
    try { open = await ctx.S.DB.list('invoices', { where: [['st', '==', 'open']] }); } catch (e) { box.innerHTML = '<div class="alert a-red">' + esc(e.code || e.message) + '</div>'; return; }
    const have = new Set(open.map(x => invNo(x.no || x.id))), want = [];
    ((ctx.file && ctx.file.stores) || []).forEach(s => (s.invs || []).forEach(v => { const k = invNo(v.inv); if (k && !have.has(k)) { have.add(k); want.push(k); } }));
    for (let i = 0; i < want.length; i += 30) { try { closed = closed.concat(await ctx.S.DB.list('invoices', { where: [['no', 'in', want.slice(i, i + 30)]] })); } catch (e) {} }
    CK = { file: ctx.file, res: crossCheck(ctx.file, open, closed, (ctx.ents || []).concat(ctx.cods || [])) };
  }
  const R = CK.res, t = today(), sms = Object.keys(groupBy(R.rows, r => r.sm || '(없음)')).sort();
  const rows = CK_SM ? R.rows.filter(r => (r.sm || '(없음)') === CK_SM) : R.rows;
  const cat = {}; rows.forEach(r => { const c = cat[r.cat] = cat[r.cat] || { n: 0, file: 0, now: 0 }; c.n++; c.file = R2(c.file + r.fileBal); c.now = R2(c.now + r.newBal); });
  const fileT = R2(sum(rows, r => r.fileBal)), nowT = R2(sum(rows, r => r.newBal)), age = AGE.map((a, i) => R2(sum(rows.filter(r => r.newBal > 0 && Math.max(0, ageOf(r.d, t)) === i), r => r.newBal)));
  const bySm = sortBy(sms.map(s => { const L = R.rows.filter(r => (r.sm || '(없음)') === s); return { sm: s, file: R2(sum(L, r => r.fileBal)), now: R2(sum(L, r => r.newBal)), bad: L.filter(r => r.cat !== 'ok' && r.cat !== 'new').length }; }), x => x.now, true);
  const list = sortBy(rows.filter(r => r.cat === CAT_ON), r => Math.max(r.fileBal, r.newBal), true);
  const k = v => money(v).replace(/\.\d\d$/, '');
  box.innerHTML = '<h2>🧮 인보이스 대조 — AR 파일 ' + esc(R.asOf) + ' ↔ 옛 시스템 인보이스 (~' + esc(R.cut) + ')</h2>' +
    '<div class="muted" style="font-size:12.5px">읽기만 합니다. 새 AR = 옛 시스템 미결 인보이스 잔액 − ' + esc(R.cut) + ' 뒤 앱에 들어온 수금 · 나이는 인보이스 날짜부터</div>' +
    '<div class="seg" style="margin-top:8px"><button class="' + (CK_SM ? '' : 'on') + '" data-cksm="">전체</button>' + sms.map(s => '<button class="' + (CK_SM === s ? 'on' : '') + '" data-cksm="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>' +
    '<div class="kpi" style="grid-template-columns:repeat(3,1fr);margin-top:8px"><div><b>' + k(fileT) + '</b><span>AR 파일</span></div><div><b>' + k(nowT) + '</b><span>새 AR (인보이스 기준)</span></div><div><b class="' + (Math.abs(nowT - fileT) > 1 ? 'warn' : '') + '">' + k(R2(nowT - fileT)) + '</b><span>차이</span></div></div>' +
    '<div class="kpi" style="grid-template-columns:repeat(5,1fr)">' + AGE.map((a, i) => '<div class="k' + i + '"><b style="font-size:11.5px">' + k(age[i]) + '</b><span>' + a[0] + '일</span></div>').join('') + '</div>' +
    '<div class="chips" id="ckCats">' + CAT.map(c => { const x = cat[c[0]] || { n: 0, file: 0, now: 0 }; return '<button class="' + (CAT_ON === c[0] ? 'on' : '') + '" data-ckc="' + c[0] + '">' + c[1] + ' ' + x.n + '</button>'; }).join('') + '</div>' +
    (CK_SM ? '' : '<table style="font-size:12.5px;margin-top:6px"><tr><th>세일즈맨</th><th class="r">AR 파일</th><th class="r">새 AR</th><th class="r">차이</th><th class="r">확인할 것</th></tr>' + bySm.map(x => '<tr class="tap" data-cksm="' + esc(x.sm) + '"><td><b>' + esc(x.sm) + '</b></td><td class="r">' + k(x.file) + '</td><td class="r">' + k(x.now) + '</td><td class="r ' + (Math.abs(x.now - x.file) > 1 ? 'warn' : '') + '">' + k(R2(x.now - x.file)) + '</td><td class="r">' + x.bad + '</td></tr>').join('') + '</table>') +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><b>' + esc((CAT.find(c => c[0] === CAT_ON) || ['', ''])[1]) + ' · ' + list.length + '장 · 파일 ' + money(sum(list, r => r.fileBal)) + ' · 새 AR ' + money(sum(list, r => r.newBal)) + '</b><button class="b-ghost b-sm" id="ckCsv">📊 CSV</button></div>' +
    '<div style="overflow:auto;max-height:520px"><table class="cktab" style="font-size:12px"><tr><th>인보이스</th><th>날짜</th><th>가게</th><th>담당</th><th class="r">AR 파일</th><th class="r">옛 시스템</th><th class="r">앱 수금(뒤)</th><th class="r">새 AR</th><th class="r">나이</th></tr>' +
    list.slice(0, 400).map(r => '<tr><td><b>' + esc(r.no) + '</b></td><td>' + esc(r.d) + '</td><td>' + esc(r.store) + ' <small class="muted">' + esc(r.acct) + '</small></td><td>' + esc(r.sm) + '</td><td class="r">' + (r.fileBal ? money(r.fileBal) : '—') + '</td><td class="r">' + (r.legSt ? (r.legSt === 'open' ? money(r.legBal) : '<span class="muted">' + esc(r.legSt === 'paid' ? '완납' : r.legSt) + '</span>') : '<span class="muted">없음</span>') + '</td><td class="r">' + (r.appPaid ? money(r.appPaid) : '') + '</td><td class="r"><b>' + (r.newBal ? money(r.newBal) : '—') + '</b></td><td class="r">' + (r.d ? daysBetween(r.d, t) + '일' : '') + '</td></tr>').join('') +
    '</table>' + (list.length > 400 ? '<div class="hint">처음 400장만 — 전부는 📊 CSV</div>' : '') + '</div>';
  box.querySelectorAll('[data-cksm]').forEach(b => b.onclick = () => { CK_SM = b.dataset.cksm; paintArCheck(box, ctx); });
  box.querySelectorAll('[data-ckc]').forEach(b => b.onclick = () => { CAT_ON = b.dataset.ckc; paintArCheck(box, ctx); });
  box.querySelector('#ckCsv').onclick = () => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = ['구분,인보이스,날짜,계정,가게,담당,AR파일,옛시스템상태,옛시스템잔액,앱수금(뒤),새AR,나이(일)'].concat(sortBy(rows, r => r.cat + r.sm + r.no).map(r => [(CAT.find(c => c[0] === r.cat) || ['', r.cat])[1], r.no, r.d, r.acct, r.store, r.sm, r.fileBal, r.legSt, r.legBal, r.appPaid, r.newBal, r.d ? daysBetween(r.d, t) : ''].map(q).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'AR-대조-' + t + (CK_SM ? '-' + CK_SM : '') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); toast('📊 CSV', 'good');
  };
}
